import { z } from 'zod'

export const eventTypeSchema = z.enum(['TRAINING', 'MATCH', 'OTHER'])

export const createEventSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(100),
  type: eventTypeSchema,
  date: z.string().refine((val) => {
    const date = new Date(val)
    return !isNaN(date.getTime()) && date > new Date()
  }, 'Event date must be in the future'),
  teamId: z.string().min(1, 'Team is required'),
  location: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
})

export type CreateEventInput = z.infer<typeof createEventSchema>

/** Which occurrences an edit or cancel applies to, for series events. */
export const eventEditScopeSchema = z.enum(['this', 'following'])
export type EventEditScope = z.infer<typeof eventEditScopeSchema>

/** Body of DELETE /events/:id — a soft cancel with an optional one-line reason. */
export const cancelEventSchema = z.object({
  reason: z.string().trim().max(200).optional(),
  scope: eventEditScopeSchema.optional(),
})

export const MAX_SERIES_OCCURRENCES = 52
const MAX_SERIES_DURATION_MS = 366 * 24 * 60 * 60 * 1000

/** A recurring event: the first occurrence plus the rule. */
export const createEventSeriesSchema = createEventSchema.extend({
  repeat: z
    .object({
      intervalWeeks: z.union([z.literal(1), z.literal(2)]),
      until: z.string().refine((val) => !isNaN(new Date(val).getTime()), 'Invalid until date'),
    }),
}).refine(
  (data) => {
    const first = new Date(data.date).getTime()
    const until = new Date(data.repeat.until).getTime()
    const spanMs = until - first
    const intervalMs = data.repeat.intervalWeeks * 7 * 24 * 60 * 60 * 1000
    const occurrenceCount = Math.floor(spanMs / intervalMs) + 1
    return (
      until >= first &&
      spanMs <= MAX_SERIES_DURATION_MS &&
      occurrenceCount <= MAX_SERIES_OCCURRENCES
    )
  },
  {
    message: 'Repeat end must be after the first date, within a year, and no more than 52 events',
    path: ['repeat', 'until'],
  },
)
export type CreateEventSeriesInput = z.infer<typeof createEventSeriesSchema>

export type CancelEventInput = z.infer<typeof cancelEventSchema>

export const updateEventSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(100).optional(),
  type: eventTypeSchema.optional(),
  date: z.string().refine((val) => {
    const date = new Date(val)
    return !isNaN(date.getTime()) && date > new Date()
  }, 'Event date must be in the future').optional(),
  location: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  /** Series events: apply to this occurrence or to this and all following. */
  scope: z.enum(['this', 'following']).optional(),
})

export type UpdateEventInput = z.infer<typeof updateEventSchema>

export const eventFilterSchema = z.object({
  type: eventTypeSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  scope: z.enum(['upcoming', 'past']).optional(),
  /**
   * Restrict to events the current user is rostered for. Default false —
   * coaches/admins want the full team feed; players/parents see only
   * events that include them or their kid.
   */
  mine: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export type EventFilterInput = z.infer<typeof eventFilterSchema>
