import type { TFunction } from 'i18next'
import type { InboxItem } from '@anstoss/shared'

/**
 * Pure helpers behind the chat inbox. Kept free of React so the ordering,
 * labelling and preview rules are unit-tested in isolation.
 */

export type ConversationKind = 'channel' | 'dm'

/** Route kind for an inbox row. */
export function routeKindFor(item: Pick<InboxItem, 'type'>): ConversationKind {
  return item.type === 'DM' ? 'dm' : 'channel'
}

/**
 * The name people see for a conversation. Default channels are named by
 * what they are (the seeded English row names never reach the UI); custom
 * groups and DMs keep their own names.
 */
export function conversationTitle(
  item: Pick<InboxItem, 'type' | 'kind' | 'teamId' | 'title'>,
  t: TFunction,
): string {
  if (item.type === 'DM') return item.title || t('chatHub.unknownPerson')
  switch (item.kind) {
    case 'TEAM':
      return t('chatHub.kind.team')
    case 'ANNOUNCEMENTS':
      return t('chatHub.kind.announcements')
    case 'CLUB_NEWS':
      return t('chatHub.kind.clubNews')
    case 'PARENTS':
      return t('chatHub.kind.parents')
    case 'COACHES':
      // A team's staff room is the coaching team; the club-level one is
      // where the board and all coaches meet.
      return item.teamId ? t('chatHub.kind.coaches') : t('chatHub.kind.board')
    default:
      return item.title || t('chatHub.kind.group')
  }
}

/**
 * Subtitle under the title: the team for team channels when the reader has
 * more than one team, and "whole club" for club-level channels so a
 * one-team player can still tell the two Ankündigungen apart.
 */
export function conversationSubtitle(
  item: Pick<InboxItem, 'type' | 'teamId' | 'teamName'>,
  teamCount: number,
  t: TFunction,
): string | null {
  if (item.type === 'DM') return null
  if (!item.teamId) return t('chatHub.wholeClub')
  if (teamCount > 1 && item.teamName) return item.teamName
  return null
}

/** Is the mute still in force at `now`? */
export function isMuted(
  item: Pick<InboxItem, 'muted' | 'mutedUntil'>,
  now: number = Date.now(),
): boolean {
  if (!item.muted) return false
  if (!item.mutedUntil) return true
  return new Date(item.mutedUntil).getTime() > now
}

function activityTime(item: Pick<InboxItem, 'activityAt' | 'lastMessage'>): number {
  const iso = item.lastMessage?.createdAt ?? item.activityAt
  const ms = iso ? new Date(iso).getTime() : 0
  return Number.isFinite(ms) ? ms : 0
}

/**
 * WhatsApp order: most recent first. Unread Ankündigungen are pinned above
 * everything else, because "what did the coach say" must never scroll away
 * under group banter.
 */
export function sortInbox<T extends InboxItem>(items: T[]): T[] {
  const pinned = (i: InboxItem) => i.kind === 'ANNOUNCEMENTS' && i.unreadCount > 0
  return items.slice().sort((a, b) => {
    const pa = pinned(a) ? 1 : 0
    const pb = pinned(b) ? 1 : 0
    if (pa !== pb) return pb - pa
    return activityTime(b) - activityTime(a)
  })
}

/** Case- and accent-insensitive name filter for the header search. */
export function filterInbox<T extends InboxItem>(
  items: T[],
  query: string,
  titleOf: (item: T) => string,
): T[] {
  const q = normalize(query)
  if (!q) return items
  return items.filter(
    (item) => normalize(titleOf(item)).includes(q) || normalize(item.teamName ?? '').includes(q),
  )
}

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * "Sender: preview" line. Own messages read "Du: …", DMs drop the sender
 * (it is obvious), and media types get a localized label instead of the
 * raw placeholder content.
 */
export function previewLine(
  item: Pick<InboxItem, 'type' | 'lastMessage'>,
  myUserId: string | null | undefined,
  t: TFunction,
): string {
  const last = item.lastMessage
  if (!last) return t('chatHub.row.noMessages')
  const body = previewBody(last.type, last.preview, t)
  if (last.type === 'SYSTEM') return body
  const isMine = !!myUserId && last.senderId === myUserId
  if (isMine) return t('chatHub.row.mine', { text: body })
  if (item.type === 'DM' || !last.senderName) return body
  return t('chatHub.row.fromSender', { name: firstName(last.senderName), text: body })
}

function previewBody(type: string, preview: string, t: TFunction): string {
  const text = (preview ?? '').replace(/\s+/g, ' ').trim()
  switch (type) {
    case 'IMAGE':
      return text ? t('chatHub.preview.photoWithCaption', { text }) : t('chatHub.preview.photo')
    case 'VOICE':
      return t('chatHub.preview.voice')
    case 'VIDEO':
      return t('chatHub.preview.video')
    case 'FILE':
      return t('chatHub.preview.file')
    case 'POLL':
      return t('chatHub.preview.poll', { text })
    case 'RSVP_POLL':
      return t('chatHub.preview.event', { text })
    case 'LINEUP':
      return t('chatHub.preview.lineup')
    default:
      return text || t('chatHub.preview.deleted')
  }
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

/**
 * Inbox timestamp: time today, "Gestern" yesterday, weekday within a week,
 * otherwise a short date.
 */
export function formatInboxTime(
  iso: string | null | undefined,
  locale: string,
  t: TFunction,
  now: Date = new Date(),
): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (dayDiff <= 0) {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', hourCycle: 'h23', minute: '2-digit' }).format(date)
  }
  if (dayDiff === 1) return t('chatHub.time.yesterday')
  if (dayDiff < 7) return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: '2-digit' }).format(
    date,
  )
}

/** Sum of unread across unmuted conversations — drives the tab badge. */
export function totalUnread(items: InboxItem[], now: number = Date.now()): number {
  return items.reduce((sum, item) => (isMuted(item, now) ? sum : sum + (item.unreadCount || 0)), 0)
}

/** Badge text: 1–99, then "99+". */
export function badgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count)
}

// ─── Chat revamp (inbox/info fork) ─────────────────────────────────────

/**
 * Preview while someone types. DMs just say "schreibt …" (the peer is the
 * title); channels name the typist so a busy group reads "Tim schreibt …".
 */
export function typingPreview(
  item: Pick<InboxItem, 'type'>,
  userName: string | null | undefined,
  t: TFunction,
): string {
  if (item.type === 'DM' || !userName) return t('chatInbox.typing')
  return t('chatInbox.typingNamed', { name: firstName(userName) })
}

/**
 * i18n key for why a contact can't be messaged privately (L8: minor↔minor
 * and adult↔minor are different situations and read differently).
 */
export function contactReasonKey(reason: string, viewerIsMinor: boolean): string {
  switch (reason) {
    case 'MINOR_MINOR':
      return 'chatInbox.new.reasonMinorMinor'
    case 'MINOR_ADULT':
      return viewerIsMinor ? 'chatHub.new.reasonMinorSelf' : 'chatHub.new.reasonMinor'
    case 'AGE_UNVERIFIED':
      return 'chatHub.new.reasonAge'
    default:
      return 'chatHub.new.reasonBlocked'
  }
}

const GROUP_ERROR_KEYS: Array<[string, string]> = [
  ['GROUP_MINOR_NEEDS_STAFF', 'chatInbox.groupErrors.minorNeedsStaff'],
  ['GROUP_PRIVATE_PAIR_NOT_ALLOWED', 'chatInbox.groupErrors.privatePair'],
  ['GROUP_REMOVE_BREAKS_SAFEGUARD', 'chatInbox.groupErrors.removeBreaksSafeguard'],
]

/**
 * Map a group-safeguarding API error (its message carries the code) to an
 * i18n key; null for any other failure so the caller shows its generic copy.
 */
export function groupErrorKey(error: unknown): string | null {
  const parts: string[] = []
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; body?: unknown; data?: unknown; code?: unknown }
    for (const v of [e.message, e.code]) if (typeof v === 'string') parts.push(v)
    for (const v of [e.body, e.data]) {
      if (typeof v === 'string') parts.push(v)
      else if (v && typeof v === 'object') {
        try {
          parts.push(JSON.stringify(v))
        } catch {
          /* ignore */
        }
      }
    }
  } else if (typeof error === 'string') {
    parts.push(error)
  }
  const text = parts.join(' ')
  for (const [code, key] of GROUP_ERROR_KEYS) if (text.includes(code)) return key
  return null
}
