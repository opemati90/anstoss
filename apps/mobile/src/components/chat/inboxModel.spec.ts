import type { InboxItem } from '@anstoss/shared'
import {
  badgeLabel,
  contactReasonKey,
  conversationSubtitle,
  conversationTitle,
  filterByBucket,
  filterInbox,
  inboxBucket,
  inboxBucketStats,
  formatInboxTime,
  groupErrorKey,
  isMuted,
  previewLine,
  routeKindFor,
  sortInbox,
  totalUnread,
  typingPreview,
} from './inboxModel'
import { ApiError } from '../../api/client'

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key) as never

function item(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    type: 'CHANNEL',
    id: 'c1',
    teamId: 'team-1',
    teamName: 'Herren I',
    kind: 'TEAM',
    title: 'Team',
    avatarUrl: null,
    otherUserId: null,
    canWrite: true,
    muted: false,
    mutedUntil: null,
    unreadCount: 0,
    lastMessage: null,
    activityAt: '2026-09-20T10:00:00.000Z',
    ...overrides,
  }
}

describe('inboxModel', () => {
  it('names default channels by kind and keeps custom/DM names', () => {
    expect(conversationTitle(item({ kind: 'TEAM' }), t)).toBe('chatHub.kind.team')
    expect(conversationTitle(item({ kind: 'ANNOUNCEMENTS' }), t)).toBe('chatHub.kind.announcements')
    expect(conversationTitle(item({ kind: 'COACHES' }), t)).toBe('chatHub.kind.coaches')
    expect(conversationTitle(item({ kind: 'COACHES', teamId: null }), t)).toBe('chatHub.kind.board')
    expect(conversationTitle(item({ kind: 'CUSTOM', title: 'Fahrgemeinschaft' }), t)).toBe('Fahrgemeinschaft')
    expect(conversationTitle(item({ type: 'DM', kind: 'DM', title: 'Tim Weber' }), t)).toBe('Tim Weber')
  })

  it('shows the team only for multi-team readers and marks club-level channels', () => {
    expect(conversationSubtitle(item(), 1, t)).toBeNull()
    expect(conversationSubtitle(item(), 2, t)).toBe('Herren I')
    expect(conversationSubtitle(item({ teamId: null, teamName: null }), 1, t)).toBe('chatHub.wholeClub')
    expect(conversationSubtitle(item({ type: 'DM', kind: 'DM', teamId: null }), 3, t)).toBeNull()
  })

  it('pins unread announcements above newer conversations, then sorts by recency', () => {
    const newest = item({ id: 'team', lastMessage: msg('2026-09-22T12:00:00.000Z') })
    const oldAnnouncement = item({
      id: 'ann',
      kind: 'ANNOUNCEMENTS',
      unreadCount: 1,
      lastMessage: msg('2026-09-18T12:00:00.000Z'),
    })
    const readAnnouncement = item({
      id: 'ann-read',
      kind: 'ANNOUNCEMENTS',
      unreadCount: 0,
      lastMessage: msg('2026-09-10T12:00:00.000Z'),
    })
    const dm = item({ id: 'dm', type: 'DM', kind: 'DM', lastMessage: msg('2026-09-21T12:00:00.000Z') })
    expect(sortInbox([readAnnouncement, dm, newest, oldAnnouncement]).map((i) => i.id)).toEqual([
      'ann',
      'team',
      'dm',
      'ann-read',
    ])
  })

  it('filters by displayed name, ignoring case and accents', () => {
    const rows = [item({ id: 'a', title: 'Jürgen Müller', type: 'DM', kind: 'DM' }), item({ id: 'b' })]
    expect(filterInbox(rows, 'jurgen', (i) => i.title).map((i) => i.id)).toEqual(['a'])
    expect(filterInbox(rows, '  ', (i) => i.title)).toHaveLength(2)
  })

  it('builds WhatsApp-style preview lines', () => {
    expect(previewLine(item(), 'me', t)).toBe('chatHub.row.noMessages')
    expect(
      previewLine(item({ lastMessage: { ...msg('2026-09-22T12:00:00.000Z'), senderId: 'me' } }), 'me', t),
    ).toBe('chatHub.row.mine:{"text":"Hallo"}')
    expect(previewLine(item({ lastMessage: msg('2026-09-22T12:00:00.000Z') }), 'me', t)).toBe(
      'chatHub.row.fromSender:{"name":"Tim","text":"Hallo"}',
    )
    expect(
      previewLine(item({ type: 'DM', kind: 'DM', lastMessage: msg('2026-09-22T12:00:00.000Z') }), 'me', t),
    ).toBe('Hallo')
    expect(
      previewLine(
        item({ lastMessage: { ...msg('2026-09-22T12:00:00.000Z'), type: 'IMAGE', preview: '' } }),
        'me',
        t,
      ),
    ).toBe('chatHub.row.fromSender:{"name":"Tim","text":"chatHub.preview.photo"}')
  })

  it('treats expired mutes as unmuted and excludes muted rows from the badge', () => {
    const now = Date.parse('2026-09-22T12:00:00.000Z')
    expect(isMuted(item({ muted: true }), now)).toBe(true)
    expect(isMuted(item({ muted: true, mutedUntil: '2026-09-21T00:00:00.000Z' }), now)).toBe(false)
    expect(
      totalUnread([item({ unreadCount: 3 }), item({ unreadCount: 5, muted: true })], now),
    ).toBe(3)
    expect(badgeLabel(7)).toBe('7')
    expect(badgeLabel(120)).toBe('99+')
  })

  it('formats inbox times relative to today', () => {
    const now = new Date(2026, 8, 22, 15, 0)
    expect(formatInboxTime(new Date(2026, 8, 21, 9, 0).toISOString(), 'de', t, now)).toBe(
      'chatHub.time.yesterday',
    )
    expect(formatInboxTime(new Date(2026, 8, 22, 9, 5).toISOString(), 'de', t, now)).toMatch(/09:05/)
    expect(formatInboxTime(null, 'de', t, now)).toBe('')
  })

  it('maps rows to route kinds', () => {
    expect(routeKindFor({ type: 'DM' })).toBe('dm')
    expect(routeKindFor({ type: 'CHANNEL' })).toBe('channel')
  })
})

function msg(createdAt: string): NonNullable<InboxItem['lastMessage']> {
  return { senderId: 'u-tim', senderName: 'Tim Weber', preview: 'Hallo', type: 'TEXT', createdAt }
}

// ─── Chat revamp (inbox/info fork) ─────────────────────────────────────

describe('typingPreview', () => {
  const tt = ((key: string, opts?: Record<string, unknown>) =>
    opts?.name ? `${key}:${opts.name}` : key) as never
  it('names the typist in channels (first name) but not in DMs', () => {
    expect(typingPreview({ type: 'CHANNEL' }, 'Tim Weber', tt)).toBe('chatInbox.typingNamed:Tim')
    expect(typingPreview({ type: 'DM' }, 'Tim Weber', tt)).toBe('chatInbox.typing')
    expect(typingPreview({ type: 'CHANNEL' }, null, tt)).toBe('chatInbox.typing')
  })
})

describe('contactReasonKey (L8)', () => {
  it('keeps minor↔minor and adult↔minor apart', () => {
    expect(contactReasonKey('MINOR_MINOR', true)).toBe('chatInbox.new.reasonMinorMinor')
    expect(contactReasonKey('MINOR_ADULT', true)).toBe('chatHub.new.reasonMinorSelf')
    expect(contactReasonKey('MINOR_ADULT', false)).toBe('chatHub.new.reasonMinor')
    expect(contactReasonKey('AGE_UNVERIFIED', false)).toBe('chatHub.new.reasonAge')
    expect(contactReasonKey('BLOCKED', false)).toBe('chatHub.new.reasonBlocked')
  })
})

describe('groupErrorKey (B1 client)', () => {
  it('maps the safeguarding codes from an ApiError message', () => {
    expect(groupErrorKey(new ApiError('GROUP_MINOR_NEEDS_STAFF', 400))).toBe(
      'chatInbox.groupErrors.minorNeedsStaff',
    )
    expect(
      groupErrorKey(new ApiError('Bad Request', 400, undefined, { message: 'GROUP_PRIVATE_PAIR_NOT_ALLOWED' })),
    ).toBe('chatInbox.groupErrors.privatePair')
    expect(groupErrorKey(new ApiError('x GROUP_REMOVE_BREAKS_SAFEGUARD', 400))).toBe(
      'chatInbox.groupErrors.removeBreaksSafeguard',
    )
  })
  it('returns null for unrelated failures', () => {
    expect(groupErrorKey(new ApiError('Network down', 0))).toBeNull()
    expect(groupErrorKey(undefined)).toBeNull()
  })
})

describe('inbox filter chips', () => {
  const team = item({ id: 't', kind: 'TEAM', unreadCount: 3 })
  const parents = item({ id: 'p', kind: 'PARENTS', unreadCount: 1, muted: true })
  const coaches = item({ id: 'c', kind: 'COACHES' })
  const news = item({ id: 'n', kind: 'CLUB_NEWS', teamId: null, unreadCount: 1 })
  const ann = item({ id: 'a', kind: 'ANNOUNCEMENTS' })
  const dm = item({ id: 'd', type: 'DM', kind: 'DM', unreadCount: 2 })

  it('sorts each conversation under one chip', () => {
    expect(inboxBucket(team)).toBe('TEAM')
    expect(inboxBucket(parents)).toBe('TEAM')
    expect(inboxBucket(item({ kind: 'CUSTOM' }))).toBe('TEAM')
    expect(inboxBucket(coaches)).toBe('COACHES')
    expect(inboxBucket(news)).toBe('INFO')
    expect(inboxBucket(ann)).toBe('INFO')
    expect(inboxBucket(dm)).toBe('DM')
  })

  it('counts conversations and unmuted unread per chip', () => {
    const stats = inboxBucketStats([team, parents, coaches, news, ann, dm])
    expect(stats.ALL).toEqual({ size: 6, unread: 6 })
    expect(stats.TEAM).toEqual({ size: 2, unread: 3 })
    expect(stats.COACHES).toEqual({ size: 1, unread: 0 })
    expect(stats.INFO).toEqual({ size: 2, unread: 1 })
    expect(stats.DM).toEqual({ size: 1, unread: 2 })
  })

  it('filters by chip; ALL keeps everything', () => {
    const all = [team, coaches, dm]
    expect(filterByBucket(all, 'ALL')).toHaveLength(3)
    expect(filterByBucket(all, 'DM').map((i) => i.id)).toEqual(['d'])
  })
})
