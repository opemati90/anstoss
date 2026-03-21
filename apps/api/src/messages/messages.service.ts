import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pin a message. Only one pinned message per team at a time —
   * unpins any existing pinned message first.
   */
  async pinMessage(messageId: string, teamId: string) {
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
  async unpinMessage(messageId: string, teamId: string) {
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
   * Get the currently pinned message for a team.
   */
  async getPinnedMessage(teamId: string) {
    return this.prisma.message.findFirst({
      where: { teamId, isPinned: true },
      include: {
        sender: {
          select: { id: true, name: true },
        },
      },
    })
  }
}
