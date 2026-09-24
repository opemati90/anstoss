import type {
  Channel,
  ChatChannelDetail,
  ChatChannelMember,
  ChatContactGroup,
  ChatConversationDetail,
  CreateGroupChannelInput,
} from '@anstoss/shared'
import { api } from './client'
import type { ConversationKind } from '../components/chat/inboxModel'

/** Thin wrappers over the chat endpoints so screens don't hand-build URLs. */

export function muteConversation(
  clubId: string,
  kind: ConversationKind,
  id: string,
  muted: boolean,
) {
  const path =
    kind === 'dm' ? `/clubs/${clubId}/conversations/${id}` : `/clubs/${clubId}/channels/${id}`
  return api<{ muted: boolean; mutedUntil: string | null }>(path, {
    method: 'PATCH',
    body: { muted, mutedUntil: null },
  })
}

export function markConversationRead(clubId: string, kind: ConversationKind, id: string) {
  if (kind === 'dm') {
    return api(`/clubs/${clubId}/conversations/${id}/read`, { method: 'PUT' })
  }
  return api(`/clubs/${clubId}/channels/${id}/read`, { method: 'POST' })
}

export function fetchChannelDetail(clubId: string, channelId: string) {
  return api<ChatChannelDetail>(`/clubs/${clubId}/channels/${channelId}`)
}

export function fetchConversationDetail(clubId: string, conversationId: string) {
  return api<ChatConversationDetail>(`/clubs/${clubId}/conversations/${conversationId}`)
}

export function fetchChannelMembers(clubId: string, channelId: string) {
  return api<ChatChannelMember[]>(`/clubs/${clubId}/channels/${channelId}/members`)
}

export function addChannelMembers(clubId: string, channelId: string, userIds: string[]) {
  return api<{ added: number }>(`/clubs/${clubId}/channels/${channelId}/members`, {
    method: 'POST',
    body: { userIds },
  })
}

export function removeChannelMember(clubId: string, channelId: string, userId: string) {
  return api<{ removed: boolean }>(`/clubs/${clubId}/channels/${channelId}/members/${userId}`, {
    method: 'DELETE',
  })
}

export function fetchChatContacts(clubId: string) {
  return api<ChatContactGroup[]>(`/clubs/${clubId}/chat/contacts`)
}

export function createGroupChannel(clubId: string, input: CreateGroupChannelInput) {
  return api<Channel>(`/clubs/${clubId}/channels`, { method: 'POST', body: input })
}

export function openDirectConversation(clubId: string, participantId: string) {
  return api<{ id: string }>(`/clubs/${clubId}/conversations`, {
    method: 'POST',
    body: { participantId },
  })
}
