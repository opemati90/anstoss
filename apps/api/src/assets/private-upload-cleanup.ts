import { PrismaClient } from '@prisma/client'
import { PrivateUploadLedger, PrivateUploadScope } from './private-upload-ledger'
import { PrivateUploadRecovery } from './private-upload-recovery'
import { PrivateUploadStorage } from './private-upload-storage'

/** Internal cleanup executor; not a user-authorized deletion endpoint.
 * The trusted caller supplies a tenant-scoped intent. No timestamps are treated
 * as evidence that an ambiguous provider operation has completed.
 */
export class PrivateUploadCleanup {
  private readonly recovery: PrivateUploadRecovery

  constructor(
    private readonly prisma: Pick<PrismaClient, '$transaction'>,
    private readonly storage: Pick<PrivateUploadStorage,
      'abort' | 'remove' | 'discover' | 'observeObject' | 'observeMultipart'>,
    private readonly ledger = new PrivateUploadLedger(),
  ) {
    this.recovery = new PrivateUploadRecovery(prisma, storage, ledger)
  }

  async run(scope: PrivateUploadScope): Promise<
    'unchanged' | 'removed' | 'aborted' | 'held' | 'unknown' | 'conflict' | 'reconciled' | 'awaiting-part-cleanup'
  > {
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await this.ledger.snapshot(tx, scope)
      if (!current || current.state === 'REMOVED') return current
      // ATTACHED expiry is irrelevant: never expire a published message.
      if (!current.cancelRequestedAt) {
        if (current.state === 'ATTACHED' || current.expiresAt.getTime() > Date.now()) return null
        // Never proceed to provider cleanup unless the expiry cancellation was
        // recorded. A lost update must stay retryable, not be treated as intent.
        if (!await this.ledger.cancel(tx, scope)) throw new Error('Private upload cancellation was not recorded')
        return this.ledger.snapshot(tx, scope)
      }
      return current
    })
    if (!row) return 'unchanged'
    if (row.state === 'REMOVED') return 'removed'
    if (row.operationId) {
      // Reconciliation observes storage only; never repeats uncertain writes.
      try {
        const result = await this.recovery.reconcile(scope)
        return result === 'settled' ? 'reconciled' : result
      } catch { return 'unknown' }
    }
    if (row.state === 'ABORTED') {
      // Abort acknowledgement, NoSuchUpload and an absent final object do not
      // prove that a pre-issued UploadPart request cannot finish later. Keep
      // the reservation charged until the provider offers a definitive part-
      // byte erasure receipt. Do not retry abort: its outcome is ambiguous too.
      return 'awaiting-part-cleanup'
    }
    const operation = row.state === 'UPLOADING' ? 'abort'
      : row.state === 'READY' || row.state === 'ATTACHED' ? 'remove' : null
    if (!operation) return 'unchanged'
    // Do not hold the snapshot's upload lock here. Removal locks the bound
    // message before the upload, and rechecks live-message/evidence holds.
    const claim = await this.prisma.$transaction((tx) => this.ledger.begin(tx, scope, operation))
    if (!claim) return 'held'
    try {
      if (operation === 'abort') {
        if (!claim.uploadId) return 'unknown'
        await this.storage.abort(claim.objectKey, claim.uploadId)
      } else {
        await this.storage.remove(claim.objectKey)
      }
      const settled = await this.prisma.$transaction((tx) =>
        this.ledger.settle(tx, scope, operation, claim.operationId),
      )
      if (!settled) return 'unchanged'
      return operation === 'abort' ? 'aborted' : 'removed'
    } catch {
      // Pending operation remains durable; do not log provider capabilities.
      return 'unknown'
    }
  }
}
