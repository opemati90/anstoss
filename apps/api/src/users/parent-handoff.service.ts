import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AGE_GATE, getAge, type RedeemParentHandoffInput } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'
import { ManagedSubProfilesService } from './managed-sub-profiles.service'

/**
 * Guardian-side of the under-16 handoff. A child who hit the age gate at
 * sign-up had their account removed and a {@link ParentHandoff} minted. The
 * guardian installs Anstoss, registers their own account, and redeems the code
 * to create a managed sub-profile (the child's name + DOB come from the server
 * record, not the client, so they can't be tampered with).
 */
@Injectable()
export class ParentHandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly managedSubProfiles: ManagedSubProfilesService,
  ) {}

  /** Preview a code so the app can show whom it's setting up before picking a slot. */
  async getByCode(parentUserId: string, code: string) {
    const handoff = await this.getPendingHandoff(code)
    await this.assertGuardianEmail(parentUserId, handoff.guardianEmail)
    return {
      childFirstName: handoff.childFirstName,
      childDateOfBirth: handoff.childDateOfBirth.toISOString(),
    }
  }

  /**
   * Preview a team code under a valid handoff and expose only unclaimed roster
   * slots. This lets a parent place the child without first gaining broad club
   * membership or staff-only roster permissions.
   */
  async getTeamForCode(parentUserId: string, code: string, rawJoinCode: string) {
    const handoff = await this.getPendingHandoff(code)
    await this.assertGuardianEmail(parentUserId, handoff.guardianEmail)
    const joinCode = rawJoinCode.trim().toUpperCase()
    const team = await this.prisma.team.findUnique({
      where: { joinCode },
      select: {
        id: true,
        name: true,
        displayName: true,
        clubId: true,
        club: {
          select: {
            id: true,
            name: true,
            badgeUrl: true,
            primaryColor: true,
          },
        },
        rosterSlots: {
          where: { claimedByUserId: null },
          select: {
            id: true,
            fullName: true,
            position: true,
            jerseyNumber: true,
          },
          orderBy: [{ fullName: 'asc' }],
        },
      },
    })
    if (!team) {
      throw new NotFoundException('Team not found for this code')
    }

    return {
      team: {
        id: team.id,
        clubId: team.clubId,
        name: team.name,
        displayName: team.displayName,
      },
      club: team.club,
      rosterSlots: team.rosterSlots,
    }
  }

  /**
   * Redeem a handoff: create the managed sub-profile for the child against the
   * chosen team + roster slot, and burn the code. The claim is atomic
   * (PENDING → REDEEMED) so two guardians can't redeem the same code twice; if
   * sub-profile creation fails (e.g. the slot was taken), the claim is rolled
   * back so they can retry.
   */
  async redeem(parentUserId: string, input: RedeemParentHandoffInput) {
    const team = await this.prisma.team.findUnique({
      where: { joinCode: input.teamJoinCode.trim().toUpperCase() },
      select: { id: true, clubId: true },
    })
    if (!team) {
      throw new NotFoundException('Team not found for this code')
    }

    return tenantContext.run({ clubId: team.clubId, userId: parentUserId }, () =>
      this.prisma.$transaction(async (tx) => {
        const now = new Date()
        const handoff = await tx.parentHandoff.findUnique({
          where: { code: input.code.trim().toUpperCase() },
        })
        if (!handoff) {
          throw new NotFoundException('Invalid setup code')
        }
        if (handoff.status !== 'PENDING' || handoff.expiresAt < now) {
          throw new ConflictException('This setup code has already been used or expired')
        }

        await this.assertAdultGuardian(tx, parentUserId, handoff.guardianEmail)

        const claim = await tx.parentHandoff.updateMany({
          where: {
            id: handoff.id,
            status: 'PENDING',
            expiresAt: { gt: now },
          },
          data: {
            status: 'REDEEMED',
            redeemedByUserId: parentUserId,
            redeemedAt: now,
          },
        })
        if (claim.count !== 1) {
          throw new ConflictException('This setup code has already been used or expired')
        }

        const profile = await this.managedSubProfiles.createInTransaction(tx, parentUserId, {
          fullName: handoff.childFirstName,
          dateOfBirth: handoff.childDateOfBirth.toISOString(),
          teamId: team.id,
          rosterSlotId: input.rosterSlotId,
          guardianEmail: handoff.guardianEmail,
          expectedClubId: team.clubId,
        })
        return { profile }
      })
    )
  }

  private async getPendingHandoff(code: string) {
    const handoff = await this.prisma.parentHandoff.findUnique({
      where: { code: code.trim().toUpperCase() },
    })
    if (!handoff) {
      throw new NotFoundException('Invalid setup code')
    }
    if (handoff.status !== 'PENDING' || handoff.expiresAt < new Date()) {
      throw new ConflictException('This setup code has already been used or expired')
    }
    return handoff
  }

  private async assertGuardianEmail(parentUserId: string, guardianEmail: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: parentUserId },
      select: { email: true },
    })
    if (normalizeEmail(user?.email) !== normalizeEmail(guardianEmail)) {
      throw new ForbiddenException('This setup code belongs to a different guardian email')
    }
  }

  private async assertAdultGuardian(
    tx: { user: { findUnique: (args: unknown) => Promise<{ email: string | null; dateOfBirth: Date | null } | null> } },
    parentUserId: string,
    guardianEmail: string,
  ) {
    const user = await tx.user.findUnique({
      where: { id: parentUserId },
      select: { email: true, dateOfBirth: true },
    })
    if (normalizeEmail(user?.email) !== normalizeEmail(guardianEmail)) {
      throw new ForbiddenException('This setup code belongs to a different guardian email')
    }
    if (!user?.dateOfBirth || getAge(user.dateOfBirth) < AGE_GATE.MIN_AGE) {
      throw new ForbiddenException('A parent or guardian must be at least 16')
    }
  }
}

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() || null
}
