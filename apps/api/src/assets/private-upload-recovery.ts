import { PrismaClient } from '@prisma/client'
import { PrivateUploadLedger, PrivateUploadScope } from './private-upload-ledger'
import { PrivateUploadStorage } from './private-upload-storage'

/**
 * Read-only provider reconciliation for ambiguous lifecycle operations.
 * Not scheduled or exposed through HTTP yet. Absence cannot settle a write.
 * Cancellation is preserved by ledger settlement. No retries of provider writes.
 */
export class PrivateUploadRecovery {
  constructor(
    private readonly prisma: Pick<PrismaClient, '$transaction'>,
    private readonly storage: Pick<PrivateUploadStorage, 'discover' | 'observeObject' | 'observeMultipart'>,
    private readonly ledger = new PrivateUploadLedger(),
  ) {}

  async reconcile(
    scope: PrivateUploadScope,
  ): Promise<'settled' | 'unknown' | 'conflict' | 'unchanged'> {
    const row = await this.prisma.$transaction((tx) => this.ledger.snapshot(tx, scope))
    if (!row?.operationId) return 'unchanged'
    if (row.state === 'INITIATING') {
      const found = await this.storage.discover(row.objectKey)
      if (found.truncated || found.uploadIds.length === 0) return 'unknown'
      if (found.uploadIds.length !== 1) return 'conflict'
      const settled = await this.prisma.$transaction((tx) =>
        this.ledger.settle(tx, scope, 'initiate', row.operationId!, found.uploadIds[0]),
      )
      return settled ? 'settled' : 'unchanged'
    }
    if (row.state === 'FINALIZING') {
      const observed = await this.storage.observeObject(row.objectKey)
      if (observed.kind === 'not_observed') return 'unknown'
      if (observed.bytes !== row.expectedBytes || observed.contentType !== row.contentType)
        return 'conflict'
      const settled = await this.prisma.$transaction((tx) =>
        this.ledger.settle(tx, scope, 'complete', row.operationId!),
      )
      return settled ? 'settled' : 'unchanged'
    }
    if (row.state === 'ABORTING') {
      if (!row.uploadId) return 'conflict'
      const observed = await this.storage.observeMultipart(row.objectKey, row.uploadId)
      if (observed.kind === 'present') return 'unknown'
      // This upload ID was acknowledged at initiation and could never enter
      // FINALIZING while ABORTING. Missing session closes finalization, but is
      // NOT a claim that in-flight part bytes have already been purged.
      const settled = await this.prisma.$transaction((tx) =>
        this.ledger.settle(tx, scope, 'abort', row.operationId!),
      )
      return settled ? 'settled' : 'unchanged'
    }
    if (row.state === 'REMOVING') {
      // Entry requires a definitively completed, never-reused final object;
      // clients have only part capabilities. No final PUT/complete can remain
      // pending in this state. A prior delete may still finish, which is safe.
      const observed = await this.storage.observeObject(row.objectKey)
      if (observed.kind === 'present') return 'unknown'
      const settled = await this.prisma.$transaction((tx) =>
        this.ledger.settle(tx, scope, 'remove', row.operationId!),
      )
      return settled ? 'settled' : 'unchanged'
    }
    return 'unchanged'
  }
}
