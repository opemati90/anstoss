import { z } from 'zod'

export const eventTypeSchema = z.enum(['TRAINING', 'MATCH', 'OTHER'])

export const homeAwaySchema = z.enum(['HOME', 'AWAY'])
export type HomeAway = z.infer<typeof homeAwaySchema>

const isoDateString = z
  .string()
  .refine((val) => !isNaN(new Date(val).getTime()), 'Invalid date')

/**
 * Matchday logistics shared by create + update. `meetingAt` is the Treffpunkt
 * time (before kickoff); `opponent` + `homeAway` describe a match without
 * encoding it in the title; `carpoolEnabled` opens the Fahrten board.
 */
const eventLogisticsShape = {
  meetingAt: isoDateString.nullable().optional(),
  meetingPoint: z.string().trim().max(200).nullable().optional(),
  opponent: z.string().trim().max(100).nullable().optional(),
  homeAway: homeAwaySchema.nullable().optional(),
  carpoolEnabled: z.boolean().optional(),
  /** Length in minutes (Training 90). Lets calendars and the list show an end. */
  durationMin: z.number().int().min(15).max(600).nullable().optional(),
  /**
   * "Team benachrichtigen" (design 12): remind members who have not answered
   * 24 h before the start. Default true on the server. Proposed contract,
   * see docs/redesign/BACKEND_GAPS.md.
   */
  rsvpAutoReminder: z.boolean().optional(),
}

/**
 * Title of a new event. Optional for a Training (the app shows "Training" in
 * the reader's language) and for a match with an opponent (shown as
 * "Heimspiel gegen X" in the reader's language); required otherwise.
 */
const optionalTitle = z
  .string()
  .trim()
  .max(100)
  .nullable()
  .optional()
  .refine((value) => !value || value.length >= 2, 'Title must be at least 2 characters')

function hasTitleOrDefault(data: {
  title?: string | null
  type: z.infer<typeof eventTypeSchema>
  opponent?: string | null
}) {
  if (data.title && data.title.trim().length >= 2) return true
  if (data.type === 'TRAINING') return true
  return data.type === 'MATCH' && Boolean(data.opponent?.trim())
}
const titleRequiredIssue = { message: 'Title must be at least 2 characters', path: ['title'] }

export const createEventSchema = z
  .object({
    title: optionalTitle,
    type: eventTypeSchema,
    date: z.string().refine((val) => {
      const date = new Date(val)
      return !isNaN(date.getTime()) && date > new Date()
    }, 'Event date must be in the future'),
    teamId: z.string().min(1, 'Team is required'),
    location: z.string().max(200).optional(),
    notes: z.string().max(1000).optional(),
    ...eventLogisticsShape,
  })
  .refine(hasTitleOrDefault, titleRequiredIssue)
  .refine(
    (data) => !data.meetingAt || new Date(data.meetingAt).getTime() <= new Date(data.date).getTime(),
    { message: 'Meeting time must be before the start', path: ['meetingAt'] },
  )

export type CreateEventInput = z.infer<typeof createEventSchema>

/** Which occurrences an edit or cancel applies to, for series events. */
export const eventEditScopeSchema = z.enum(['this', 'following'])
export type EventEditScope = z.infer<typeof eventEditScopeSchema>

/** Body of DELETE /events/:id — a soft cancel with an optional one-line reason. */
export const cancelEventSchema = z.object({
  reason: z.string().trim().max(200).optional(),
  scope: eventEditScopeSchema.optional(),
})

/**
 * Weeks a series may span. A multi-day series (Di + Do) may hold this many
 * occurrences per chosen weekday, so a two-day training plan still fits a
 * whole season. 53, not 52: "Bis Saisonende" from 1 July to 30 June touches
 * 53 calendar weeks.
 */
export const MAX_SERIES_OCCURRENCES = 53
/** Training days per series. More than four a week is not an amateur plan. */
export const MAX_SERIES_WEEKDAYS = 4
const MAX_SERIES_DURATION_MS = 366 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** Weekday numbers follow Date#getDay in Europe/Berlin: 0 = Sunday … 6 = Saturday. */
export const weekdaySchema = z.number().int().min(0).max(6)

/** A recurring event: the first occurrence plus the rule. */
export const createEventSeriesSchema = z
  .object({
    title: optionalTitle,
    type: eventTypeSchema,
    date: z.string().refine((val) => {
      const date = new Date(val)
      return !isNaN(date.getTime()) && date > new Date()
    }, 'Event date must be in the future'),
    teamId: z.string().min(1, 'Team is required'),
    location: z.string().max(200).optional(),
    notes: z.string().max(1000).optional(),
    ...eventLogisticsShape,
    repeat: z.object({
      intervalWeeks: z.union([z.literal(1), z.literal(2)]),
      until: z.string().refine((val) => !isNaN(new Date(val).getTime()), 'Invalid until date'),
      /**
       * Training days of the week. Omitted or empty = the weekday of `date`
       * (the original single-day behaviour).
       */
      weekdays: z.array(weekdaySchema).max(MAX_SERIES_WEEKDAYS).optional(),
    }),
  })
  .refine(
    (data) => {
      const first = new Date(data.date).getTime()
      const until = new Date(data.repeat.until).getTime()
      const spanMs = until - first
      const dayCount = Math.max(1, new Set(data.repeat.weekdays ?? []).size)
      const weeks = Math.floor(spanMs / (data.repeat.intervalWeeks * 7 * DAY_MS)) + 1
      return (
        until >= first &&
        spanMs <= MAX_SERIES_DURATION_MS &&
        weeks <= MAX_SERIES_OCCURRENCES &&
        dayCount <= MAX_SERIES_WEEKDAYS
      )
    },
    {
      message: 'Repeat end must be after the first date, within a year, and no more than 53 weeks',
      path: ['repeat', 'until'],
    },
  )
  .refine(hasTitleOrDefault, titleRequiredIssue)
  .refine(
    (data) => !data.meetingAt || new Date(data.meetingAt).getTime() <= new Date(data.date).getTime(),
    { message: 'Meeting time must be before the start', path: ['meetingAt'] },
  )
export type CreateEventSeriesInput = z.infer<typeof createEventSeriesSchema>

export type CancelEventInput = z.infer<typeof cancelEventSchema>

/**
 * PATCH body. Every field is optional; `null` clears location, notes and
 * logistics, and `title: null` goes back to the derived title. The date is
 * any valid date: the server refuses moving an upcoming event into the past,
 * but a coach can still correct a past event's notes, place or time.
 */
export const updateEventSchema = z
  .object({
    title: optionalTitle,
    type: eventTypeSchema.optional(),
    date: isoDateString.optional(),
    location: z.string().max(200).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    ...eventLogisticsShape,
    /** Series events: apply to this occurrence or to this and all following. */
    scope: z.enum(['this', 'following']).optional(),
  })
  .refine(
    (data) =>
      !data.meetingAt ||
      !data.date ||
      new Date(data.meetingAt).getTime() <= new Date(data.date).getTime(),
    { message: 'Meeting time must be before the start', path: ['meetingAt'] },
  )

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

// ─── Kader (squad nomination) ───────────────────────────────────────────────

/** PUT /events/:id/squad — the coach's Kader. `publish` notifies the nominated. */
export const updateEventSquadSchema = z.object({
  userIds: z.array(z.string().min(1)).max(60),
  publish: z.boolean().optional(),
})
export type UpdateEventSquadInput = z.infer<typeof updateEventSquadSchema>

// ─── Aufstellung (lineup keyed by event) ────────────────────────────────────

const eventLineupPlayerSchema = z.object({
  userId: z.string().min(1).nullable().optional(),
  number: z.number().int().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  position: z.string().max(20).nullable().optional(),
  /** Formation slot id ("GK", "CB1", …) so the builder can restore the pitch. */
  slotId: z.string().max(12).nullable().optional(),
})

export const saveEventLineupSchema = z.object({
  formation: z.string().trim().min(1).max(20),
  starters: z.array(eventLineupPlayerSchema).min(1).max(11),
  bench: z.array(eventLineupPlayerSchema).max(25).optional().default([]),
})
export type SaveEventLineupInput = z.infer<typeof saveEventLineupSchema>

// ─── Fahrgemeinschaft (carpool keyed by event) ──────────────────────────────

export const createCarpoolRideSchema = z.object({
  seats: z.number().int().min(1).max(8),
  departFrom: z.string().trim().max(120).nullable().optional(),
  departAt: isoDateString.nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
})
export type CreateCarpoolRideInput = z.infer<typeof createCarpoolRideSchema>

/** Take or leave a seat. A parent books for a child with `childUserId`. */
export const carpoolSeatSchema = z.object({
  childUserId: z.string().min(1).optional(),
})
export type CarpoolSeatInput = z.infer<typeof carpoolSeatSchema>

/**
 * Redesign 13 (event hero): "Kreisliga C · 11. Spieltag". The league and
 * matchday of a match, from the linked fussball.de fixture or typed by the
 * coach. Proposed contract (docs/redesign/BACKEND_GAPS.md).
 */
export const eventCompetitionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  matchday: z.number().int().min(1).max(99).nullable(),
})
export type EventCompetition = z.infer<typeof eventCompetitionSchema>
