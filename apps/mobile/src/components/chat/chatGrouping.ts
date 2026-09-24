import type { TFunction } from 'i18next'
import type { ChatMessage } from '../../hooks/useChat'
import { dayKey, daySeparatorLabel } from './chatDates'
import { CHAT_SENDER_PALETTE } from '../../theme/chat'

/** Consecutive messages from one sender within this window form a group. */
export const GROUP_WINDOW_MS = 3 * 60 * 1000

export type ThreadRow =
  | { type: 'day'; key: string; label: string }
  | { type: 'unread'; key: string; count: number }
  | {
      type: 'message'
      key: string
      message: ChatMessage
      /** First bubble of a sender group (name shows here in group chats). */
      firstInGroup: boolean
      /** Last bubble of a sender group (avatar + tail corner show here). */
      lastInGroup: boolean
      showSender: boolean
      showAvatar: boolean
    }

/** Card-like messages never merge into a bubble group. */
function isStandalone(message: ChatMessage): boolean {
  const type = message.messageType ?? 'TEXT'
  if (type === 'SYSTEM' || type === 'POLL' || type === 'RSVP_POLL' || type === 'LINEUP') return true
  return !!message.isAnnouncement && type === 'TEXT' && !message.deletedAt
}

export function sameGroup(a: ChatMessage | null | undefined, b: ChatMessage | null | undefined): boolean {
  if (!a || !b) return false
  if (a.senderId !== b.senderId || !a.senderId) return false
  if (isStandalone(a) || isStandalone(b)) return false
  if (dayKey(a.createdAt) !== dayKey(b.createdAt)) return false
  const gap = Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return gap <= GROUP_WINDOW_MS
}

/**
 * Rows for the thread in chronological order (oldest first): day pills,
 * the "Neue Nachrichten" divider before the first unread message from
 * someone else, and message rows carrying the grouped-corner flags.
 * The inverted list reverses this.
 */
export function buildThreadRows(input: {
  messages: ChatMessage[]
  isGroupChat: boolean
  myUserId: string
  /** Unread messages when the thread was opened (0 = no divider). */
  unreadOnOpen: number
  locale: string
  t: TFunction
  now?: Date
}): ThreadRow[] {
  const { messages, isGroupChat, myUserId, unreadOnOpen, locale, t } = input
  const now = input.now ?? new Date()

  // The divider sits before the Nth-from-last message not written by me.
  let dividerBeforeId: string | null = null
  if (unreadOnOpen > 0) {
    let seen = 0
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.senderId === myUserId || (m.messageType ?? 'TEXT') === 'SYSTEM') continue
      seen += 1
      if (seen === unreadOnOpen) {
        dividerBeforeId = m.id
        break
      }
    }
    if (!dividerBeforeId && seen > 0) {
      dividerBeforeId = messages.find((m) => m.senderId !== myUserId)?.id ?? null
    }
  }

  const out: ThreadRow[] = []
  let lastDay: string | null = null
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    const prev = messages[i - 1]
    const next = messages[i + 1]
    const day = dayKey(message.createdAt)
    if (day !== lastDay) {
      out.push({ type: 'day', key: `day-${day}`, label: daySeparatorLabel(message.createdAt, locale, t, now) })
      lastDay = day
    }
    if (message.id === dividerBeforeId) {
      out.push({ type: 'unread', key: 'unread-divider', count: unreadOnOpen })
    }
    const firstInGroup = !sameGroup(prev, message) || message.id === dividerBeforeId
    const lastInGroup = !sameGroup(message, next) || next?.id === dividerBeforeId
    const own = message.senderId === myUserId
    out.push({
      type: 'message',
      key: message.id,
      message,
      firstInGroup,
      lastInGroup,
      showSender: isGroupChat && !own && firstInGroup,
      showAvatar: isGroupChat && !own && lastInGroup,
    })
  }
  return out
}

/**
 * Muted, legible sender-name colours for group chats. Deterministic per
 * sender so a person keeps their colour across sessions. Two variants per
 * hue: the darker one for light mode, the lighter one for dark mode.
 */
const SENDER_PALETTE = CHAT_SENDER_PALETTE

export function senderColor(senderId: string | null | undefined, isDark: boolean): string {
  const id = senderId ?? ''
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  const entry = SENDER_PALETTE[Math.abs(hash) % SENDER_PALETTE.length]
  return isDark ? entry.dark : entry.light
}

/** "14:05" in the reader's locale (24h/12h by locale). */
export function clockTime(iso: string, locale: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', hourCycle: 'h23', minute: '2-digit' }).format(date)
}

/** Human file size with locale-aware decimals ("2,4 MB"). */
export function fileSizeLabel(bytes: number | null | undefined, locale: string): string | null {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return null
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: unit === 0 || value >= 10 ? 0 : 1,
  }).format(value)
  return `${formatted} ${units[unit]}`
}
