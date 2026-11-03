import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/client'
import { PrivateUploadLedger, PrivateUploadScope } from './private-upload-ledger'
import { PrivateUploadStorage } from './private-upload-storage'
import { privateMediaReserveSchema, type PrivateMediaReserveInput, type PrivateMediaStatus } from '@anstoss/shared'

type AuthorizedUpload = {
  userId: string
  clubId: string
  targetId: string
  targetType: 'CHANNEL' | 'DM'
  teamId?: string
}

/** Internal coordinator; HTTP routes and client rollout are not enabled yet.
 * Authorization must take the same lifecycle locks as membership revocation.
 * The operation claim commits before provider I/O. No provider write is retried
 * after an exception: recovery must establish its outcome first.
 */
export class PrivateUploadCoordinator {
  constructor(
    private readonly prisma: Pick<PrismaClient, '$transaction'>,
    private readonly storage: Pick<PrivateUploadStorage, 'initiate' | 'prepareComplete' | 'completePrepared' | 'signPart'>,
    private readonly ledger = new PrivateUploadLedger(),
  ) {}

  async reserve(
    identity: { clubId: string; ownerId: string },
    input: PrivateMediaReserveInput,
    authorize: (tx: Prisma.TransactionClient) => Promise<AuthorizedUpload>,
  ) {
    const parsed = privateMediaReserveSchema.safeParse(input)
    if (!parsed.success) throw new BadRequestException('Invalid upload reservation')
    return this.prisma.$transaction(async (tx) => {
      const target = await authorize(tx)
      if (target.userId !== identity.ownerId || target.clubId !== identity.clubId
        || !target.targetId || !['CHANNEL', 'DM'].includes(target.targetType)
        || (target.targetType === 'CHANNEL' && !target.teamId)) {
        throw new ForbiddenException('Upload scope does not match authorized target')
      }
      const user = await tx.user.findUnique({ where: { id: identity.ownerId }, select: { deletedAt: true } })
      if (!user || user.deletedAt) throw new ForbiddenException('Account unavailable')
      const row = await this.ledger.reserve(tx, {
        clubId: identity.clubId, ownerId: identity.ownerId, targetId: target.targetId,
        targetType: target.targetType, contentType: parsed.data.contentType,
        expectedBytes: parsed.data.expectedBytes, reserveRequestId: parsed.data.requestId,
        reservedMessageType: parsed.data.messageType, reservedTeamId: target.targetType === 'CHANNEL' ? target.teamId : undefined,
      })
      return { id: row.id, expiresAt: row.expiresAt.toISOString() }
    }, { timeout: 15_000 })
  }

  private async authorizedSnapshot(
    tx: Prisma.TransactionClient,
    scope: PrivateUploadScope,
    authorize: (tx: Prisma.TransactionClient) => Promise<AuthorizedUpload>,
  ) {
    const target = await authorize(tx)
    if (target.userId !== scope.ownerId || target.clubId !== scope.clubId
        || !target.targetId || !['CHANNEL', 'DM'].includes(target.targetType)
        || (target.targetType === 'CHANNEL' && !target.teamId)) {
      throw new ForbiddenException('Upload scope does not match authorized target')
    }
    const user = await tx.user.findUnique({ where: { id: scope.ownerId }, select: { deletedAt: true } })
    if (!user || user.deletedAt) throw new ForbiddenException('Account unavailable')
    const row = await this.ledger.snapshot(tx, scope)
    if (!row || row.targetType !== target.targetType || row.targetId !== target.targetId
      || (row.reserveRequestId && target.targetType === 'CHANNEL' && row.reservedTeamId !== target.teamId)) {
      throw new ForbiddenException('Upload target unavailable')
    }
    return row
  }

  async status(
    scope: PrivateUploadScope,
    authorize: (tx: Prisma.TransactionClient) => Promise<AuthorizedUpload>,
  ): Promise<PrivateMediaStatus> {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.authorizedSnapshot(tx, scope, authorize)
      const status: PrivateMediaStatus['status'] = row.cancelRequestedAt
        || ['ABORTING', 'ABORTED', 'REMOVING', 'REMOVED'].includes(row.state) ? 'CANCELLED'
        : row.state === 'ATTACHED' ? 'PUBLISHED'
        : row.expiresAt.getTime() <= Date.now() ? 'EXPIRED'
        : row.state === 'RESERVED' ? 'RESERVED'
        : row.state === 'UPLOADING' ? 'UPLOADING'
        : row.state === 'READY' ? 'READY' : 'PROCESSING'
      return { id: row.id, status, expiresAt: row.expiresAt.toISOString() }
    }, { timeout: 15_000 })
  }

  async cancel(
    scope: PrivateUploadScope,
    authorize: (tx: Prisma.TransactionClient) => Promise<AuthorizedUpload>,
  ): Promise<{ cancelled: true }> {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.authorizedSnapshot(tx, scope, authorize)
      // A client upload cancellation is never a message deletion endpoint.
      if (row.messageId || row.state === 'ATTACHED') {
        throw new BadRequestException('Published uploads must be managed through their message')
      }
      // Removed reservations have no active provider operation and a retry is
      // already satisfied. Otherwise acknowledge only a durable cancellation.
      if (row.state === 'REMOVED' && !row.operationId) return { cancelled: true as const }
      if (!await this.ledger.cancel(tx, scope)) {
        throw new ServiceUnavailableException('Upload cancellation could not be recorded. Try again.')
      }
      // This acknowledges cancellation only, not physical storage erasure.
      return { cancelled: true as const }
    }, { timeout: 15_000 })
  }

  async signPart(
    scope: PrivateUploadScope,
    authorize: (tx: Prisma.TransactionClient) => Promise<AuthorizedUpload>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.authorizedSnapshot(tx, scope, authorize)
      const signingDate = new Date(Date.now())
      const expiresIn = Math.min(300, Math.floor((row.expiresAt.getTime() - signingDate.getTime()) / 1000))
      if (row.state !== 'UPLOADING' || row.operationId || !row.uploadId
        || row.cancelRequestedAt || expiresIn < 1) {
        throw new BadRequestException('Upload is not accepting parts')
      }
      // Hold the upload lock while signing, so complete/cancel cannot change
      // state mid-issuance. This capability cannot complete a multipart object.
      const expiresAt = new Date(signingDate.getTime() + expiresIn * 1000)
      let uploadUrl: string
      try {
        uploadUrl = await this.storage.signPart(row.objectKey, row.uploadId, row.expectedBytes, expiresIn, signingDate)
      } catch {
        throw new ServiceUnavailableException('Upload signing is temporarily unavailable')
      }
      if (Date.now() >= expiresAt.getTime()) throw new BadRequestException('Upload capability expired')
      return { uploadUrl, method: 'PUT' as const, expiresAt: expiresAt.toISOString(),
        headers: { 'Content-Length': String(row.expectedBytes) } }
    }, { timeout: 15_000 })
  }

  async advance(
    scope: PrivateUploadScope,
    operation: 'initiate' | 'complete',
    authorize: (tx: Prisma.TransactionClient) => Promise<AuthorizedUpload>,
  ): Promise<'settled' | 'unknown' | 'unchanged'> {
    if (operation !== 'initiate' && operation !== 'complete') {
      throw new BadRequestException('Invalid upload operation')
    }
    let prepared: { objectKey: string; uploadId: string; expectedBytes: number; etag: string } | undefined
    if (operation === 'complete') {
      // A missing/incomplete part or a failed read has not dispatched a
      // provider completion. Keep the reservation retryable in UPLOADING.
      const snapshot = await this.prisma.$transaction(async (tx) => {
        const row = await this.authorizedSnapshot(tx, scope, authorize)
        if (row.state !== 'UPLOADING' || row.operationId || !row.uploadId || row.cancelRequestedAt
          || row.expiresAt.getTime() <= Date.now()) return null
        return { objectKey: row.objectKey, uploadId: row.uploadId, expectedBytes: row.expectedBytes }
      }, { timeout: 15_000 })
      if (!snapshot) return 'unchanged'
      try {
        prepared = { ...snapshot, etag: await this.storage.prepareComplete(snapshot.objectKey, snapshot.uploadId, snapshot.expectedBytes) }
      } catch {
        // Provider errors may contain URLs and identifiers; never relay them.
        throw new ServiceUnavailableException('Upload is not ready to finish. Try again.')
      }
    }
    const claim = await this.prisma.$transaction(async (tx) => {
      await this.authorizedSnapshot(tx, scope, authorize)
      const result = await this.ledger.begin(tx, scope, operation)
      if (result && prepared && (result.objectKey !== prepared.objectKey || result.uploadId !== prepared.uploadId
        || result.expectedBytes !== prepared.expectedBytes)) throw new BadRequestException('Upload changed; try again')
      return result
    }, { timeout: 15_000 })
    if (!claim) return 'unchanged'

    try {
      const uploadId = operation === 'initiate'
        ? await this.storage.initiate(claim.objectKey, claim.contentType)
        : undefined
      if (operation === 'complete') {
        if (!claim.uploadId || !prepared) return 'unknown'
        await this.storage.completePrepared(claim.objectKey, claim.uploadId, prepared.etag)
      }
      // No authorization is required to record a provider receipt: cancellation
      // may have arrived during I/O and must remain recorded by settle().
      const settled = await this.prisma.$transaction((tx) =>
        this.ledger.settle(tx, scope, operation, claim.operationId, uploadId),
      )
      return settled ? 'settled' : 'unchanged'
    } catch {
      // Provider errors can contain signed URLs or identifiers. Keep them out
      // of API responses/logs; pending state is the durable recovery signal.
      return 'unknown'
    }
  }
}
