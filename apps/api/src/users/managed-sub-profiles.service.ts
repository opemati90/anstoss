import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
  ManagedSubProfileAgeError,
  ManagedSubProfileSlotUnavailableError,
  ParentalConsentStatus,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamRole,
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

  async create(
    parentUserId: string,
    input: ManagedSubProfileCreateInput,
  ) {
    assertUnder16(input.dateOfBirth)
    return this.prisma.$transaction((tx) =>
      this.createInTransaction(tx, parentUserId, input),
    )
  }

  async createInTransaction(
    tx: Prisma.TransactionClient,
    parentUserId: string,
    input: ManagedSubProfileCreateInput,
  ) {
    const dob = assertUnder16(input.dateOfBirth)

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${parentUserId}))`
    const activeParent = await tx.user.findFirst({
      where: { id: parentUserId, deletedAt: null },
      select: { id: true },
    })
    if (!activeParent) {
      throw new ManagedSubProfileSlotUnavailableError()
    }

    const slot = await tx.rosterSlot.findFirst({
      where: {
        id: input.rosterSlotId,
        teamId: input.teamId,
        claimedByUserId: null,
      },
      include: {
        team: { select: { id: true, clubId: true } },
      },
    })
    if (!slot || (input.expectedClubId && slot.team.clubId !== input.expectedClubId)) {
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

    // Race-safe claim: re-assert claimedByUserId: null at write-time. Under READ COMMITTED,
    // a concurrent transaction may have claimed this slot between our findFirst and update.
    // updateMany with the compound predicate atomically rejects, and the surrounding
    // transaction rolls back the user.create above.
    const result = await tx.rosterSlot.updateMany({
      where: { id: slot.id, claimedByUserId: null },
      data: {
        claimedByUserId: user.id,
        claimedAt: new Date(),
      },
    })
    if (result.count !== 1) {
      throw new ManagedSubProfileSlotUnavailableError()
    }
    const updatedSlot = await tx.rosterSlot.findUniqueOrThrow({ where: { id: slot.id } })

    await tx.membership.upsert({
      where: {
        userId_clubId: { userId: parentUserId, clubId: slot.team.clubId },
      },
      update: {},
      create: {
        userId: parentUserId,
        clubId: slot.team.clubId,
        role: 'PARENT',
      },
    })

    await tx.teamAccess.upsert({
      where: {
        teamId_userId_role: {
          teamId: slot.team.id,
          userId: parentUserId,
          role: TeamRole.PARENT,
        },
      },
      update: {
        status: TeamAccessStatus.ACTIVE,
        phase: TeamAccessPhase.FULL,
      },
      create: {
        userId: parentUserId,
        teamId: slot.team.id,
        clubId: slot.team.clubId,
        role: TeamRole.PARENT,
        status: TeamAccessStatus.ACTIVE,
        phase: TeamAccessPhase.FULL,
      },
    })

    await tx.membership.create({
      data: {
        userId: user.id,
        clubId: slot.team.clubId,
        role: 'PLAYER',
      },
    })

    await tx.teamAccess.create({
      data: {
        userId: user.id,
        teamId: slot.team.id,
        clubId: slot.team.clubId,
        role: 'PLAYER',
        status: 'ACTIVE',
      },
    })

    await tx.guardianRelationship.create({
      data: {
        clubId: slot.team.clubId,
        teamId: slot.team.id,
        parentUserId,
        playerUserId: user.id,
        childName: input.fullName,
      },
    })

    const guardianEmail = input.guardianEmail?.trim()
    if (guardianEmail) {
      const existingConsent = await tx.parentalConsent.findFirst({
        where: {
          teamId: slot.team.id,
          playerUserId: user.id,
          guardianEmail,
        },
        select: { id: true },
      })
      if (existingConsent) {
        await tx.parentalConsent.updateMany({
          where: { id: existingConsent.id },
          data: {
            guardianUserId: parentUserId,
            status: ParentalConsentStatus.APPROVED,
            approvedAt: new Date(),
          },
        })
      } else {
        await tx.parentalConsent.create({
          data: {
            clubId: slot.team.clubId,
            teamId: slot.team.id,
            playerUserId: user.id,
            guardianEmail,
            guardianUserId: parentUserId,
            status: ParentalConsentStatus.APPROVED,
            approvedAt: new Date(),
          },
        })
      }
    }

    return { user, slot: updatedSlot }
  }
}

type ManagedSubProfileCreateInput = CreateManagedSubProfileInput & {
  guardianEmail?: string | null
  expectedClubId?: string
}

function assertUnder16(dateOfBirth: string) {
  const dob = new Date(dateOfBirth)
  if (ageInYears(dob) >= UNDER_16_CUTOFF_YEARS) {
    throw new ManagedSubProfileAgeError()
  }
  return dob
}
