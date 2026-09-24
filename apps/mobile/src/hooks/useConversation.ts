import { useCallback, useMemo } from 'react'
import { useChat, type ChatMessage, type ConnectionState } from './useChat'
import { useDmChat, type DmMessage } from './useDmChat'
import type { ConversationKind } from '../components/chat/inboxModel'

type Options = {
  kind: ConversationKind
  conversationId: string
  /** Channel's team (or a team of the reader for club-level channels). */
  teamId: string | null
  clubId: string
  token: string | null
  userId: string
  apiUrl: string
}

export function dmToChatMessage(message: DmMessage): ChatMessage {
  return {
    id: message.id,
    teamId: '',
    channelId: null,
    clientMessageId: message.clientMessageId ?? null,
    senderId: message.senderId,
    senderName: message.senderName || message.sender?.name || null,
    senderAvatar: message.sender?.avatarUrl ?? null,
    content: message.content,
    translation: message.translation ?? null,
    messageType: message.messageType ?? 'TEXT',
    attachmentUrl: message.attachmentUrl ?? null,
    attachmentMeta: message.attachmentMeta ?? null,
    replyToId: message.replyToId ?? null,
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          senderName: message.replyTo.senderName ?? '',
          contentPreview: message.replyTo.contentPreview,
          messageType: message.replyTo.messageType,
        }
      : null,
    reactions: message.reactions ?? [],
    deletedAt: message.deletedAt ?? null,
    createdAt: message.createdAt,
  }
}

export type ConversationCapabilities = {
  reactions: boolean
  replies: boolean
  edit: boolean
  /** Photo/video, file and voice attachments. */
  media: boolean
  /** Manager compose sheet (poll, event card, team lineup). Channels only. */
  compose: boolean
  pin: boolean
  /** DM "Aufstellung teilen" (event lineup or formation card). */
  shareLineup: boolean
}

const DM_CAPABILITIES: ConversationCapabilities = {
  reactions: true,
  replies: true,
  edit: false,
  media: true,
  compose: false,
  pin: false,
  shareLineup: true,
}
const CHANNEL_CAPABILITIES: ConversationCapabilities = {
  reactions: true,
  replies: true,
  edit: true,
  media: true,
  compose: true,
  pin: true,
  shareLineup: false,
}

/**
 * One message surface for channels and direct messages. Both transports are
 * mounted (hooks cannot be conditional); the inactive one receives empty ids
 * and stays idle.
 */
export function useConversation({
  kind,
  conversationId,
  teamId,
  clubId,
  token,
  userId,
  apiUrl,
}: Options) {
  const isDm = kind === 'dm'
  const channel = useChat({
    clubId,
    teamId: isDm ? '' : teamId ?? '',
    channelId: isDm ? null : conversationId,
    token: isDm ? null : token,
    userId,
    apiUrl,
  })
  const dm = useDmChat({
    conversationId: isDm ? conversationId : '',
    token: isDm ? token : null,
    userId,
    apiUrl,
    clubId,
  })

  const dmMessages = useMemo(() => dm.messages.map(dmToChatMessage), [dm.messages])
  // Stable identities: screens put these in focus-effect deps.
  const noop = useCallback(() => undefined, [])
  const dmMarkAsRead = dm.markAsRead
  const dmSetIsAtBottom = useCallback(
    (atBottom: boolean) => {
      if (atBottom) dmMarkAsRead()
    },
    [dmMarkAsRead],
  )

  const send = useCallback(
    (content: string, replyToId?: string | null, options?: { isAnnouncement?: boolean }) =>
      isDm ? dm.sendMessage(content, replyToId) : channel.sendMessage(content, clubId, replyToId, options),
    [channel, clubId, dm, isDm],
  )

  const dmReact = dm.react
  const dmDelete = dm.deleteMessage
  const dmReactTo = useCallback((id: string, emoji: string) => void dmReact(id, emoji, true), [dmReact])
  const dmUnreact = useCallback((id: string, emoji: string) => void dmReact(id, emoji, false), [dmReact])
  const dmDeleteMessage = useCallback((id: string) => dmDelete(id), [dmDelete])

  if (isDm) {
    return {
      ...channel,
      messages: dmMessages,
      pinnedMessage: null,
      connectionState: dm.connectionState as ConnectionState,
      lastError: dm.lastError,
      historyLoaded: dm.historyLoaded,
      typingUsers: dm.typingUsers,
      hasMore: dm.hasMore,
      loadingHistory: dm.loadingHistory,
      unreadCount: 0,
      send,
      sendTyping: dm.sendTyping,
      loadMore: dm.loadMore,
      markRead: dmMarkAsRead,
      setIsAtBottom: dmSetIsAtBottom,
      refreshHistory: noop,
      reactToMessage: dmReactTo,
      unreactToMessage: dmUnreact,
      deleteMessage: dmDeleteMessage,
      peerLastReadAt: dm.peerLastReadAt,
      sendDmAttachment: dm.sendAttachment,
      sendDmLineup: dm.sendLineup,
      capabilities: DM_CAPABILITIES,
    }
  }
  return {
    ...channel,
    send,
    markRead: noop,
    peerLastReadAt: null as string | null,
    sendDmAttachment: null,
    sendDmLineup: null,
    capabilities: CHANNEL_CAPABILITIES,
  }
}

export type ConversationApi = ReturnType<typeof useConversation>
