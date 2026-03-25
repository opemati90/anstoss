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

export const updateEventSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(100).optional(),
  type: eventTypeSchema.optional(),
  date: z.string().refine((val) => {
    const date = new Date(val)
    return !isNaN(date.getTime()) && date > new Date()
  }, 'Event date must be in the future').optional(),
  location: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
})

export type UpdateEventInput = z.infer<typeof updateEventSchema>
