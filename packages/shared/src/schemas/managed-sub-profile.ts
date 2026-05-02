import { z } from 'zod'

export const createManagedSubProfileSchema = z.object({
  fullName: z.string().min(1).max(80),
  dateOfBirth: z.string().datetime(),
  teamId: z.string().min(1),
  rosterSlotId: z.string().min(1),
})
export type CreateManagedSubProfileInput = z.infer<
  typeof createManagedSubProfileSchema
>
