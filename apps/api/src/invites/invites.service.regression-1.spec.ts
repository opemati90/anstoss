import '../../test/future-capabilities'

import { BadRequestException, ConflictException } from '@nestjs/common'
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
      $executeRaw: jest.fn().mockResolvedValue(1),
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'user-1' }]) },
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
      { assertCanActivatePlayer: jest.fn().mockResolvedValue(undefined) } as never,
    )

    await expect(service.redeem(invite.code, 'user-1')).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.membership.upsert).not.toHaveBeenCalled()
    expect(tx.teamAccess.upsert).not.toHaveBeenCalled()
  })

  it('does not redeem access for an account deleted before the lifecycle lock', async () => {
    const invite = {
      id: 'invite-1',
      code: 'B'.repeat(32),
      clubId: 'club-1',
      teamId: 'team-1',
      kind: InviteKind.MEMBER_INVITE,
      role: TeamRole.PLAYER,
      phase: TeamAccessPhase.FULL,
      status: InviteStatus.PENDING,
      recipientEmail: null,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      club: { id: 'club-1', name: 'Club', slug: 'club' },
      team: { id: 'team-1', name: 'Team', displayName: 'Team', group: {} },
      parentalConsent: null,
    }
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      user: { findMany: jest.fn().mockResolvedValue([]) },
      invite: { updateMany: jest.fn() },
      membership: { upsert: jest.fn() },
      teamAccess: { upsert: jest.fn() },
      teamMember: { upsert: jest.fn() },
    }
    const prisma = {
      invite: { findUnique: jest.fn().mockResolvedValue(invite) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'player@example.com',
          name: 'Player',
          dateOfBirth: new Date('1990-01-01'),
          preferredLanguage: 'en',
        }),
      },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new InvitesService(
      prisma as never,
      {} as never,
      {} as never,
      { assertCanActivatePlayer: jest.fn() } as never,
    )

    await expect(service.redeem(invite.code, 'user-1')).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(tx.invite.updateMany).not.toHaveBeenCalled()
    expect(tx.membership.upsert).not.toHaveBeenCalled()
  })
})

describe('InvitesService parental quota enforcement', () => {
  it('checks the player seat before parental approval activates a pending minor', async () => {
    const invite = {
      id: 'approval-1',
      clubId: 'club-1',
      teamId: 'team-1',
      phase: TeamAccessPhase.FULL,
      status: InviteStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
      recipientEmail: 'parent@example.com',
      childName: 'Junior',
      club: { id: 'club-1' },
      team: { id: 'team-1' },
      parentalConsent: { id: 'consent-1', playerUserId: 'child-1' },
    }
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'child-1' }, { id: 'parent-1' }]),
      },
      invite: { update: jest.fn() },
      membership: { upsert: jest.fn().mockResolvedValue({}) },
      teamAccess: { upsert: jest.fn().mockResolvedValue({}) },
      teamMember: { upsert: jest.fn() },
      parentalConsent: { update: jest.fn() },
      guardianRelationship: { create: jest.fn() },
    }
    const quota = jest.fn().mockRejectedValue(new ConflictException('plan limit'))
    const prisma = {
      invite: { findUnique: jest.fn().mockResolvedValue(invite) },
      // onboarding review fix (B2): the approving guardian is an adult.
      user: { findUnique: jest.fn().mockResolvedValue({ dateOfBirth: new Date('1985-05-01') }) },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new InvitesService(
      prisma as never,
      {} as never,
      {} as never,
      { assertCanActivatePlayer: quota } as never,
    )

    await expect(
      (
        service as unknown as {
          redeemParentApproval: (
            inviteId: string,
            user: { id: string; email: string; name: string },
          ) => Promise<unknown>
        }
      ).redeemParentApproval(
        invite.id,
        { id: 'parent-1', email: 'parent@example.com', name: 'Parent' },
      ),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(quota).toHaveBeenCalledWith('club-1', 'child-1', tx)
    expect(tx.teamMember.upsert).not.toHaveBeenCalled()
  })
})

// onboarding review fix (B2): a 17-year-old cannot approve for a child.
describe('InvitesService parent approval guardian age', () => {
  it('rejects a guardian account without an 18+ DOB before touching access', async () => {
    const invite = {
      id: 'invite-2',
      recipientEmail: 'teen@example.com',
      clubId: 'club-1',
      teamId: 'team-1',
      club: { id: 'club-1' },
      team: { id: 'team-1' },
      parentalConsent: { id: 'consent-2', playerUserId: 'child-2' },
    }
    const seventeen = new Date()
    seventeen.setFullYear(seventeen.getFullYear() - 17)
    const prisma = {
      invite: { findUnique: jest.fn().mockResolvedValue(invite) },
      user: { findUnique: jest.fn().mockResolvedValue({ dateOfBirth: seventeen }) },
      $transaction: jest.fn(),
    }
    const service = new InvitesService(prisma as never, {} as never, {} as never, {} as never)
    await expect(
      (
        service as unknown as {
          redeemParentApproval: (id: string, user: { id: string; email: string; name: string }) => Promise<unknown>
        }
      ).redeemParentApproval('invite-2', { id: 'teen', email: 'teen@example.com', name: 'Teen' }),
    ).rejects.toMatchObject({ response: { code: 'GUARDIAN_UNDER_18' } })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

// onboarding review fix (B2/M3): age rules at redemption.
describe('InvitesService.redeem age rules', () => {
  function setup(dob: Date | null, role: string) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u-1',
          email: 'tim@example.de',
          name: 'Tim',
          dateOfBirth: dob,
          preferredLanguage: 'de',
        }),
      },
      $transaction: jest.fn(),
    }
    const service = new InvitesService(prisma as never, {} as never, {} as never, {} as never)
    ;(service as unknown as { validate: jest.Mock }).validate = jest.fn().mockResolvedValue({
      id: 'inv-1',
      clubId: 'club-1',
      teamId: 'team-1',
      role,
      kind: 'MEMBER_INVITE',
      recipientEmail: null,
    })
    return { service, prisma }
  }
  const yearsAgo = (n: number) => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - n)
    d.setDate(d.getDate() - 5)
    return d
  }

  it('refuses a parent invite for an account under 18', async () => {
    const { service, prisma } = setup(yearsAgo(17), 'PARENT')
    await expect(service.redeem('E2EINV01', 'u-1')).rejects.toMatchObject({
      response: { code: 'GUARDIAN_UNDER_18' },
    })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('refuses a parent invite for a legacy account without a DOB', async () => {
    const { service } = setup(null, 'PARENT')
    await expect(service.redeem('E2EINV01', 'u-1')).rejects.toMatchObject({
      response: { code: 'GUARDIAN_UNDER_18' },
    })
  })

  it('refuses any invite for an under-13 account', async () => {
    const { service } = setup(yearsAgo(11), 'PLAYER')
    await expect(service.redeem('E2EINV01', 'u-1')).rejects.toMatchObject({
      response: { code: 'UNDER_13' },
    })
  })
})
