import type { InboxItem } from '@anstoss/shared'
import type { ChatMessage } from '../hooks/useChat'
import type { DmMessage } from '../hooks/useDmChat'

/**
 * Seeded chat for E2E / demo sessions. History streams over Socket.io, which
 * the E2E request mock does NOT intercept, so useChat / useDmChat
 * short-circuit to these threads whenever an E2E session is active. The
 * inbox rows the request mock serves (buildE2EInbox) point at the same ids,
 * so every row opens onto a real-looking German club conversation.
 */

export const E2E_CHANNELS = {
  team: 'e2e-ch-team',
  announcements: 'e2e-ch-announcements',
  coaches: 'e2e-ch-coaches',
  clubNews: 'e2e-ch-club-news',
  clubAnnouncements: 'e2e-ch-club-announcements',
  board: 'e2e-ch-board',
  carpool: 'e2e-ch-fahrgemeinschaft',
} as const

export const E2E_DMS = {
  coach: 'e2e-dm-coach',
  player: 'e2e-dm-tim',
  parent: 'e2e-dm-nina',
  board: 'e2e-dm-mara',
} as const

export type E2EPersona = 'player' | 'coach' | 'club-admin' | 'parent'

const MIN = 60_000
const HOUR = 60 * MIN

const COACH = { id: 'user-coach-1', name: 'Markus Hoffmann' }
const TIM = { id: 'user-player-2', name: 'Tim Weber' }
const LUKAS = { id: 'user-player-3', name: 'Lukas Hoffmann' }
const JULIAN = { id: 'user-player-1', name: 'Julian Becker' }
const NINA = { id: 'user-parent-1', name: 'Nina Becker' }
const MARA = { id: 'user-admin-1', name: 'Mara Schulte' }
const JENS = { id: 'user-coach-2', name: 'Jens Krüger' }

/** Demo photo for the DM attachment (a pitch; falls back to the placeholder offline). */
export const E2E_DM_PHOTO_URL =
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=80'

/** Saved Aufstellung of the next match (4-4-2), shared into DMs and lineup-options. */
export const E2E_LINEUP_SLOTS = [
  { position: 'GK', playerName: 'Jonas Keller' },
  { position: 'LB', playerName: 'Emre Yilmaz' },
  { position: 'CB', playerName: 'Paul Wagner' },
  { position: 'CB', playerName: 'Niklas Schmidt' },
  { position: 'RB', playerName: 'Felix Braun' },
  { position: 'LM', playerName: 'Tim Weber' },
  { position: 'CM', playerName: 'Julian Becker' },
  { position: 'CM', playerName: 'Lukas Hoffmann' },
  { position: 'RM', playerName: 'Leon Fischer' },
  { position: 'ST', playerName: 'Max Richter' },
  { position: 'ST', playerName: 'David Wolf' },
]

function iso(offsetMs: number, now: number) {
  return new Date(now - offsetMs).toISOString()
}

/**
 * Inbox rows per persona. Unread counts, mutes and "Sender: preview" lines
 * are chosen so every row state (pinned announcement, muted badge, own last
 * message, read-only lock, DM) renders at least once across the personas.
 */
export function buildE2EInbox(input: {
  persona: E2EPersona
  teamId: string
  teamName: string
  viewerId: string
  now?: number
}): InboxItem[] {
  const now = input.now ?? Date.now()
  const { persona, teamId, teamName, viewerId } = input
  const isStaff = persona === 'coach' || persona === 'club-admin'
  const channel = (
    id: string,
    kind: InboxItem['kind'],
    title: string,
    opts: {
      clubLevel?: boolean
      canWrite?: boolean
      muted?: boolean
      unread?: number
      last?: { sender: { id: string; name: string } | null; text: string; ago: number; type?: string }
    },
  ): InboxItem => ({
    type: 'CHANNEL',
    id,
    teamId: opts.clubLevel ? null : teamId,
    teamName: opts.clubLevel ? null : teamName,
    kind,
    title,
    avatarUrl: null,
    otherUserId: null,
    canWrite: opts.canWrite ?? true,
    muted: opts.muted ?? false,
    mutedUntil: null,
    unreadCount: opts.unread ?? 0,
    lastMessage: opts.last
      ? {
          senderId: opts.last.sender?.id ?? null,
          senderName: opts.last.sender?.name ?? null,
          preview: opts.last.text,
          type: (opts.last.type ?? 'TEXT') as never,
          createdAt: iso(opts.last.ago, now),
        }
      : null,
    activityAt: iso(opts.last?.ago ?? 30 * 24 * HOUR, now),
  })
  const dm = (
    id: string,
    peer: { id: string; name: string },
    text: string,
    ago: number,
    unread: number,
    fromPeer = true,
  ): InboxItem => ({
    type: 'DM',
    id,
    teamId: null,
    teamName: null,
    kind: 'DM',
    title: peer.name,
    avatarUrl: null,
    otherUserId: peer.id,
    canWrite: true,
    muted: false,
    mutedUntil: null,
    unreadCount: unread,
    lastMessage: {
      senderId: fromPeer ? peer.id : viewerId,
      senderName: fromPeer ? peer.name : null,
      preview: text,
      type: 'TEXT',
      createdAt: iso(ago, now),
    },
    activityAt: iso(ago, now),
  })

  const items: InboxItem[] = [
    channel(E2E_CHANNELS.team, 'TEAM', 'Team', {
      unread: persona === 'player' ? 3 : persona === 'parent' ? 0 : 1,
      last: { sender: LUKAS, text: 'Wer nimmt Samstag die Hütchen mit?', ago: 12 * MIN },
    }),
    channel(E2E_CHANNELS.announcements, 'ANNOUNCEMENTS', 'Announcements', {
      canWrite: isStaff,
      unread: persona === 'player' || persona === 'parent' ? 1 : 0,
      last: {
        sender: COACH,
        text: 'Treffpunkt Samstag 13:15 am Vereinsheim\n\nAnstoß gegen SV Babelsberg 03 ist um 15:00. Bitte beide Trikots mitbringen.',
        ago: 3 * HOUR,
      },
    }),
    channel(E2E_CHANNELS.clubNews, 'CLUB_NEWS', 'Club news', {
      canWrite: persona === 'club-admin',
      muted: persona === 'player',
      unread: persona === 'player' ? 2 : 0,
      last: {
        sender: MARA,
        text: 'Mitgliederversammlung am 14. Oktober, 19:30 im Vereinsheim',
        ago: 26 * HOUR,
      },
    }),
    channel(E2E_CHANNELS.carpool, 'CUSTOM', 'Fahrgemeinschaft Auswärtsspiele', {
      unread: 0,
      last: {
        sender: persona === 'player' ? { id: viewerId, name: JULIAN.name } : TIM,
        text: 'Ich hab noch zwei Plätze frei, Abfahrt 12:45 am Sportplatz.',
        ago: 2 * 24 * HOUR,
      },
    }),
  ]

  if (isStaff) {
    items.push(
      channel(E2E_CHANNELS.coaches, 'COACHES', 'Coaches', {
        unread: 2,
        last: { sender: JENS, text: 'Kader für Samstag steht, Lukas fällt mit Zerrung aus.', ago: 45 * MIN },
      }),
      channel(E2E_CHANNELS.board, 'COACHES', 'Staff room', {
        clubLevel: true,
        unread: persona === 'club-admin' ? 1 : 0,
        last: { sender: MARA, text: 'Platzbelegung für die Hallensaison ist raus.', ago: 5 * HOUR },
      }),
    )
  }

  if (persona === 'player') {
    items.push(dm(E2E_DMS.coach, COACH, 'Kannst du Samstag auf der Sechs spielen?', 50 * MIN, 1))
  } else if (persona === 'parent') {
    items.push(dm(E2E_DMS.coach, COACH, 'Danke für die Info, dann bis Samstag!', 4 * HOUR, 0, false))
  } else if (persona === 'coach') {
    items.push(
      dm(E2E_DMS.player, TIM, 'Trainer, ich komme Dienstag 10 Minuten später.', 30 * MIN, 1),
      dm(E2E_DMS.parent, NINA, 'Julian hat ab Montag wieder Training frei.', 26 * HOUR, 0),
    )
  } else {
    items.push(dm(E2E_DMS.board, COACH, 'Passantrag für den Neuzugang ist raus.', 6 * HOUR, 0))
  }
  return items
}

/** Message history for a seeded channel. */
export function buildE2EChatMessages(
  teamId: string,
  channelId: string | null,
  viewerId: string | null,
): ChatMessage[] {
  const now = Date.now()
  const me = viewerId ?? JULIAN.id
  const msg = (
    offset: number,
    sender: { id: string; name: string },
    content: string,
    extra: Partial<ChatMessage> = {},
  ): ChatMessage => ({
    id: `e2e-msg-${channelId ?? 'team'}-${offset}-${sender.id}`,
    teamId,
    senderId: sender.id,
    senderName: sender.name,
    senderAvatar: null,
    content,
    messageType: 'TEXT',
    createdAt: iso(offset, now),
    readByMe: true,
    // Board 15 "Gelesen von 14": receipts per message (shown on own bubbles).
    readCount: 14,
    ...extra,
  })

  switch (channelId) {
    case E2E_CHANNELS.announcements:
    case 'announcements':
      return [
        msg(26 * HOUR, COACH, 'Trikotwäsche diese Woche: Familie Weber\n\nBitte die Tasche bis Donnerstag am Vereinsheim abholen.', { isAnnouncement: true }),
        msg(3 * HOUR, COACH, 'Treffpunkt Samstag 13:15 am Vereinsheim\n\nAnstoß gegen SV Babelsberg 03 ist um 15:00. Bitte beide Trikots mitbringen.', { isAnnouncement: true }),
      ]
    case E2E_CHANNELS.clubNews:
      return [
        msg(26 * HOUR, MARA, 'Mitgliederversammlung am 14. Oktober, 19:30 im Vereinsheim\n\nTagesordnung: Beitrag 2027, Kabinendienst, Neuwahl Kassenwart.', { isAnnouncement: true }),
      ]
    case E2E_CHANNELS.coaches:
      return [
        msg(2 * HOUR, COACH, 'Wie sieht es bei euch mit dem Kader für Samstag aus?'),
        msg(45 * MIN, JENS, 'Kader für Samstag steht, Lukas fällt mit Zerrung aus.'),
      ]
    case E2E_CHANNELS.board:
      return [
        msg(5 * HOUR, MARA, 'Platzbelegung für die Hallensaison ist raus. Bitte bis Freitag prüfen, ob eure Trainingszeiten passen.'),
      ]
    case E2E_CHANNELS.carpool:
      return [
        msg(3 * 24 * HOUR, TIM, 'Wer fährt Samstag nach Babelsberg?'),
        msg(2 * 24 * HOUR, me === JULIAN.id ? { id: me, name: JULIAN.name } : TIM, 'Ich hab noch zwei Plätze frei, Abfahrt 12:45 am Sportplatz.'),
      ]
    default:
      break
  }

  return [
    msg(26 * HOUR, COACH, 'Training Dienstag 18:30 auf dem Kunstrasen. Bitte pünktlich, wir üben Standards.'),
    msg(25 * HOUR, TIM, 'Bin dabei!'),
    msg(4 * HOUR, COACH, 'Umfrage: Mannschaftsabend nach dem Spiel?', {
      messageType: 'POLL',
      content: 'Mannschaftsabend nach dem Spiel?',
    }),
    msg(90 * MIN, COACH, 'SV Albatros – SV Babelsberg 03', {
      messageType: 'RSVP_POLL',
      attachmentMeta: {
        eventId: 'event-match-next',
        eventDate: new Date(now + 3 * 24 * HOUR).toISOString(),
        eventType: 'MATCH',
        location: 'Sportplatz am Wasserturm',
      } as unknown as ChatMessage['attachmentMeta'],
    }),
    msg(60 * MIN, COACH, 'GK Becker · Weber, Hoffmann, Krause, Yilmaz · Schulz, Wagner · …', {
      messageType: 'LINEUP',
      attachmentMeta: { formation: '4-4-2' } as unknown as ChatMessage['attachmentMeta'],
    }),
    msg(20 * MIN, { id: me, name: 'Du' }, 'Bis Samstag, auf geht’s!'),
    msg(12 * MIN, LUKAS, 'Wer nimmt Samstag die Hütchen mit?', {
      reactions: [{ emoji: '👍', count: 2, userIds: [COACH.id, TIM.id] }],
    }),
  ]
}

/** Seeded direct-message threads. */
export function buildE2EDmMessages(
  conversationId: string,
  viewerId: string,
  viewerName: string,
): DmMessage[] {
  const now = Date.now()
  const line = (offset: number, sender: { id: string; name: string }, content: string): DmMessage => ({
    id: `e2e-dm-${conversationId}-${offset}`,
    conversationId,
    senderId: sender.id,
    senderName: sender.name,
    content,
    createdAt: iso(offset, now),
  })
  const me = { id: viewerId, name: viewerName }
  // Chat revamp: a coach↔player DM carries a shared Aufstellung (lineup
  // card) and a photo, so the attachment bubbles render in the demo.
  const lineupCard = (offset: number, sender: { id: string; name: string }): DmMessage => ({
    ...line(offset, sender, 'Heimspiel gegen SV Babelsberg 03'),
    id: `e2e-dm-${conversationId}-lineup`,
    messageType: 'LINEUP',
    attachmentMeta: {
      lineupSource: 'EVENT',
      eventId: 'event-match-1',
      title: 'Heimspiel gegen SV Babelsberg 03',
      opponent: 'SV Babelsberg 03',
      eventDate: new Date(now + 2 * 24 * HOUR).toISOString(),
      formation: '4-4-2',
      slots: E2E_LINEUP_SLOTS,
    },
  })
  const photo = (offset: number, sender: { id: string; name: string }): DmMessage => ({
    ...line(offset, sender, 'So stehen wir bei Standards'),
    id: `e2e-dm-${conversationId}-photo`,
    messageType: 'IMAGE',
    attachmentUrl: E2E_DM_PHOTO_URL,
    attachmentMeta: { width: 1200, height: 900 },
  })
  switch (conversationId) {
    case E2E_DMS.player:
      return [
        line(2 * HOUR, me, 'Hi Tim, schaffst du es Dienstag zum Training?'),
        line(90 * MIN, TIM, 'Ja, komme aber 10 Minuten später.'),
        lineupCard(60 * MIN, me),
        line(55 * MIN, me, 'Du spielst links im Mittelfeld. Achte auf die Rückwärtsbewegung.'),
        photo(40 * MIN, me),
        line(30 * MIN, TIM, 'Alles klar, Trainer. Bin bereit!'),
      ]
    case E2E_DMS.parent:
      return [
        line(27 * HOUR, me, 'Hallo Frau Becker, ist Julian wieder fit?'),
        line(26 * HOUR, NINA, 'Julian hat ab Montag wieder Training frei.'),
      ]
    case E2E_DMS.board:
      return [
        line(7 * HOUR, me, 'Ist die Freigabe für den Neuzugang schon da?'),
        line(6 * HOUR, COACH, 'Passantrag für den Neuzugang ist raus.'),
      ]
    default:
      return [
        line(3 * HOUR, me, 'Hallo Markus, bin am Samstag dabei.'),
        lineupCard(70 * MIN, COACH),
        photo(60 * MIN, COACH),
        line(50 * MIN, COACH, 'Kannst du Samstag auf der Sechs spielen?'),
      ]
  }
}
