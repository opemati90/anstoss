import { router } from 'expo-router'
import type { ConversationKind } from './inboxModel'

export type ConversationRouteParams = {
  kind: ConversationKind
  id: string
  /** Team the channel lives in (null for club-level channels and DMs). */
  teamId?: string | null
  /** Title to show before the detail request lands. */
  title?: string
}

function params(p: ConversationRouteParams) {
  return {
    id: p.id,
    kind: p.kind,
    ...(p.teamId ? { teamId: p.teamId } : {}),
    ...(p.title ? { title: p.title } : {}),
  }
}

export function openConversation(p: ConversationRouteParams) {
  router.push({ pathname: '/chat/[id]', params: params(p) } as never)
}

/** Used when a modal (new chat) hands over to the conversation. */
export function replaceWithConversation(p: ConversationRouteParams) {
  router.replace({ pathname: '/chat/[id]', params: params(p) } as never)
}

export function openConversationInfo(p: ConversationRouteParams) {
  router.push({ pathname: '/chat/[id]/info', params: params(p) } as never)
}
