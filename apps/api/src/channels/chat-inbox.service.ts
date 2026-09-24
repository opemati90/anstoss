import { Injectable } from '@nestjs/common'
import type { InboxItem, MessageType } from '@anstoss/shared'
import { ChannelsService, type DecoratedChannel } from './channels.service'
import { DmService } from '../dm/dm.service'

const PREVIEW_LENGTH = 80

/**
 * Raw preview for the inbox row. Clients localize by message type (IMAGE →
 * "Foto", POLL → "Umfrage: …"), so this is always the stored content, never
 * an emoji/English label.
 */
export function inboxPreview(content: string | null | undefined): string {
  const flat = (content ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > PREVIEW_LENGTH ? flat.slice(0, PREVIEW_LENGTH) : flat
}

/**
 * The WhatsApp-style chat inbox: every channel the caller can read in the
 * club (team channels across all their teams, club channels once, their
 * groups) plus their direct conversations, newest activity first.
 */
@Injectable()
export class ChatInboxService {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly dmService: DmService,
  ) {}

  async getInbox(userId: string, clubId: string): Promise<InboxItem[]> {
    const [channels, conversations] = await Promise.all([
      this.channelsService.listInboxChannels(userId, clubId),
      this.dmService.listConversations(userId, clubId),
    ])

    const items: InboxItem[] = [
      ...channels.map((channel) => channelItem(channel)),
      ...conversations.map((conversation) => {
        const last = conversation.lastMessage
        const createdAt = toIso(conversation.createdAt ?? conversation.updatedAt)
        return {
          type: 'DM' as const,
          id: conversation.id,
          teamId: null,
          teamName: null,
          kind: 'DM' as const,
          title: conversation.otherUser?.name ?? '',
          avatarUrl: conversation.otherUser?.avatarUrl ?? null,
          otherUserId: conversation.otherUser?.id ?? null,
          // Readable history, but no new messages once the peer left the club.
          canWrite: conversation.peerIsMember !== false,
          muted: !!conversation.muted,
          mutedUntil: conversation.mutedUntil ? toIso(conversation.mutedUntil) : null,
          unreadCount: conversation.unreadCount,
          lastMessage: last
            ? {
                senderId: last.senderId ?? null,
                senderName: last.senderName ?? null,
                preview: inboxPreview(last.content),
                type: (last.messageType ?? 'TEXT') as MessageType,
                createdAt: toIso(last.createdAt),
              }
            : null,
          activityAt: last ? toIso(last.createdAt) : createdAt,
        }
      }),
    ]

    return items.sort((a, b) => b.activityAt.localeCompare(a.activityAt))
  }
}

function channelItem(channel: DecoratedChannel): InboxItem {
  const last = channel.lastMessageRaw
  return {
    type: 'CHANNEL',
    id: channel.id,
    teamId: channel.teamId,
    teamName: channel.teamName,
    kind: channel.kind,
    title: channel.name,
    avatarUrl: null,
    otherUserId: null,
    canWrite: channel.canWrite,
    muted: channel.muted,
    mutedUntil: channel.mutedUntil,
    unreadCount: channel.unreadCount,
    lastMessage: last
      ? {
          senderId: last.senderId,
          senderName: last.senderName,
          preview: inboxPreview(last.content),
          type: last.type,
          createdAt: last.createdAt,
        }
      : null,
    activityAt: last ? last.createdAt : channel.createdAt,
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
