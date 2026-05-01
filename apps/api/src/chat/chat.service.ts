import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { ChatMessage, MessageType, MessageAttachmentMeta } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { TeamsService } from '../teams/teams.service'

const REACTION_EMOJIS = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏'])

const EDIT_WINDOW_MS = 15 * 60 * 1000

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
  ) {}

  async addReaction(
    userId: string,
    messageId: string,
    emoji: string,
  ): Promise<ChatMessage> {
    if (!REACTION_EMOJIS.has(emoji)) {
      throw new BadRequestException('Unsupported reaction emoji')
    }
    const message = await this.loadAccessibleMessage(userId, messageId)

    await this.prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: { messageId, userId, emoji },
      },
      create: { messageId, userId, emoji },
      update: {},
    })

    return this.serializeMessage(userId, message.id)
  }

  async removeReaction(
    userId: string,
    messageId: string,
    emoji: string,
  ): Promise<ChatMessage> {
    const message = await this.loadAccessibleMessage(userId, messageId)
    await this.prisma.messageReaction.deleteMany({
      where: { messageId, userId, emoji },
    })
    return this.serializeMessage(userId, message.id)
  }

  async editMessage(
    userId: string,
    messageId: string,
    content: string,
  ): Promise<ChatMessage> {
    const trimmed = content.trim()
    if (trimmed.length === 0) {
      throw new BadRequestException('Edited content cannot be empty')
    }
    if (trimmed.length > 2000) {
      throw new BadRequestException('Edited content too long')
    }

    const message = await this.loadAccessibleMessage(userId, messageId)
    if (message.senderId !== userId) {
      throw new ForbiddenException('Only the sender can edit this message')
    }
    if (message.deletedAt) {
      throw new BadRequestException('Cannot edit a deleted message')
    }
    if (message.messageType !== 'TEXT') {
      throw new BadRequestException('Only text messages can be edited')
    }
    if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new BadRequestException('Edit window has passed')
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { content: trimmed, editedAt: new Date() },
    })

    return this.serializeMessage(userId, messageId)
  }

  async deleteMessage(userId: string, messageId: string): Promise<ChatMessage> {
    const message = await this.loadAccessibleMessage(userId, messageId)
    const isCoach = await this.userIsTeamCoach(userId, message.teamId)
    if (message.senderId !== userId && !isCoach) {
      throw new ForbiddenException('Only the sender or a coach can delete')
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        content: '',
        attachmentUrl: null,
        attachmentMeta: null as never,
      },
    })

    return this.serializeMessage(userId, messageId)
  }

  async markRead(userId: string, messageId: string): Promise<{ readAt: string }> {
    const message = await this.loadAccessibleMessage(userId, messageId)
    if (message.senderId === userId) {
      // Sender doesn't need a receipt for their own message
      return { readAt: new Date().toISOString() }
    }
    const receipt = await this.prisma.messageReadReceipt.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId },
      update: {},
    })
    return { readAt: receipt.readAt.toISOString() }
  }

  async serializeMessage(userId: string, messageId: string): Promise<ChatMessage> {
    const m: any = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
        reactions: true,
        reads: true,
        replyTo: {
          select: {
            id: true,
            content: true,
            messageType: true,
            sender: { select: { name: true } },
          },
        },
      },
    })

    const reactionMap = new Map<string, Set<string>>()
    for (const r of m.reactions as Array<{ emoji: string; userId: string }>) {
      const set = reactionMap.get(r.emoji) || new Set<string>()
      set.add(r.userId)
      reactionMap.set(r.emoji, set)
    }
    const reactions = Array.from(reactionMap.entries()).map(([emoji, set]) => ({
      emoji,
      userIds: Array.from(set),
      count: set.size,
    }))

    const reads = m.reads as Array<{ userId: string }>
    const readByMe = reads.some((r) => r.userId === userId)
    const readCount = reads.filter((r) => r.userId !== m.senderId).length

    return {
      id: m.id,
      teamId: m.teamId,
      clubId: m.clubId,
      channelId: m.channelId,
      senderId: m.senderId,
      content: m.content,
      messageType: m.messageType as MessageType,
      attachmentUrl: m.attachmentUrl,
      attachmentMeta: (m.attachmentMeta as MessageAttachmentMeta | null) ?? null,
      replyToId: m.replyToId,
      isAnnouncement: m.isAnnouncement,
      isPinned: m.isPinned,
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
      senderName: m.sender.name,
      senderAvatar: m.sender.avatarUrl,
      reactions,
      readByMe,
      readCount,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            senderName: m.replyTo.sender.name,
            contentPreview: previewFor(m.replyTo.content, m.replyTo.messageType),
            messageType: m.replyTo.messageType as MessageType,
          }
        : null,
    }
  }

  private async loadAccessibleMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    })
    if (!message) throw new NotFoundException('Message not found')
    await this.teamsService.assertReadableAccess(userId, message.teamId)
    return message
  }

  private async userIsTeamCoach(userId: string, teamId: string): Promise<boolean> {
    const access = await this.prisma.teamAccess.findFirst({
      where: { userId, teamId, status: 'ACTIVE' },
    })
    if (!access) return false
    return access.role === 'HEAD_COACH' || access.role === 'ASSISTANT_COACH'
  }
}

function previewFor(content: string, type: string): string {
  if (type === 'VOICE') return '🎙 Voice note'
  if (type === 'IMAGE') return '📷 Photo'
  if (type === 'VIDEO') return '🎬 Video'
  if (type === 'FILE') return '📎 File'
  if (type === 'POLL') return '📊 Poll'
  if (type === 'RSVP_POLL') return '📋 RSVP poll'
  if (type === 'LINEUP') return '🟢 Lineup'
  return content.slice(0, 80)
}
