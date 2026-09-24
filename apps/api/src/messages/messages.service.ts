import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { AgeGateService } from '../auth/age-gate.service'
import { PrismaService } from '../prisma/prisma.service'
import { TeamsService } from '../teams/teams.service'
import { ChannelsService } from '../channels/channels.service'

/**
 * Pinned messages. M5: a pin belongs to its CHANNEL (one per channel), not
 * to the team — pinning in the Trainerteam channel must not unpin the team
 * channel's notice, and a pin is only ever shown inside its own channel.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly channelsService: ChannelsService,
    @Optional() private readonly ageGate?: AgeGateService,
  ) {}

  /** Managers of the message's channel may pin; the previous pin is replaced. */
  async pinMessage(messageId: string, teamId: string, userId: string) {
    const message = await this.loadManagedMessage(messageId, teamId, userId)

    await this.prisma.message.updateMany({
      where: message.channelId
        ? { channelId: message.channelId, isPinned: true }
        : { teamId, channelId: null, isPinned: true },
      data: { isPinned: false },
    })

    return this.prisma.message.update({
      where: { id: messageId },
      data: { isPinned: true },
    })
  }

  async unpinMessage(messageId: string, teamId: string, userId: string) {
    await this.loadManagedMessage(messageId, teamId, userId)
    return this.prisma.message.update({
      where: { id: messageId },
      data: { isPinned: false },
    })
  }

  /**
   * The pinned message of one channel the caller can read. Without a
   * channelId there is no channel context, so nothing is returned (the
   * team-wide pin leaked private-channel pins before).
   */
  async getPinnedMessage(teamId: string, userId: string, channelId?: string) {
    if (!channelId) return null
    const access = await this.channelsService.getChannelAccess(userId, channelId)
    if (!access.canRead) return null

    return this.prisma.message.findFirst({
      where: { channelId, isPinned: true, deletedAt: null },
      include: {
        sender: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  private async loadManagedMessage(messageId: string, teamId: string, userId: string) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId },
      select: { id: true, teamId: true, channelId: true, deletedAt: true },
    })
    if (!message || message.deletedAt) throw new NotFoundException('Message not found')
    if (message.channelId) {
      const access = await this.channelsService.getChannelAccess(userId, message.channelId)
      if (!access.canRead || !access.isManager) {
        throw new ForbiddenException('Only managers of this channel can pin')
      }
      // Same age gate as sending into the channel.
      await this.ageGate?.assertAllowed(userId, {
        clubId: access.channel.clubId,
        teamId: access.channel.teamId,
      })
      return message
    }
    if (message.teamId !== teamId) throw new NotFoundException('Message not found')
    await this.teamsService.assertManageAccess(userId, teamId)
    return message
  }
}
