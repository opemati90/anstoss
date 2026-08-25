import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ChannelsService } from '../channels/channels.service'
import { normalizePhone } from '../teams/roster-slots.service'
import { AGE_GATE, ParentalConsentStatus } from '@anstoss/shared'
import { JoinRequestsService } from '../clubs/join-requests.service'
import { JOIN_CODE_LENGTH } from '../teams/team-join-code.util'

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
    @Optional() private readonly joinRequestsService?: JoinRequestsService,
  ) {}

  /**
   * The email-OTP product has no verified phone claim. A phone number typed by
   * a client is not proof of possession, so this legacy path must never be
   * reachable in a running environment. It remains available only under Jest
   * so the old claim transaction can be covered while clients migrate fully to
   * cryptographic invites and manager-approved join requests.
   */
  private assertLegacyPhoneClaimIsTestOnly() {
    if (process.env.NODE_ENV !== 'test') {
      throw new ForbiddenException(
        'Phone roster claims are unavailable. Ask a club manager for an invite.',
      )
    }
  }

  /**
   * Resolve the phone to match roster slots against, from a client-supplied
   * value. OTP users have no Clerk identity and the User model has no phone
   * column, so the coach-entered slot phone can't be looked up server-side;
   * the user supplies the phone they were invited on and we normalize it the
   * same way bulkCreate did when the coach entered it. Returns null for
   * empty/blank input so callers treat it as "no claims to resolve".
   */
  private resolvePhone(rawPhone: string | null | undefined): string | null {
    if (!rawPhone || typeof rawPhone !== 'string') return null
    const normalized = normalizePhone(rawPhone)
    return normalized.length >= 6 ? normalized : null
  }

  async listPendingClaims(rawPhone: string | null | undefined): Promise<PendingClaim[]> {
    this.assertLegacyPhoneClaimIsTestOnly()
    const phone = this.resolvePhone(rawPhone)
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

  async claimSlot(
    userId: string,
    rawPhone: string | null | undefined,
    slotId: string,
  ): Promise<{ clubId: string; teamId: string; consentRequired?: boolean }> {
    this.assertLegacyPhoneClaimIsTestOnly()
    const phone = this.resolvePhone(rawPhone)
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
      const effectiveDob: Date | null = slot.dateOfBirth ?? user?.dateOfBirth ?? null
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

      return {
        clubId: slot.team.clubId,
        teamId: slot.team.id,
        consentRequired: teamAccessStatus === 'PENDING',
      }
    })
  }

  /** Shared codes never grant access. Players create a manager-reviewed join
   * request; coaches create an inert staff claim for a club owner/admin.
   */
  async joinTeamByCode(
    userId: string,
    input: { joinCode: string; role: 'PLAYER' | 'COACH' },
  ): Promise<{ clubId: string; teamId: string; status: 'ACTIVE' | 'PENDING' }> {
    const code = input.joinCode.trim().toUpperCase()
    if (code.length !== JOIN_CODE_LENGTH) {
      throw new NotFoundException('Team not found for this code')
    }

    if (input.role === 'PLAYER') {
      if (!this.joinRequestsService) {
        throw new ForbiddenException('Team-code joining is temporarily unavailable')
      }
      const team = await this.prisma.team.findUnique({
        where: { joinCode: code },
        select: { id: true, clubId: true },
      })
      if (!team) throw new NotFoundException('Team not found for this code')
      await this.joinRequestsService.create(userId, team.clubId, {
        teamId: team.id,
        role: 'PLAYER',
      })
      return { clubId: team.clubId, teamId: team.id, status: 'PENDING' }
    }

    if (input.role === 'COACH') {
      const team = await this.prisma.team.findUnique({
        where: { joinCode: code },
        select: {
          id: true,
          clubId: true,
          club: { select: { directoryEntry: { select: { id: true } } } },
        },
      })
      if (!team) throw new NotFoundException('Team not found for this code')
      if (!team.club.directoryEntry) {
        throw new ForbiddenException('Ask a club administrator for a coach invitation')
      }
      const existing = await this.prisma.clubClaim.findFirst({
        where: {
          clubId: team.clubId,
          claimantUserId: userId,
          kind: 'STAFF_CLAIM',
          status: { in: ['SUBMITTED', 'NEEDS_INFO'] },
        },
      })
      if (!existing) {
        await this.prisma.clubClaim.create({
          data: {
            directoryEntryId: team.club.directoryEntry.id,
            clubId: team.clubId,
            claimantUserId: userId,
            kind: 'STAFF_CLAIM',
            desiredRole: 'COACH',
            requestedTeamIds: [team.id],
            requestedTeamRoles: ['ASSISTANT_COACH'],
            expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        })
      }
      return { clubId: team.clubId, teamId: team.id, status: 'PENDING' }
    }

    throw new ForbiddenException('Unsupported team-code role')
  }
}
