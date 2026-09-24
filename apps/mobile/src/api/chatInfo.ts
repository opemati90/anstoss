import type { ChatMediaItem, ChatMediaTab, ReportReason } from '@anstoss/shared'
import { api } from './client'
import type { ConversationKind } from '../components/chat/inboxModel'

/**
 * Chat info endpoints (chat revamp, inbox/info fork): the shared-content
 * tabs, per-item signed media URLs and the DM report used by the info
 * screen's "Nutzer melden" sheet.
 */

export function fetchChatMedia(
  clubId: string,
  kind: ConversationKind,
  id: string,
  tab: ChatMediaTab,
) {
  const base =
    kind === 'dm' ? `/clubs/${clubId}/conversations/${id}` : `/clubs/${clubId}/channels/${id}`
  return api<ChatMediaItem[]>(`${base}/media?tab=${tab}`)
}

/** 1h signed GET for one attachment; null when storage has no signed path. */
export function fetchSignedMediaUrl(
  clubId: string,
  kind: ConversationKind,
  conversationId: string,
  messageId: string,
) {
  const path =
    kind === 'dm'
      ? `/clubs/${clubId}/conversations/${conversationId}/messages/${messageId}/media-url`
      : `/messages/${messageId}/media-url`
  return api<{ url: string | null }>(path)
}

export type { ReportReason } from '@anstoss/shared'

export function reportDirectMessage(messageId: string, reason: ReportReason) {
  return api<{ ok: true }>(`/direct-messages/${messageId}/report`, {
    method: 'POST',
    body: { reason },
  })
}

export type PeerMessage = { id: string; content: string; messageType: string; createdAt: string }

/**
 * The peer's recent messages in a DM, newest first. "Nutzer melden" lets the
 * reporter pick exactly which one goes to the moderators (M6): never an
 * implicit "latest message".
 */
export async function fetchPeerMessages(
  clubId: string,
  conversationId: string,
  peerId: string,
  limit = 10,
): Promise<PeerMessage[]> {
  const page = await api<{
    messages?: Array<{
      id: string
      senderId: string
      content: string
      messageType?: string
      deletedAt?: string | null
      createdAt?: string
    }>
  }>(`/clubs/${clubId}/conversations/${conversationId}/messages`)
  return (page?.messages ?? [])
    .filter((m) => m.senderId === peerId && !m.deletedAt)
    .reverse()
    .slice(0, limit)
    .map((m) => ({
      id: m.id,
      content: m.content ?? '',
      messageType: m.messageType ?? 'TEXT',
      createdAt: m.createdAt ?? '',
    }))
}
