import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TeamsService } from '../teams/teams.service'
import { ChannelsService } from '../channels/channels.service'

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly channelsService: ChannelsService,
  ) {}

  /**
   * Pin a message. Only one pinned message per team at a time —
   * unpins any existing pinned message first.
   */
  async pinMessage(messageId: string, teamId: string, userId: string) {
    await this.teamsService.assertManageAccess(userId, teamId)

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, teamId },
    })

    if (!message) {
      throw new NotFoundException('Message not found')
    }

    // Unpin existing pinned message in this team
    await this.prisma.message.updateMany({
      where: { teamId, isPinned: true },
      data: { isPinned: false },
    })

    return this.prisma.message.update({
      where: { id: messageId },
      data: { isPinned: true },
    })
  }

  /**
   * Unpin a message.
   */
  async unpinMessage(messageId: string, teamId: string, userId: string) {
    await this.teamsService.assertManageAccess(userId, teamId)

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, teamId },
    })

    if (!message) {
      throw new NotFoundException('Message not found')
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: { isPinned: false },
    })
  }

  /**
   * Get the currently pinned message for a team — scoped to channels
   * the requesting user can read. Without the channel filter, a pinned
   * Coaches lineup or Parents notice surfaces to every team member
   * who hits this endpoint.
   */
  async getPinnedMessage(teamId: string, userId: string) {
    await this.teamsService.assertReadableAccess(userId, teamId)

    const visibleChannels = await this.channelsService.listForUser(userId, teamId)
    const visibleChannelIds = visibleChannels.map((c) => c.id)

    return this.prisma.message.findFirst({
      where: {
        teamId,
        isPinned: true,
        OR: [{ channelId: null }, { channelId: { in: visibleChannelIds } }],
      },
      include: {
        sender: {
          select: { id: true, name: true },
        },
      },
    })
  }
}
