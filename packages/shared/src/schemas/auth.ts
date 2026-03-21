import { z } from 'zod'

/**
 * Age gate: Germany GDPR Article 8 threshold is 16.
 * Users under 16 are blocked at registration until parental consent (Sprint 3).
 */
const MIN_AGE = 16

function getAge(dateOfBirth: Date): number {
  const today = new Date()
  let age = today.getFullYear() - dateOfBirth.getFullYear()
  const monthDiff = today.getMonth() - dateOfBirth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--
  }
  return age
}

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  dateOfBirth: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid date')
    .refine((val) => {
      const age = getAge(new Date(val))
      return age >= MIN_AGE
    }, `You must be at least ${MIN_AGE} years old to register`),
})

export type RegisterInput = z.infer<typeof registerSchema>

export { MIN_AGE, getAge }
