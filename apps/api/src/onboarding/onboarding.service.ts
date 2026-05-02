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
}
