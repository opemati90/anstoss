import { z } from 'zod'

export const createClubSchema = z.object({
  name: z.string().min(2, 'Club name must be at least 2 characters').max(50),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color (e.g. #D50000)'),
})

export const createTeamSchema = z.object({
  name: z.string().min(2, 'Team name must be at least 2 characters').max(50),
  ageGroup: z.string().max(30).optional(),
  seasonStart: z.string().optional(),
})

export type CreateClubInput = z.infer<typeof createClubSchema>
export type CreateTeamInput = z.infer<typeof createTeamSchema>
