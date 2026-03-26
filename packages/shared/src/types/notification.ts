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
