import type {
  ChatChannelDetail,
  ChatChannelMember,
  ChatContactGroup,
  ChatConversationDetail,
  InboxItem,
} from '@anstoss/shared'
import {
  buildE2EDmMessages,
  buildE2EInbox,
  E2E_CHANNELS,
  E2E_DM_PHOTO_URL,
  E2E_LINEUP_SLOTS,
  type E2EPersona,
} from './chatSeed'
import type { DmMessage } from '../hooks/useDmChat'

/**
 * Request mocks for the chat revamp (inbox, conversation detail, members,
 * contacts, mute, read, create group, polls). session.ts delegates here so
 * the chat surface stays in one file. State (mutes, reads, created groups)
 * lives for the session and resets when the scenario changes.
 */

type ChatMockResponse =
  | { handled: false }
  | { handled: true; ok: boolean; status: number; body?: unknown; message?: string }

type ChatMockSession = {
  scenario: string
  user: { id: string; name: string }
  teamMembers: Array<{ team: { id: string; displayName: string } }>
}

type ChatState = {
  key: string
  overrides: Map<string, Partial<InboxItem>>
  created: InboxItem[]
  members: Map<string, Set<string>>
  pollVotes: Map<string, string>
}

let state: ChatState | null = null

function stateFor(session: ChatMockSession): ChatState {
  const key = `${session.scenario}:${session.user.id}`
  if (!state || state.key !== key) {
    state = { key, overrides: new Map(), created: [], members: new Map(), pollVotes: new Map() }
  }
  return state
}

function personaOf(scenario: string): E2EPersona | null {
  const base = scenario.replace(/^signup-/, '')
  if (base === 'player' || base === 'coach' || base === 'club-admin' || base === 'parent') return base
  return null
}

const ROSTER: ChatChannelMember[] = [
  { userId: 'user-coach-1', name: 'Markus Hoffmann', email: null, avatarUrl: null, role: 'HEAD_COACH', isMember: true },
  { userId: 'user-coach-2', name: 'Jens Krüger', email: null, avatarUrl: null, role: 'ASSISTANT_COACH', isMember: true },
  { userId: 'user-player-1', name: 'Julian Becker', email: null, avatarUrl: null, role: 'PLAYER', isMember: true },
  { userId: 'user-player-2', name: 'Tim Weber', email: null, avatarUrl: null, role: 'PLAYER', isMember: true },
  { userId: 'user-player-3', name: 'Lukas Hoffmann', email: null, avatarUrl: null, role: 'PLAYER', isMember: true },
  { userId: 'user-player-4', name: 'Emre Yilmaz', email: null, avatarUrl: null, role: 'PLAYER', isMember: true },
  { userId: 'user-player-5', name: 'Paul Wagner', email: null, avatarUrl: null, role: 'PLAYER', isMember: true },
  { userId: 'user-parent-1', name: 'Nina Becker', email: null, avatarUrl: null, role: 'PARENT', isMember: true },
]

function inboxFor(session: ChatMockSession, clubId: string): InboxItem[] {
  const persona = personaOf(session.scenario)
  const team = session.teamMembers[0]?.team
  if (!persona || !team) return []
  const s = stateFor(session)
  const base = buildE2EInbox({
    persona,
    teamId: team.id,
    teamName: team.displayName,
    viewerId: session.user.id,
  })
  void clubId
  return [...s.created, ...base].map((item) => ({ ...item, ...(s.overrides.get(item.id) ?? {}) }))
}

function membersOf(s: ChatState, channelId: string): Set<string> {
  let set = s.members.get(channelId)
  if (!set) {
    set =
      channelId === E2E_CHANNELS.carpool
        ? new Set(['user-player-1', 'user-player-2', 'user-player-3', 'user-coach-1'])
        : new Set(ROSTER.map((m) => m.userId))
    s.members.set(channelId, set)
  }
  return set
}

function ok(body: unknown, status = 200): ChatMockResponse {
  return { handled: true, ok: true, status, body }
}

function notFound(): ChatMockResponse {
  return { handled: true, ok: false, status: 404, message: 'Not found' }
}

export function handleE2EChatRequest(
  session: ChatMockSession,
  clubId: string,
  pathname: string,
  method: string,
  body: unknown,
): ChatMockResponse {
  const s = stateFor(session)
  const persona = personaOf(session.scenario)
  const isStaff = persona === 'coach' || persona === 'club-admin'
  const clubPrefix = `/clubs/${clubId}`

  if (method === 'GET' && pathname === `${clubPrefix}/inbox`) {
    return ok(inboxFor(session, clubId))
  }

  if (method === 'GET' && pathname === `${clubPrefix}/chat/contacts`) {
    const team = session.teamMembers[0]?.team
    const others = ROSTER.filter((m) => m.userId !== session.user.id)
    const groups: ChatContactGroup[] = [
      {
        teamId: team?.id ?? null,
        teamName: team?.displayName ?? 'Senior Team',
        contacts: others.map((m) => ({
          userId: m.userId,
          name: m.name,
          avatarUrl: null,
          role: m.role,
          canMessage: true,
          reason: null,
        })),
      },
      {
        teamId: 'team-e2e-u13',
        teamName: 'U13 Junioren',
        contacts: [
          { userId: 'user-youth-1', name: 'Finn Schröder', avatarUrl: null, role: 'PLAYER', canMessage: false, reason: 'MINOR_ADULT' },
          { userId: 'user-youth-2', name: 'Mia Hartmann', avatarUrl: null, role: 'PLAYER', canMessage: false, reason: 'MINOR_ADULT' },
          { userId: 'user-parent-2', name: 'Sabine Schröder', avatarUrl: null, role: 'PARENT', canMessage: true, reason: null },
        ],
      },
      {
        teamId: null,
        teamName: 'Vorstand',
        contacts: [
          { userId: 'user-admin-1', name: 'Mara Schulte', avatarUrl: null, role: 'OWNER', canMessage: true, reason: null },
        ].filter((c) => c.userId !== session.user.id),
      },
    ]
    return ok(groups.filter((g) => g.contacts.length > 0))
  }

  // Create a group: POST /clubs/:clubId/channels { name, memberIds, teamId }
  if (method === 'POST' && pathname === `${clubPrefix}/channels`) {
    const input = (body ?? {}) as { name?: string; description?: string; teamId?: string; memberIds?: string[] }
    const id = `e2e-ch-group-${Date.now().toString(36)}`
    const team = session.teamMembers[0]?.team
    const now = new Date().toISOString()
    const item: InboxItem = {
      type: 'CHANNEL',
      id,
      teamId: input.teamId ?? team?.id ?? null,
      teamName: team?.displayName ?? null,
      kind: 'CUSTOM',
      title: input.name?.trim() || 'Neue Gruppe',
      avatarUrl: null,
      otherUserId: null,
      canWrite: true,
      muted: false,
      mutedUntil: null,
      unreadCount: 0,
      lastMessage: null,
      activityAt: now,
    }
    s.created.unshift(item)
    s.members.set(id, new Set([session.user.id, ...(input.memberIds ?? [])]))
    return ok(
      {
        id,
        clubId,
        teamId: item.teamId,
        slug: `group-${id}`,
        kind: 'CUSTOM',
        name: item.title,
        description: input.description ?? null,
        visibility: 'MEMBERS',
        canWrite: true,
        unreadCount: 0,
        lastMessage: null,
        createdAt: now,
        updatedAt: now,
      },
      201,
    )
  }

  const channelMatch = pathname.match(new RegExp(`^${clubPrefix}/channels/([^/]+)(/.*)?$`))
  if (channelMatch) {
    const [, channelId, rest = ''] = channelMatch
    const item = inboxFor(session, clubId).find((i) => i.id === channelId && i.type === 'CHANNEL')
    if (!item) return notFound()

    if (method === 'GET' && rest === '') {
      const members = membersOf(s, channelId)
      const detail: ChatChannelDetail = {
        id: item.id,
        clubId,
        teamId: item.teamId,
        slug: item.id,
        kind: item.kind as ChatChannelDetail['kind'],
        name: item.title,
        description:
          item.kind === 'CUSTOM' ? 'Wer fährt wen zu den Auswärtsspielen? Hier absprechen.' : null,
        visibility: item.kind === 'COACHES' ? 'COACHES_ONLY' : 'MEMBERS',
        canWrite: item.canWrite,
        unreadCount: item.unreadCount,
        lastMessage: null,
        createdAt: item.activityAt,
        updatedAt: item.activityAt,
        teamName: item.teamName,
        memberCount: item.kind === 'CUSTOM' ? members.size : item.kind === 'COACHES' ? 4 : 23,
        muted: item.muted,
        mutedUntil: item.mutedUntil,
        canManageMembers: item.kind === 'CUSTOM' && isStaff,
      }
      return ok(detail)
    }
    if (method === 'PATCH' && rest === '') {
      const muted = Boolean((body as { muted?: boolean } | null)?.muted)
      s.overrides.set(channelId, { ...(s.overrides.get(channelId) ?? {}), muted, mutedUntil: null })
      return ok({ muted, mutedUntil: null })
    }
    if (method === 'POST' && rest === '/read') {
      s.overrides.set(channelId, { ...(s.overrides.get(channelId) ?? {}), unreadCount: 0 })
      return ok({ marked: item.unreadCount })
    }
    if (method === 'GET' && rest === '/members') {
      const members = membersOf(s, channelId)
      const list = ROSTER.map((m) => ({ ...m, isMember: item.kind === 'CUSTOM' ? members.has(m.userId) : true }))
      const visible = item.kind === 'CUSTOM' && !isStaff ? list.filter((m) => m.isMember) : list
      return ok(visible)
    }
    // Info screen media tabs: the demo channels share no files yet.
    if (method === 'GET' && rest.startsWith('/media')) {
      return ok([])
    }
    if (method === 'POST' && rest === '/members') {
      const ids = ((body as { userIds?: string[] } | null)?.userIds ?? []).filter(Boolean)
      const members = membersOf(s, channelId)
      ids.forEach((id) => members.add(id))
      return ok({ added: ids.length }, 201)
    }
    const removeMatch = rest.match(/^\/members\/([^/]+)$/)
    if (method === 'DELETE' && removeMatch) {
      membersOf(s, channelId).delete(removeMatch[1])
      if (removeMatch[1] === session.user.id) {
        s.created = s.created.filter((c) => c.id !== channelId)
      }
      return ok({ removed: true })
    }
    return { handled: false }
  }

  const convoMatch = pathname.match(new RegExp(`^${clubPrefix}/conversations/([^/]+)(/.*)?$`))
  if (convoMatch) {
    const [, conversationId, rest = ''] = convoMatch
    const item = inboxFor(session, clubId).find((i) => i.id === conversationId && i.type === 'DM')
    if (method === 'GET' && rest === '') {
      if (!item) return notFound()
      const detail: ChatConversationDetail = {
        id: conversationId,
        clubId,
        otherUser: { id: item.otherUserId ?? 'user-coach-1', name: item.title, avatarUrl: null },
        muted: item.muted,
        mutedUntil: item.mutedUntil,
        canMessage: true,
        blockedByMe: false,
        peerLastReadAt: new Date().toISOString(),
        peerLeftClub: false,
      }
      return ok(detail)
    }
    if (method === 'PATCH' && rest === '') {
      const muted = Boolean((body as { muted?: boolean } | null)?.muted)
      s.overrides.set(conversationId, { ...(s.overrides.get(conversationId) ?? {}), muted, mutedUntil: null })
      return ok({ muted, mutedUntil: null })
    }
    if (method === 'PUT' && rest === '/read') {
      s.overrides.set(conversationId, { ...(s.overrides.get(conversationId) ?? {}), unreadCount: 0 })
      return ok({ success: true, readAt: new Date().toISOString() })
    }
    // ── DM attachments (chat revamp) ──
    const history = () => buildE2EDmMessages(conversationId, session.user.id, session.user.name)
    if (method === 'GET' && rest === '/messages') {
      return ok({
        messages: history().map(toDmItem),
        hasMore: false,
        peerLastReadAt: new Date().toISOString(),
      })
    }
    if (method === 'POST' && rest === '/messages') {
      const input = (body ?? {}) as Record<string, unknown>
      const lineup = input.lineup as { source?: string; formation?: string; slots?: unknown; title?: string; eventId?: string } | undefined
      const now = new Date().toISOString()
      return ok(
        toDmItem({
          id: `e2e-dm-sent-${Date.now().toString(36)}`,
          conversationId,
          senderId: session.user.id,
          senderName: session.user.name,
          content: String(input.content ?? lineup?.title ?? ''),
          createdAt: now,
          messageType: (input.messageType as DmMessage['messageType']) ?? 'TEXT',
          attachmentUrl: (input.attachmentUrl as string | undefined) ?? null,
          attachmentMeta:
            input.messageType === 'LINEUP'
              ? lineup?.source === 'EVENT'
                ? {
                    lineupSource: 'EVENT',
                    eventId: lineup.eventId,
                    title: 'Heimspiel gegen SV Babelsberg 03',
                    opponent: 'SV Babelsberg 03',
                    formation: '4-4-2',
                    slots: E2E_LINEUP_SLOTS,
                  }
                : { lineupSource: 'FORMATION', title: lineup?.title ?? null, formation: lineup?.formation, slots: lineup?.slots as never }
              : ((input.attachmentMeta as DmMessage['attachmentMeta']) ?? null),
        }),
        201,
      )
    }
    if (method === 'POST' && rest === '/media/presign') {
      // No R2 in the demo: the client shows "Uploads sind hier nicht verfügbar".
      return ok({ enabled: false, objectKey: `dm/${clubId}/${conversationId}/demo`, uploadUrl: null, publicUrl: null })
    }
    if (method === 'GET' && rest === '/lineup-options') {
      return ok(
        isStaff
          ? [
              {
                eventId: 'event-match-1',
                title: 'Heimspiel gegen SV Babelsberg 03',
                date: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
                opponent: 'SV Babelsberg 03',
                teamName: session.teamMembers[0]?.team.displayName ?? 'Herren I',
                formation: '4-4-2',
                starterCount: E2E_LINEUP_SLOTS.length,
              },
            ]
          : [],
      )
    }
    if (method === 'GET' && /^\/messages\/[^/]+\/media-url$/.test(rest)) {
      // Demo storage has no signed path; the client falls back to the stored URL.
      return ok({ url: null })
    }
    if (method === 'GET' && rest.startsWith('/media')) {
      const tab = new URLSearchParams(rest.split('?')[1] ?? '').get('tab') ?? 'media'
      const photos = history().filter((m) => m.messageType === 'IMAGE')
      return ok(
        tab === 'media'
          ? photos.map((m) => ({
              id: m.id,
              messageType: 'IMAGE',
              attachmentUrl: m.attachmentUrl ?? E2E_DM_PHOTO_URL,
              attachmentMeta: m.attachmentMeta ?? null,
              content: m.content,
              url: null,
              senderName: m.senderName,
              createdAt: m.createdAt,
            }))
          : [],
      )
    }
    const reactMatch = rest.match(/^\/messages\/([^/]+)\/reactions(?:\/([^/]+))?$/)
    if (reactMatch && (method === 'POST' || method === 'DELETE')) {
      const target = history().find((m) => m.id === reactMatch[1])
      if (!target) return notFound()
      const emoji = method === 'POST' ? String((body as { emoji?: string } | null)?.emoji ?? '👍') : null
      return ok(
        toDmItem({
          ...target,
          reactions: emoji ? [{ emoji, userIds: [session.user.id], count: 1 }] : [],
        }),
      )
    }
    const deleteMatch = rest.match(/^\/messages\/([^/]+)$/)
    if (method === 'DELETE' && deleteMatch) {
      const target = history().find((m) => m.id === deleteMatch[1])
      if (!target) return notFound()
      return ok(toDmItem({ ...target, content: '', attachmentUrl: null, attachmentMeta: null, deletedAt: new Date().toISOString() }))
    }
    return { handled: false }
  }

  // Inline poll cards read and vote on the poll behind a POLL message.
  const pollMatch = pathname.match(/^\/messages\/([^/]+)\/poll$/)
  if (method === 'GET' && pollMatch) {
    const pollId = `e2e-poll-${pollMatch[1]}`
    return ok(pollBody(pollId, s.pollVotes.get(pollId) ?? null))
  }
  const voteMatch = pathname.match(/^\/polls\/([^/]+)\/vote$/)
  if (method === 'POST' && voteMatch) {
    const optionId = (body as { optionId?: string } | null)?.optionId ?? null
    if (optionId) s.pollVotes.set(voteMatch[1], optionId)
    return ok(pollBody(voteMatch[1], optionId))
  }
  const pollGet = pathname.match(/^\/polls\/([^/]+)$/)
  if (method === 'GET' && pollGet && pollGet[1].startsWith('e2e-poll-')) {
    return ok(pollBody(pollGet[1], s.pollVotes.get(pollGet[1]) ?? null))
  }

  // Pinned message lookups have nothing pinned in the demo club.
  if (method === 'GET' && /^\/clubs\/[^/]+\/teams\/[^/]+\/messages\/pinned$/.test(pathname)) {
    return ok(null)
  }

  return { handled: false }
}

function pollBody(id: string, myVote: string | null) {
  const base = [
    { id: 'opt-yes', label: 'Ja, bin dabei', votes: 9 },
    { id: 'opt-maybe', label: 'Nur kurz', votes: 3 },
    { id: 'opt-no', label: 'Diesmal nicht', votes: 2 },
  ]
  const options = base.map((o) => ({ ...o, votes: o.votes + (myVote === o.id ? 1 : 0) }))
  return {
    id,
    question: 'Mannschaftsabend nach dem Spiel?',
    multiSelect: false,
    closesAt: null,
    closedAt: null,
    totalVotes: options.reduce((sum, o) => sum + o.votes, 0),
    options,
    myVoteOptionIds: myVote ? [myVote] : [],
  }
}

/** Seeded DM rows → the API's DirectMessageItem shape. */
function toDmItem(m: DmMessage) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    content: m.content,
    messageType: m.messageType ?? 'TEXT',
    attachmentUrl: m.attachmentUrl ?? null,
    attachmentMeta: m.attachmentMeta ?? null,
    replyToId: m.replyToId ?? null,
    replyTo: m.replyTo ?? null,
    sourceLanguage: null,
    translation: null,
    deletedAt: m.deletedAt ?? null,
    createdAt: m.createdAt,
    sender: { id: m.senderId, name: m.senderName, avatarUrl: null },
    reactions: m.reactions ?? [],
  }
}
