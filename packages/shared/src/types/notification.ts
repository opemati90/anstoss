export interface NotificationPreference {
  id: string
  userId: string
  clubId: string
  teamId: string | null
  mutedChat: boolean
  mutedEvents: boolean
  mutedAnnouncements: boolean
  quietStart: string | null // "HH:mm"
  quietEnd: string | null   // "HH:mm"
  createdAt: string
  updatedAt: string
}

export type NotificationCategory = 'chat' | 'events' | 'announcements'

/**
 * Push template keys consumed by PushService.send(). The TEMPLATES map in
 * push.service.ts owns the human-readable copy + payload shape.
 */
export type PushNotificationKind =
  | 'CHAT_MESSAGE'
  | 'DM_MESSAGE'
  | 'ANNOUNCEMENT'
  | 'RSVP_UPDATE'
  | 'EVENT_REMINDER'
  | 'JOIN_REQUEST'
  | 'MESSAGE_REACTION'
  | 'MESSAGE_REPLY'
  | 'MENTION'
  | 'LINEUP_POSTED'
  | 'MATCH_STARTING'
  | 'GOAL_SCORED'
  | 'MATCH_FINAL'
