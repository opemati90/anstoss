import { Injectable, NotFoundException } from '@nestjs/common'
import {
  AGE_GATE,
  ParentalConsentStatus,
  TeamAccessDeniedError,
  RosterSlotAlreadyClaimedError,
  UserAlreadyOnRosterError,
  type BulkRosterSlotsInput,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'

/** Mirror the age-gate guard's age calculation. */
function getAge(dateOfBirth: Date): number {
  const today = new Date()
  let age = today.getFullYear() - dateOfBirth.getFullYear()
  const monthDiff = today.getMonth() - dateOfBirth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--
  }
  return age
}

const MANAGER_ROLES = new Set(['OWNER', 'ADMIN'])

@Injectable()
export class RosterSlotsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertManager(userId: string, clubId: string) {
    const m = await this.prisma.membership.findFirst({ where: { userId, clubId } })
    if (!m || !MANAGER_ROLES.has(m.role)) {
      throw new TeamAccessDeniedError('You do not have access to manage roster slots.')
    }
  }

  async bulkCreate(clubId: string, teamId: string, userId: string, body: BulkRosterSlotsInput) {
    await this.assertManager(userId, clubId)
    const team = await this.prisma.team.findFirst({ where: { id: teamId, clubId } })
    if (!team) throw new NotFoundException('Team not found in this club')
    return this.prisma.$transaction(
      body.slots.map((s) =>
        this.prisma.rosterSlot.create({
          data: {
            teamId,
            fullName: s.fullName,
            phone: s.phone ? normalizePhone(s.phone) : null,
            dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth) : null,
            position: s.position ?? null,
            jerseyNumber: s.jerseyNumber ?? null,
          },
        }),
      ),
    )
  }

  async claim(teamId: string, slotId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.rosterSlot.findFirst({ where: { teamId, claimedByUserId: userId } })
      if (existing) throw new UserAlreadyOnRosterError()
      const slot = await tx.rosterSlot.findUnique({
        where: { id: slotId },
        include: { team: { select: { id: true, clubId: true } } },
      })
      if (!slot || slot.teamId !== teamId) throw new NotFoundException('Slot not found')
      // Defense-in-depth: short-circuit if we already know it's claimed (no write needed).
      if (slot.claimedByUserId) throw new RosterSlotAlreadyClaimedError()
      // Race-safe write: re-assert claimedByUserId: null at write-time. Under READ COMMITTED,
      // a concurrent transaction may have claimed this slot between our findUnique and update.
      // updateMany with the compound predicate atomically rejects in that case.
      const result = await tx.rosterSlot.updateMany({
        where: { id: slotId, claimedByUserId: null },
        data: { claimedByUserId: userId, claimedAt: new Date() },
      })
      if (result.count !== 1) {
        throw new RosterSlotAlreadyClaimedError()
      }

      // Claiming a roster slot is the moment a player becomes a member.
      // Without this, the player lands authenticated but with zero club
      // association and every team-scoped fetch 401s/403s. Mirror what
      // OnboardingService.claimSlot does: ensure Membership + TeamAccess
      // exist in the same transaction so home/agenda/chat work post-done.
      const clubId = slot.team.clubId

      // Age-gate: under-16 without approved parental consent must receive
      // PENDING access, consistent with GDPR Article 8 / German 16-yr rule.
      let teamAccessStatus: 'ACTIVE' | 'PENDING' = 'ACTIVE'
      const slotDob: Date | null = slot.dateOfBirth ?? null
      if (slotDob) {
        const age = getAge(slotDob)
        if (age < AGE_GATE.MIN_AGE) {
          const consents = await tx.parentalConsent.findMany({
            where: { playerUserId: userId },
            select: { status: true },
          })
          const hasApprovedConsent = consents.some(
            (c) => c.status === ParentalConsentStatus.APPROVED,
          )
          if (!hasApprovedConsent) {
            teamAccessStatus = 'PENDING'
          }
        }
      }

      const existingMembership = await tx.membership.findFirst({
        where: { userId, clubId },
      })
      if (!existingMembership) {
        await tx.membership.create({
          data: { userId, clubId, role: 'PLAYER' },
        })
      }
      const existingAccess = await tx.teamAccess.findFirst({
        where: { userId, teamId, role: 'PLAYER' },
      })
      if (!existingAccess) {
        await tx.teamAccess.create({
          data: {
            userId,
            teamId,
            clubId,
            role: 'PLAYER',
            status: teamAccessStatus,
          },
        })
      }

      const updatedSlot = await tx.rosterSlot.findUniqueOrThrow({ where: { id: slotId } })
      return updatedSlot
    })
  }

  async list(clubId: string, teamId: string, userId: string) {
    const m = await this.prisma.membership.findFirst({ where: { userId, clubId } })
    if (!m) throw new TeamAccessDeniedError('You do not have access to view roster slots.')
    const isManager = MANAGER_ROLES.has(m.role)
    return this.prisma.rosterSlot.findMany({
      where: { teamId, team: { clubId } },
      select: {
        id: true,
        teamId: true,
        fullName: true,
        position: true,
        jerseyNumber: true,
        claimedByUserId: true,
        claimedAt: true,
        createdAt: true,
        updatedAt: true,
        dateOfBirth: isManager,
      },
      orderBy: [{ jerseyNumber: 'asc' }, { fullName: 'asc' }],
    })
  }
}

export function normalizePhone(input: string): string {
  return input.replace(/\s+/g, '').trim()
}
