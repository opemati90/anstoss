import type { Prisma } from '@prisma/client'
import { BadRequestException } from '@nestjs/common'
import type { PrivateMediaPublishInput, PrivateMediaReserveInput } from '@anstoss/shared'
import type { ChannelsService } from '../channels/channels.service'
import type { DmService } from '../dm/dm.service'
import type { PrivateUploadCoordinator } from './private-upload-coordinator'
import type { PrivateUploadReads } from './private-upload-reads'
import type { PrivateUploadPublisher } from './private-upload-publisher'

type Actor = { userId: string; clubId: string }
type Destination = { kind: 'CHANNEL'; teamId: string; channelId: string }
  | { kind: 'DM'; conversationId: string }

/** Internal composition only. Not registered as an HTTP controller or active
 * upload route. Callers must obtain the actor from the authenticated session. */
export class PrivateChatMediaFacade {
  constructor(
    private readonly channels: Pick<ChannelsService, 'authorizePrivateUpload'>,
    private readonly dms: Pick<DmService, 'authorizePrivateUpload' | 'authorizePrivateMediaRead'>,
    private readonly coordinator: Pick<PrivateUploadCoordinator, 'reserve' | 'status' | 'cancel' | 'advance' | 'signPart'>,
    private readonly reads: Pick<PrivateUploadReads, 'signForMessage'>,
    private readonly publisher: Pick<PrivateUploadPublisher, 'publish'>,
  ) {}

  private authorize(actor: Actor, destination: Destination, mode: 'read' | 'write') {
    const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256
    if (!actor || !validId(actor.userId) || !validId(actor.clubId) || !destination
      || (destination.kind === 'CHANNEL' && (!validId(destination.teamId) || !validId(destination.channelId)))
      || (destination.kind === 'DM' && !validId(destination.conversationId))
      || !['CHANNEL', 'DM'].includes((destination as { kind?: string }).kind ?? '')) {
      throw new BadRequestException('Invalid private media scope')
    }
    return (tx: Prisma.TransactionClient) => destination.kind === 'CHANNEL'
      ? this.channels.authorizePrivateUpload(actor.userId, actor.clubId, destination.teamId, destination.channelId, mode, tx)
      : mode === 'read'
        ? this.dms.authorizePrivateMediaRead(actor.userId, actor.clubId, destination.conversationId, tx)
        : this.dms.authorizePrivateUpload(actor.userId, actor.clubId, destination.conversationId, tx)
  }

  reserve(actor: Actor, destination: Destination, input: PrivateMediaReserveInput) {
    const authorize = this.authorize(actor, destination, 'write')
    return this.coordinator.reserve({ clubId: actor.clubId, ownerId: actor.userId }, input, authorize)
  }

  status(actor: Actor, destination: Destination, uploadId: string) {
    const authorize = this.authorize(actor, destination, 'write')
    return this.coordinator.status({ id: uploadId, clubId: actor.clubId, ownerId: actor.userId }, authorize)
  }

  cancel(actor: Actor, destination: Destination, uploadId: string) {
    const authorize = this.authorize(actor, destination, 'write')
    return this.coordinator.cancel({ id: uploadId, clubId: actor.clubId, ownerId: actor.userId }, authorize)
  }

  read(actor: Actor, destination: Destination, messageId: string) {
    const authorize = this.authorize(actor, destination, 'read')
    return this.reads.signForMessage({ userId: actor.userId, clubId: actor.clubId, messageId }, authorize)
  }

  advance(actor: Actor, destination: Destination, uploadId: string, operation: 'initiate' | 'complete') {
    const authorize = this.authorize(actor, destination, 'write')
    return this.coordinator.advance({ id: uploadId, clubId: actor.clubId, ownerId: actor.userId }, operation, authorize)
  }

  signPart(actor: Actor, destination: Destination, uploadId: string) {
    const authorize = this.authorize(actor, destination, 'write')
    return this.coordinator.signPart({ id: uploadId, clubId: actor.clubId, ownerId: actor.userId }, authorize)
  }

  publish(actor: Actor, destination: Destination, uploadId: string, input: PrivateMediaPublishInput) {
    const authorize = this.authorize(actor, destination, 'write')
    return this.publisher.publish({ id: uploadId, clubId: actor.clubId, ownerId: actor.userId }, input, authorize)
  }
}
