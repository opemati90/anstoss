import { PrismaClient } from '@prisma/client'
import { PrivateUploadLedger, PrivateUploadScope } from './private-upload-ledger'
import { PrivateUploadStorage } from './private-upload-storage'

/**
 * Read-only provider reconciliation for ambiguous initiation/completion.
 * Not scheduled or exposed through HTTP yet. Absence never advances the state.
 * Cancellation is preserved by ledger settlement. No retries of provider writes.
 */
export class PrivateUploadRecovery {
  constructor(
    private readonly prisma: Pick<PrismaClient, '$transaction'>,
    private readonly storage: Pick<PrivateUploadStorage, 'discover' | 'observeObject'>,
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
    return 'unchanged'
  }
}
