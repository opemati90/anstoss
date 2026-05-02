import { z } from 'zod'

export const playerPositionSchema = z.enum(['GK', 'DEF', 'MID', 'FWD'])

export const rosterSlotInputSchema = z.object({
  fullName: z.string().min(1).max(80),
  phone: z.string().min(6).max(32).optional(),
  dateOfBirth: z.string().datetime().optional(),
  position: playerPositionSchema.optional(),
  jerseyNumber: z.number().int().min(1).max(99).optional(),
})
export type RosterSlotInput = z.infer<typeof rosterSlotInputSchema>

export const bulkRosterSlotsInputSchema = z.object({
  slots: z.array(rosterSlotInputSchema).min(1).max(40),
})
export type BulkRosterSlotsInput = z.infer<typeof bulkRosterSlotsInputSchema>
