/**
 * Rate limits, size limits, and thresholds.
 * Single source of truth — used by API middleware and mobile validation.
 */

// API rate limiting (Upstash Redis sliding window)
export const RATE_LIMIT = {
  WRITES_PER_SECOND: 5,
  READS_PER_SECOND: 20,
  CHAT_MESSAGES_PER_SECOND: 1,
  INVITE_LOOKUPS_PER_HOUR: 100,
} as const

// AsyncStorage LRU cache
export const CACHE = {
  MAX_SIZE_BYTES: 4 * 1024 * 1024, // 4MB
  STALE_THRESHOLD_MS: 5 * 60 * 1000, // 5 minutes
} as const

// File uploads
export const UPLOAD = {
  MAX_BADGE_SIZE_BYTES: 2 * 1024 * 1024, // 2MB
  BADGE_DIMENSIONS: 256, // 256x256 px
  ALLOWED_IMAGE_TYPES: ['image/png', 'image/jpeg', 'image/webp'] as const,
} as const

// Chat
export const CHAT = {
  MESSAGES_PER_SECOND: 1,
  MAX_MESSAGE_LENGTH: 2000,
  PAGE_SIZE: 50,
  TYPING_TIMEOUT_MS: 2000,
  RECONNECT_BACKOFF: [1000, 2000, 4000, 8000, 30000] as const, // ms
} as const

// Push notifications
export const PUSH = {
  BATCH_SIZE: 100,
  CHAT_BATCH_WINDOW_MS: 5 * 60 * 1000, // 5 minutes
} as const

// RSVP
export const RSVP = {
  DEBOUNCE_MS: 500,
} as const

// Skeleton loading
export const SKELETON = {
  MIN_DISPLAY_MS: 300,
} as const

// Age gate (GDPR Article 8, Germany = 16)
export const AGE_GATE = {
  MIN_AGE: 16,
} as const

// Invite codes
export const INVITE = {
  CODE_LENGTH: 8,
  EXPIRY_DAYS: 7,
  PARENT_APPROVAL_EXPIRY_DAYS: 14,
} as const

// Neon DB
export const DB = {
  PGBOUNCER_MAX_CONNECTIONS: 10,
} as const
