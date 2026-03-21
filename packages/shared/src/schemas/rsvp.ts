import { z } from 'zod'

export const rsvpStatusSchema = z.enum(['YES', 'MAYBE', 'NO'])

export const updateRsvpSchema = z.object({
  status: rsvpStatusSchema,
})

export type UpdateRsvpInput = z.infer<typeof updateRsvpSchema>
