import { BadRequestException } from '@nestjs/common'
import {
  InviteDeliveryChannel,
  InviteKind,
  InviteStatus,
  TeamAccessPhase,
  TeamRole,
} from '@anstoss/shared'
import { generateInviteCode, InvitesService } from './invites.service'
import { getClubId } from '../prisma/tenant.context'

// Regression: ISSUE-004 — weak/replayable invite tokens could grant duplicate access
// Found by /qa on 2026-08-21
// Report: .gstack/qa-reports/qa-report-anstoss-launch-2026-08-21.md
describe('InvitesService secure redemption', () => {
  it('generates a 128-bit uppercase hexadecimal token', () => {
    expect(generateInviteCode()).toMatch(/^[A-F0-9]{32}$/)
  })

  it('does not write access when another redemption wins the atomic claim', async () => {
    const invite = {
      id: 'invite-1',
      code: 'A'.repeat(32),
      clubId: 'club-1',
      teamId: 'team-1',
      createdById: 'creator-1',
      kind: InviteKind.MEMBER_INVITE,
      role: TeamRole.PLAYER,
      phase: TeamAccessPhase.FULL,
      deliveryChannel: InviteDeliveryChannel.LINK,
      status: InviteStatus.PENDING,
      recipientEmail: null,
      guardianEmail: null,
      childName: null,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      club: { id: 'club-1', name: 'Club', slug: 'club', badgeUrl: null, primaryColor: null },
      team: { id: 'team-1', name: 'Team', displayName: 'Team', group: {} },
      parentalConsent: null,
    }
    const tx = {
      invite: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
      membership: { upsert: jest.fn() },
      teamAccess: { upsert: jest.fn() },
      teamMember: { upsert: jest.fn() },
      guardianRelationship: { create: jest.fn() },
    }
    const prisma = {
      invite: { findUnique: jest.fn().mockResolvedValue(invite), update: jest.fn() },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'player@example.com',
          name: 'Player',
          dateOfBirth: new Date('1990-01-01'),
          preferredLanguage: 'en',
        }),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => {
        expect(getClubId()).toBe('club-1')
        return fn(tx)
      }),
    }
    const service = new InvitesService(
      prisma as never,
      {} as never,
      { postSystemMessage: jest.fn() } as never,
    )

    await expect(service.redeem(invite.code, 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(tx.membership.upsert).not.toHaveBeenCalled()
    expect(tx.teamAccess.upsert).not.toHaveBeenCalled()
  })
})
