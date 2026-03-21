import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { MembershipRole, INVITE } from '@anstoss/shared'
import { randomBytes } from 'crypto'

@Injectable()
export class InvitesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an invite code for a club. Expires after INVITE.EXPIRY_DAYS.
   */
  async create(clubId: string) {
    const code = generateInviteCode()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + INVITE.EXPIRY_DAYS)

    return this.prisma.invite.create({
      data: {
        clubId,
        code,
        expiresAt,
      },
    })
  }

  /**
   * Validate an invite code — check it exists, hasn't expired, hasn't been consumed.
   */
  async validate(code: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            badgeUrl: true,
            primaryColor: true,
            slug: true,
          },
        },
      },
    })

    if (!invite) {
      throw new NotFoundException('Invite not found')
    }

    if (invite.consumedAt) {
      throw new BadRequestException('Invite already used')
    }

    if (invite.expiresAt < new Date()) {
      throw new BadRequestException('Invite expired')
    }

    return invite
  }

  /**
   * Redeem an invite — create membership for user + mark invite consumed.
   */
  async redeem(code: string, userId: string) {
    const invite = await this.validate(code)

    // Check if user is already a member
    const existing = await this.prisma.membership.findUnique({
      where: {
        userId_clubId: { userId, clubId: invite.clubId },
      },
    })

    if (existing) {
      throw new BadRequestException('Already a member of this club')
    }

    // Transaction: create membership + mark invite consumed
    const [membership] = await this.prisma.$transaction([
      this.prisma.membership.create({
        data: {
          userId,
          clubId: invite.clubId,
          role: MembershipRole.PLAYER,
        },
      }),
      this.prisma.invite.update({
        where: { id: invite.id },
        data: { consumedAt: new Date() },
      }),
    ])

    return { membership, club: invite.club }
  }

  /**
   * Regenerate invite — invalidate old one, create new.
   */
  async regenerate(clubId: string) {
    // Invalidate existing unused invites for this club
    await this.prisma.invite.updateMany({
      where: {
        clubId,
        consumedAt: null,
      },
      data: {
        expiresAt: new Date(), // expire immediately
      },
    })

    return this.create(clubId)
  }
}

function generateInviteCode(): string {
  return randomBytes(4).toString('hex').toUpperCase() // 8-char hex
}
