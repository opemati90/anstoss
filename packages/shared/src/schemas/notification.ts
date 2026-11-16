import { z } from 'zod'

const hhmmRegex = /^([01]\d|2[0-3]):[0-5]\d$/

export const upsertNotificationPreferenceSchema = z.object({
  teamId: z.string().nullable().optional(),
  mutedChat: z.boolean().optional(),
  mutedEvents: z.boolean().optional(),
  mutedAnnouncements: z.boolean().optional(),
  quietTimeZone: z.string().min(1).max(100).refine((value) => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true }
    catch { return false }
  }, 'Must be a valid IANA timezone').optional(),
  quietStart: z
    .string()
    .regex(hhmmRegex, 'Must be HH:mm format')
    .nullable()
    .optional(),
  quietEnd: z
    .string()
    .regex(hhmmRegex, 'Must be HH:mm format')
    .nullable()
    .optional(),
})

export type UpsertNotificationPreference = z.infer<
  typeof upsertNotificationPreferenceSchema
>

// ── Notifications inbox (2026-11 redesign, screen 09 Mitteilungen) ──────────

export const notificationInboxQuerySchema = z.object({
  /** Opaque cursor from the previous page's `nextCursor`. */
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
})

export type NotificationInboxQuery = z.infer<typeof notificationInboxQuerySchema>
