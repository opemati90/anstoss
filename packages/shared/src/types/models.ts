/**
 * Data model types shared between API and mobile.
 *
 * Two-level model:
 *   User (global) → Membership (role) → Club (tenant root) → Team → TeamMember
 */

export interface User {
  id: string
  clerkId: string
  email: string
  name: string
  avatarUrl: string | null
  dateOfBirth: string // ISO date — used for age gate
  createdAt: string
  updatedAt: string
}

export interface Club {
  id: string
  name: string
  slug: string
  badgeUrl: string | null
  primaryColor: string // hex, e.g. #D50000
  createdAt: string
  updatedAt: string
}

export interface Team {
  id: string
  clubId: string
  name: string
  ageGroup: string | null
  seasonStart: string | null
  createdAt: string
}

export interface Membership {
  id: string
  userId: string
  clubId: string
  role: 'OWNER' | 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT'
  createdAt: string
}

export interface TeamMember {
  id: string
  teamId: string
  userId: string
  position: string | null
  jerseyNumber: number | null
}

export type RsvpStatus = 'YES' | 'MAYBE' | 'NO'

export interface Event {
  id: string
  teamId: string
  clubId: string
  title: string
  type: 'TRAINING' | 'MATCH' | 'OTHER'
  date: string // ISO datetime
  location: string | null
  notes: string | null
  createdById: string
  createdAt: string
}

export interface EventFeedItem extends Event {
  responseCount: number
  myRsvp: RsvpStatus | null
}

export interface Rsvp {
  id: string
  eventId: string
  userId: string
  status: RsvpStatus
  updatedAt: string
}

export interface Message {
  id: string
  teamId: string
  clubId: string
  senderId: string
  content: string
  isAnnouncement: boolean
  isPinned: boolean
  createdAt: string
}

export interface ChatMessage extends Message {
  senderName: string
}

export type PinnedMessage = ChatMessage
