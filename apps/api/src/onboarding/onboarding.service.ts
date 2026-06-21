import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { createClerkClient } from '@clerk/backend'
import { PrismaService } from '../prisma/prisma.service'
import { ChannelsService } from '../channels/channels.service'
import { normalizePhone } from '../teams/roster-slots.service'
import { AGE_GATE, ParentalConsentStatus } from '@anstoss/shared'

export type PendingClaim = {
  slotId: string
  fullName: string
  position: string | null
  jerseyNumber: number | null
  team: { id: string; name: string }
  club: { id: string; name: string; primaryColor: string | null; badgeUrl: string | null }
}

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

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelsService: ChannelsService,
  ) {}

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

  async claimSlot(userId: string, clerkId: string, slotId: string): Promise<{ clubId: string; teamId: string; consentRequired?: boolean }> {
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

      // Determine whether the player passes the age gate. The slot's DOB
      // was set by the coach; we just copied it to the user record above.
      // Claim is intentionally exempt from AgeGateGuard (which requires a
      // DOB to already exist on the user). Here we enforce the same rule
      // in-service: under-16 without approved parental consent → PENDING
      // access, consistent with GDPR Article 8 / German 16-year threshold.
      // Use the slot's DOB (set by the coach) as the authoritative source.
      // The user's own DOB (if already set) should agree; prefer the slot's
      // value since it is what triggered the claim.
      const effectiveDob: Date | null = slot.dateOfBirth ?? (user?.dateOfBirth ?? null)
      let teamAccessStatus: 'ACTIVE' | 'PENDING' = 'ACTIVE'
      if (effectiveDob) {
        const age = getAge(effectiveDob)
        if (age < AGE_GATE.MIN_AGE) {
          // Re-check the user record (may have just been updated above)
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
            status: teamAccessStatus,
          },
        })
      }

      return { clubId: slot.team.clubId, teamId: slot.team.id, consentRequired: teamAccessStatus === 'PENDING' }
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
   * Players get a PLAYER membership + ACTIVE TeamAccess.
   * Coaches get a PLAYER membership (intentional — approval is required
   * before coach privileges are granted) + a PENDING ASSISTANT_COACH
   * TeamAccess. On approval via decideCoachAccess / decideTrialAccess, the
   * TeamAccess becomes ACTIVE and the Membership is elevated to COACH.
   * Parent child-link setup is handled by ParentHandoffService.
   */
  async joinTeamByCode(
    userId: string,
    input: { joinCode: string; role: 'PLAYER' | 'COACH' },
  ): Promise<{ clubId: string; teamId: string; status: 'ACTIVE' | 'PENDING' }> {
    const code = input.joinCode.trim().toUpperCase()
    if (!code) throw new ConflictException('Join code is required')

    const result = await this.prisma.$transaction(async (tx) => {
      const team = await tx.team.findUnique({
        where: { joinCode: code },
        select: { id: true, clubId: true, name: true, displayName: true },
      })
      if (!team) throw new NotFoundException('Team not found for this code')

      // All code-joined users start with PLAYER membership. Coaches are
      // elevated to COACH membership only after a manager approves their
      // PENDING ASSISTANT_COACH TeamAccess (see teams.service.ts
      // decideTrialAccess / decidePendingCoachAccess). This prevents any
      // user from self-granting club-management powers via a shared join code.
      const existingMembership = await tx.membership.findFirst({
        where: { userId, clubId: team.clubId },
      })
      if (!existingMembership) {
        await tx.membership.create({
          data: { userId, clubId: team.clubId, role: 'PLAYER' },
        })
      }

      // Coaches get pending access so the existing /team-access/:id/decision
      // flow gates them. Parents use GuardianRelationship via parent handoff.
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

      return {
        clubId: team.clubId,
        teamId: team.id,
        teamDisplayName: team.displayName || team.name,
        status,
      }
    })

    // Best-effort system welcome message for new players — non-blocking
    if (result.status === 'ACTIVE') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      })
      if (user) {
        this.channelsService
          .postSystemMessage(result.clubId, result.teamId, `👋 ${user.name} joined ${result.teamDisplayName}.`)
          .catch(() => { /* tolerated */ })
      }
    }

    return { clubId: result.clubId, teamId: result.teamId, status: result.status }
  }
}
