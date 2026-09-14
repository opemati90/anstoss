import type { ChatMessage } from '../hooks/useChat'

/**
 * Seeded chat history for E2E / demo sessions. The real chat history streams
 * over Socket.io (`socket.emit('history')`), which the E2E request mock does
 * NOT intercept — so without this the Chat tab always renders the empty state.
 * useChat short-circuits to this seed whenever an E2E session is active, so the
 * walkthrough flows can show a live team conversation.
 *
 * Senders map onto the seeded channel roster (see createChannelMembership in
 * session.ts). `viewerId` is the logged-in user; their own lines render on the
 * right. We intentionally keep this to the General channel — Announcements and
 * Coaches lazily fall back to an empty state, which is also a valid screen.
 */
export function buildE2EChatMessages(
  teamId: string,
  channelId: string | null,
  viewerId: string | null,
): ChatMessage[] {
  // Only the General/Team channel carries seeded history. Announcements
  // ('announcements') and Coaches ('coaches') fall back to the empty state.
  const GENERAL = new Set(['team', 'default', 'general'])
  const now = Date.now()
  const min = 60_000

  // The announcements channel carries the same notice the team-channel
  // banner previews, so tapping the banner lands on something.
  if (channelId === 'announcements') {
    return [
      {
        id: 'e2e-announcement-1',
        teamId,
        senderId: 'user-coach-1',
        senderName: 'Markus Hoffmann',
        senderAvatar: null,
        content: 'Kit wash rota starts this week\n\nCheck the Team tab for who is up first.',
        messageType: 'TEXT',
        isAnnouncement: true,
        createdAt: new Date(now - 30 * min).toISOString(),
        readByMe: true,
      },
    ]
  }
  if (channelId && !GENERAL.has(channelId)) return []
  const msg = (
    offsetMin: number,
    senderId: string,
    senderName: string,
    content: string,
    extra: Partial<ChatMessage> = {},
  ): ChatMessage => ({
    id: `e2e-msg-${offsetMin}-${senderId}`,
    teamId,
    senderId,
    senderName,
    senderAvatar: null,
    content,
    messageType: 'TEXT',
    createdAt: new Date(now - offsetMin * min).toISOString(),
    readByMe: true,
    ...extra,
  })

  return [
    msg(
      240,
      'user-coach-1',
      'Markus Hoffmann',
      'Reminder: training Tuesday 18:30 at Karl-Liebknecht-Stadion. Bring both kits.',
      { isAnnouncement: true },
    ),
    msg(180, 'user-player-2', 'Tim Weber', 'Bin dabei! 💪'),
    msg(
      150,
      'user-player-3',
      'Lukas Hoffmann',
      'Can someone bring the cones? Mine are still at the clubhouse.',
    ),
    msg(120, 'user-player-1', 'Julian Becker', "I'll grab them on the way.", {
      reactions: [{ emoji: '👍', count: 3, userIds: ['user-coach-1', 'user-player-2', 'user-player-3'] }],
    }),
    // A shared event renders as a card with the reply control inline.
    msg(90, 'user-coach-1', 'Markus Hoffmann', 'vs. SV Babelsberg 03', {
      messageType: 'RSVP_POLL',
      attachmentMeta: {
        eventId: 'event-match-next',
        eventDate: new Date(now + 3 * 24 * 60 * min).toISOString(),
        eventType: 'MATCH',
        location: 'Karl-Liebknecht-Stadion',
      } as unknown as ChatMessage['attachmentMeta'],
    }),
    msg(
      60,
      'user-coach-1',
      'Markus Hoffmann',
      'Lineup for Saturday vs SV Babelsberg 03 is posted — check the Events tab and RSVP.',
    ),
    msg(
      20,
      viewerId ?? 'user-player-1',
      'You',
      'See everyone Saturday. Auf geht’s! ⚽',
    ),
  ]
}
