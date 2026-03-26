import { z } from 'zod'

const hhmmRegex = /^([01]\d|2[0-3]):[0-5]\d$/

export const upsertNotificationPreferenceSchema = z.object({
  teamId: z.string().nullable().optional(),
  mutedChat: z.boolean().optional(),
  mutedEvents: z.boolean().optional(),
  mutedAnnouncements: z.boolean().optional(),
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
