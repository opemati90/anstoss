import { Injectable } from '@nestjs/common'
import {
  ManagedSubProfileAgeError,
  ManagedSubProfileSlotUnavailableError,
  type CreateManagedSubProfileInput,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'

const UNDER_16_CUTOFF_YEARS = 16

function ageInYears(dob: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age
}

/**
 * ManagedSubProfilesService.create
 *
 * GDPR Article 8 (Germany) draws the line at 16: under-16 users cannot have
 * their own Clerk account/email. Instead, a parent registers the child as a
 * managed sub-profile and simultaneously claims a pre-built roster slot.
 *
 * Hard-rejects callers older than 16 — they must register their own account
 * via phone OTP rather than be created as a managed sub-profile.
 */
@Injectable()
export class ManagedSubProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(parentUserId: string, input: CreateManagedSubProfileInput) {
    const dob = new Date(input.dateOfBirth)
    if (ageInYears(dob) >= UNDER_16_CUTOFF_YEARS) {
      throw new ManagedSubProfileAgeError()
    }

    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.rosterSlot.findFirst({
        where: {
          id: input.rosterSlotId,
          teamId: input.teamId,
          claimedByUserId: null,
        },
      })
      if (!slot) {
        throw new ManagedSubProfileSlotUnavailableError()
      }

      const user = await tx.user.create({
        data: {
          name: input.fullName,
          dateOfBirth: dob,
          managedById: parentUserId,
          registrationRole: 'PLAYER',
        },
      })

      const updatedSlot = await tx.rosterSlot.update({
        where: { id: slot.id },
        data: {
          claimedByUserId: user.id,
          claimedAt: new Date(),
        },
      })

      return { user, slot: updatedSlot }
    })
  }
}
