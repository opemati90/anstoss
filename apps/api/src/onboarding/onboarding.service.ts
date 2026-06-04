import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { createClerkClient } from '@clerk/backend'
import { PrismaService } from '../prisma/prisma.service'
import { normalizePhone } from '../teams/roster-slots.service'

export type PendingClaim = {
  slotId: string
  fullName: string
  position: string | null
  jerseyNumber: number | null
  team: { id: string; name: string }
  club: { id: string; name: string; primaryColor: string | null; badgeUrl: string | null }
}

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolvePhone(clerkId: string): Promise<string | null> {
    const secret = process.env.CLERK_SECRET_KEY?.trim()
    if (!secret) return null
    try {
      const clerk = createClerkClient({ secretKey: secret })
      const u = await clerk.users.getUser(clerkId)
      const primaryId = u.primaryPhoneNumberId
      const primary = u.phoneNumbers.find((p) => p.id === primaryId)
      const raw = primary?.phoneNumber || u.phoneNumbers[0]?.phoneNumber || null
      return raw ? normalizePhone(raw) : null
    } catch {
      return null
    }
  }

  async listPendingClaims(clerkId: string): Promise<PendingClaim[]> {
    const phone = await this.resolvePhone(clerkId)
    if (!phone) return []
    const slots = await this.prisma.rosterSlot.findMany({
      where: { phone, claimedByUserId: null },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            club: { select: { id: true, name: true, primaryColor: true, badgeUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    return slots.map((s) => ({
      slotId: s.id,
      fullName: s.fullName,
      position: s.position,
      jerseyNumber: s.jerseyNumber,
      team: { id: s.team.id, name: s.team.name },
      club: {
        id: s.team.club.id,
        name: s.team.club.name,
        primaryColor: s.team.club.primaryColor,
        badgeUrl: s.team.club.badgeUrl,
      },
    }))
  }

  async claimSlot(userId: string, clerkId: string, slotId: string): Promise<{ clubId: string; teamId: string }> {
    const phone = await this.resolvePhone(clerkId)
    if (!phone) throw new ConflictException('Could not verify phone number')
    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.rosterSlot.findUnique({
        where: { id: slotId },
        include: { team: { select: { id: true, clubId: true } } },
      })
      if (!slot) throw new NotFoundException('Slot not found')
      if (slot.phone !== phone) throw new ConflictException('Phone does not match this slot')
      if (slot.claimedByUserId) throw new ConflictException('Slot already claimed')

      const result = await tx.rosterSlot.updateMany({
        where: { id: slotId, claimedByUserId: null },
        data: { claimedByUserId: userId, claimedAt: new Date() },
      })
      if (result.count !== 1) throw new ConflictException('Slot already claimed')

      // Copy slot's name + DOB to the user record (only if user hasn't filled them).
      const user = await tx.user.findUnique({ where: { id: userId } })
      if (user) {
        const updates: { name?: string; dateOfBirth?: Date } = {}
        if (!user.name || user.name === 'Player' || user.name.trim() === '') {
          updates.name = slot.fullName
        }
        if (!user.dateOfBirth && slot.dateOfBirth) updates.dateOfBirth = slot.dateOfBirth
        if (Object.keys(updates).length > 0) {
          await tx.user.update({ where: { id: userId }, data: updates })
        }
      }

      // Ensure club Membership (PLAYER) exists.
      const existingMembership = await tx.membership.findFirst({
        where: { userId, clubId: slot.team.clubId },
      })
      if (!existingMembership) {
        await tx.membership.create({
          data: { userId, clubId: slot.team.clubId, role: 'PLAYER' },
        })
      }

      // Ensure TeamAccess (PLAYER) exists.
      const existingAccess = await tx.teamAccess.findFirst({
        where: { userId, teamId: slot.team.id, role: 'PLAYER' },
      })
      if (!existingAccess) {
        await tx.teamAccess.create({
          data: {
            userId,
            teamId: slot.team.id,
            clubId: slot.team.clubId,
            role: 'PLAYER',
            status: 'ACTIVE',
          },
        })
      }

      return { clubId: slot.team.clubId, teamId: slot.team.id }
    })
  }

  /**
   * Team-code onboarding for non-admin roles. The team-code screen
   * collects {joinCode, role} from the user; this resolves to a team
   * and ensures Membership (+ TeamAccess for coaches) exists so the
   * user lands in the app with a real club association instead of an
   * orphaned authenticated session. Players land here too when their
   * coach hasn't pre-built a roster slot for them.
   *
   * Everyone joins as a PLAYER club member (never an orphaned session).
   * Coaches additionally get a PENDING TeamAccess so an admin reviews +
   * approves before they can manage the team; their coaching abilities
   * then flow from that approved TeamAccess, not from a club-level COACH
   * membership. Players get ACTIVE TeamAccess. (PARENT is cut from MVP.)
   */
  async joinTeamByCode(
    userId: string,
    input: { joinCode: string; role: 'PLAYER' | 'COACH' },
  ): Promise<{ clubId: string; teamId: string; status: 'ACTIVE' | 'PENDING' }> {
    const code = input.joinCode.trim().toUpperCase()
    if (!code) throw new ConflictException('Join code is required')

    return this.prisma.$transaction(async (tx) => {
      const team = await tx.team.findUnique({
        where: { joinCode: code },
        select: { id: true, clubId: true },
      })
      if (!team) throw new NotFoundException('Team not found for this code')

      // Self-service code join never grants a club-level COACH membership
      // (that would hand club-wide coach powers before any approval).
      // Everyone joins as PLAYER; a coach is elevated only via their
      // approved TeamAccess below, or by an admin promoting them later.
      const membershipRole = 'PLAYER'
      const existingMembership = await tx.membership.findFirst({
        where: { userId, clubId: team.clubId },
      })
      if (!existingMembership) {
        await tx.membership.create({
          data: { userId, clubId: team.clubId, role: membershipRole },
        })
      }

      // Parents don't get TeamAccess — guardians are tracked via
      // GuardianRelationship, not per-team access. Coaches get pending
      // access so the existing /team-access/:id/decision flow gates them.
      let status: 'ACTIVE' | 'PENDING' = 'ACTIVE'
      if (input.role === 'COACH') {
        const accessRole = 'ASSISTANT_COACH'
        const existingAccess = await tx.teamAccess.findFirst({
          where: { userId, teamId: team.id, role: accessRole },
        })
        if (!existingAccess) {
          await tx.teamAccess.create({
            data: {
              userId,
              teamId: team.id,
              clubId: team.clubId,
              role: accessRole,
              status: 'PENDING',
            },
          })
        }
        status = 'PENDING'
      } else if (input.role === 'PLAYER') {
        const existingAccess = await tx.teamAccess.findFirst({
          where: { userId, teamId: team.id, role: 'PLAYER' },
        })
        if (!existingAccess) {
          await tx.teamAccess.create({
            data: {
              userId,
              teamId: team.id,
              clubId: team.clubId,
              role: 'PLAYER',
              status: 'ACTIVE',
            },
          })
        }
      }

      return { clubId: team.clubId, teamId: team.id, status }
    })
  }
}
