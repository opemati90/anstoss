import { BadRequestException } from '@nestjs/common'
import {
  InviteDeliveryChannel,
  InviteKind,
  InviteRecipientMismatchError,
  InviteStatus,
  MembershipRole,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamRole,
} from '@anstoss/shared'
import { generateCampaignCode, InvitesService } from './invites.service'

describe('invite campaign lifecycle', () => {
  it('generates eight-character uppercase manual codes without ambiguous characters', () => {
    for (let index = 0; index < 50; index += 1) {
      expect(generateCampaignCode()).toMatch(/^[2-9A-HJ-NP-Z]{8}$/)
    }
  })

  it('reports elapsed and exhausted active campaigns as effectively expired', async () => {
    const prisma = {
      membership: {
        findUnique: jest.fn().mockResolvedValue({ role: MembershipRole.ADMIN }),
      },
      inviteCampaign: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'elapsed',
            status: 'ACTIVE',
            expiresAt: new Date(Date.now() - 1_000),
            useCount: 0,
            maxUses: 10,
          },
          {
            id: 'exhausted',
            status: 'ACTIVE',
            expiresAt: new Date(Date.now() + 60_000),
            useCount: 10,
            maxUses: 10,
          },
          {
            id: 'usable',
            status: 'ACTIVE',
            expiresAt: new Date(Date.now() + 60_000),
            useCount: 2,
            maxUses: 10,
          },
        ]),
      },
    }
    const service = new InvitesService(prisma as never, {} as never, {} as never)

    await expect(service.listCampaigns('club-1', 'admin-1')).resolves.toEqual([
      expect.objectContaining({ id: 'elapsed', status: 'EXPIRED' }),
      expect.objectContaining({ id: 'exhausted', status: 'EXPIRED' }),
      expect.objectContaining({ id: 'usable', status: 'ACTIVE' }),
    ])
  })

  it('resolves a lowercase manual entry to a new uppercase campaign code', async () => {
    const campaign = {
      code: 'ABCD2345',
      type: 'APPROVAL_REQUIRED',
      role: TeamRole.PLAYER,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 60_000),
      useCount: 0,
      maxUses: 10,
      club: { id: 'club-1' },
      team: { id: 'team-1' },
    }
    const prisma = {
      inviteCampaign: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(campaign),
      },
    }
    const service = new InvitesService(prisma as never, {} as never, {} as never)

    await expect(service.validateCampaign('abcd2345')).resolves.toMatchObject({
      code: 'ABCD2345',
    })
    expect(prisma.inviteCampaign.findUnique).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { code: 'ABCD2345' } }),
    )
  })
})

describe('InvitesService — role propagation through redemption', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  function createService() {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      user: { findMany: jest.fn(({ where }) => Promise.resolve(where.id.in.map((id: string) => ({ id })))) },
      membership: {
        upsert: jest.fn().mockResolvedValue({ id: 'membership-1' }),
      },
      teamAccess: {
        findFirst: jest.fn().mockResolvedValue({ loanEndDate: null }),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'team-access-1' }),
      },
      teamMember: {
        upsert: jest.fn().mockResolvedValue({ id: 'team-member-1' }),
      },
      guardianRelationship: {
        create: jest.fn().mockResolvedValue({ id: 'guardian-relationship-1' }),
      },
      invite: {
        update: jest.fn().mockResolvedValue({ id: 'invite-1' }),
      },
    }

    const prisma = {
      invite: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      team: {
        findFirst: jest.fn(),
      },
      teamAccess: {
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    }

    const teamsService = {
      assertManageAccess: jest.fn(),
    }

    const channelsService = { postSystemMessage: jest.fn().mockResolvedValue(undefined) }
    const entitlements = { assertCanActivatePlayer: jest.fn().mockResolvedValue(undefined) }
    const service = new InvitesService(
      prisma as never,
      teamsService as never,
      channelsService as never,
      entitlements as never,
    )

    return { prisma, teamsService, service, tx }
  }

  function buildInvite(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'invite-1',
      code: 'CODE1234',
      clubId: 'club-1',
      teamId: 'team-1',
      createdById: 'creator-1',
      kind: InviteKind.MEMBER_INVITE,
      role: TeamRole.PLAYER,
      phase: TeamAccessPhase.FULL,
      deliveryChannel: InviteDeliveryChannel.LINK,
      status: InviteStatus.PENDING,
      recipientEmail: null,
      linkedPlayerUserId: null,
      guardianEmail: null,
      childName: null,
      acceptedAt: null,
      acceptedByUserId: null,
      revokedAt: null,
      parentalConsentId: null,
      parentalConsent: null,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      createdAt: new Date(),
      updatedAt: new Date(),
      club: {
        id: 'club-1',
        name: 'FC Test',
        slug: 'fc-test',
        badgeUrl: null,
        primaryColor: '#1E3A5F',
      },
      team: {
        id: 'team-1',
        clubId: 'club-1',
        displayName: 'Erste',
        group: {
          id: 'group-1',
          clubId: 'club-1',
          displayName: 'Herren',
          sortOrder: 0,
        },
      },
      ...overrides,
    }
  }

  function buildUser(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'user-1',
      email: 'me@test.com',
      name: 'Test User',
      dateOfBirth: new Date('1990-01-01'),
      ...overrides,
    }
  }

  describe('create', () => {
    it('creates a parent invite linked to an active player on the team', async () => {
      const { prisma, service, teamsService } = createService()
      const invite = buildInvite({
        role: TeamRole.PARENT,
        linkedPlayerUserId: 'player-user-1',
        guardianEmail: 'parent@example.com',
      })
      prisma.team.findFirst.mockResolvedValue({ id: 'team-1' })
      prisma.teamAccess.findFirst.mockResolvedValue({ id: 'access-1' })
      prisma.invite.create.mockResolvedValue(invite)

      const result = await service.create(
        'club-1',
        'admin-1',
        {
          teamId: 'team-1',
          role: TeamRole.PARENT,
          phase: TeamAccessPhase.FULL,
          deliveryChannel: InviteDeliveryChannel.LINK,
          linkedPlayerUserId: 'player-user-1',
          guardianEmail: 'Parent@Example.com',
        },
        MembershipRole.ADMIN,
      )

      expect(teamsService.assertManageAccess).toHaveBeenCalledWith('admin-1', 'team-1')
      expect(prisma.teamAccess.findFirst).toHaveBeenCalledWith({
        where: {
          teamId: 'team-1',
          userId: 'player-user-1',
          role: TeamRole.PLAYER,
          status: TeamAccessStatus.ACTIVE,
          OR: [{ loanEndDate: null }, { loanEndDate: { gt: expect.any(Date) } }],
        },
        select: { id: true, loanEndDate: true },
      })
      expect(prisma.invite.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: TeamRole.PARENT,
            linkedPlayerUserId: 'player-user-1',
            guardianEmail: 'parent@example.com',
          }),
        }),
      )
      expect(result.link).toContain('/join/fc-test/CODE1234')
    })

    it('rejects a parent invite linked to a user who is not an active team player', async () => {
      const { prisma, service } = createService()
      prisma.team.findFirst.mockResolvedValue({ id: 'team-1' })
      prisma.teamAccess.findFirst.mockResolvedValue(null)

      await expect(
        service.create(
          'club-1',
          'admin-1',
          {
            teamId: 'team-1',
            role: TeamRole.PARENT,
            phase: TeamAccessPhase.FULL,
            deliveryChannel: InviteDeliveryChannel.LINK,
            linkedPlayerUserId: 'not-on-team',
          },
          MembershipRole.ADMIN,
        ),
      ).rejects.toThrow(BadRequestException)

      expect(prisma.invite.create).not.toHaveBeenCalled()
    })
  })

  const roleCases: Array<{
    role: TeamRole
    expectedMembershipRole: MembershipRole
    inviteOverrides?: Partial<Record<string, unknown>>
  }> = [
    {
      role: TeamRole.HEAD_COACH,
      expectedMembershipRole: MembershipRole.COACH,
    },
    {
      role: TeamRole.ASSISTANT_COACH,
      expectedMembershipRole: MembershipRole.COACH,
    },
    {
      role: TeamRole.PLAYER,
      expectedMembershipRole: MembershipRole.PLAYER,
    },
    {
      role: TeamRole.PARENT,
      expectedMembershipRole: MembershipRole.PARENT,
      inviteOverrides: { linkedPlayerUserId: 'player-user-1' },
    },
  ]

  it.each(roleCases)(
    'propagates invite.role=$role verbatim to TeamAccess and maps membership to $expectedMembershipRole',
    async ({ role, expectedMembershipRole, inviteOverrides }) => {
      const { prisma, service, tx } = createService()

      const invite = buildInvite({ role, ...(inviteOverrides ?? {}) })
      const user = buildUser()

      // validate() call
      prisma.invite.findUnique.mockResolvedValueOnce(invite)
      // activateMembershipInvite() call
      prisma.invite.findUnique.mockResolvedValueOnce(invite)
      prisma.user.findUnique.mockResolvedValueOnce(user)

      await service.redeem('CODE1234', 'user-1', {})

      expect(tx.teamAccess.upsert).toHaveBeenCalledTimes(1)
      expect(tx.teamAccess.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            teamId_userId_role: expect.objectContaining({
              teamId: 'team-1',
              userId: 'user-1',
              role,
            }),
          }),
          update: expect.objectContaining({
            phase: TeamAccessPhase.FULL,
            status: TeamAccessStatus.ACTIVE,
          }),
          create: expect.objectContaining({
            clubId: 'club-1',
            teamId: 'team-1',
            userId: 'user-1',
            role,
            phase: TeamAccessPhase.FULL,
            status: TeamAccessStatus.ACTIVE,
          }),
        }),
      )

      expect(tx.membership.upsert).toHaveBeenCalledTimes(1)
      expect(tx.membership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId_clubId: expect.objectContaining({
              userId: 'user-1',
              clubId: 'club-1',
            }),
          }),
          create: expect.objectContaining({
            userId: 'user-1',
            clubId: 'club-1',
            role: expectedMembershipRole,
          }),
        }),
      )

      // Role-specific side effects
      if (role === TeamRole.PLAYER) {
        expect(tx.teamMember.upsert).toHaveBeenCalledTimes(1)
        expect(tx.guardianRelationship.create).not.toHaveBeenCalled()
      } else if (role === TeamRole.PARENT) {
        expect(tx.guardianRelationship.create).toHaveBeenCalledTimes(1)
        expect(tx.teamMember.upsert).not.toHaveBeenCalled()
      } else {
        expect(tx.teamMember.upsert).not.toHaveBeenCalled()
        expect(tx.guardianRelationship.create).not.toHaveBeenCalled()
      }

      // Invite is flipped to ACCEPTED at the end of the transaction
      expect(tx.invite.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'invite-1' },
          data: expect.objectContaining({
            status: InviteStatus.ACCEPTED,
            acceptedByUserId: 'user-1',
          }),
        }),
      )
    },
  )

  it('binds redeemed parent access to the linked player loan end date', async () => {
    const { prisma, service, tx } = createService()
    const loanEndDate = new Date('2027-01-01T00:00:00.000Z')
    const invite = buildInvite({
      role: TeamRole.PARENT,
      linkedPlayerUserId: 'player-user-1',
    })
    prisma.invite.findUnique.mockResolvedValueOnce(invite).mockResolvedValueOnce(invite)
    prisma.user.findUnique.mockResolvedValue(buildUser())
    tx.teamAccess.findFirst.mockResolvedValue({ loanEndDate })

    await service.redeem('CODE1234', 'user-1', {})

    expect(tx.teamAccess.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ loanEndDate }),
        create: expect.objectContaining({ loanEndDate }),
      }),
    )
  })

  it('keeps parent access permanent when another linked child has permanent access', async () => {
    const { prisma, service, tx } = createService()
    const invite = buildInvite({
      role: TeamRole.PARENT,
      linkedPlayerUserId: 'permanent-player',
    })
    prisma.invite.findUnique.mockResolvedValueOnce(invite).mockResolvedValueOnce(invite)
    prisma.user.findUnique.mockResolvedValue(buildUser())
    tx.teamAccess.findFirst.mockResolvedValue({ loanEndDate: null })
    tx.teamAccess.findUnique.mockResolvedValue({
      status: TeamAccessStatus.ACTIVE,
      loanEndDate: new Date('2027-01-01T00:00:00.000Z'),
    })

    await service.redeem('CODE1234', 'user-1', {})

    expect(tx.teamAccess.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ loanEndDate: null }),
      }),
    )
  })

  it('throws InviteRecipientMismatchError when user email does not match invite.recipientEmail', async () => {
    const { prisma, service, tx } = createService()

    const invite = buildInvite({ recipientEmail: 'someone@else.com' })
    const user = buildUser({ email: 'me@test.com' })

    prisma.invite.findUnique.mockResolvedValueOnce(invite)
    prisma.user.findUnique.mockResolvedValueOnce(user)

    await expect(service.redeem('CODE1234', 'user-1', {})).rejects.toBeInstanceOf(
      InviteRecipientMismatchError,
    )

    // Guard must short-circuit before any tx work happens.
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(tx.membership.upsert).not.toHaveBeenCalled()
    expect(tx.teamAccess.upsert).not.toHaveBeenCalled()
    expect(tx.invite.update).not.toHaveBeenCalled()
  })
})

describe('InvitesService campaign identity binding', () => {
  it('does not let another authenticated email redeem an identity-bound campaign', async () => {
    const prisma = {
      inviteCampaign: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'campaign-1',
          clubId: 'club-1',
          teamId: 'team-1',
          type: 'IDENTITY_BOUND',
          recipientEmail: 'invited@example.com',
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 60_000),
          useCount: 0,
          maxUses: 1,
          club: {},
          team: {},
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          email: 'attacker@example.com',
          dateOfBirth: new Date('1990-01-01'),
        }),
      },
      $transaction: jest.fn(),
    }
    const service = new InvitesService(prisma as never, {} as never, {} as never)

    await expect(service.redeemCampaign('secret-code', 'attacker-1')).rejects.toBeInstanceOf(
      InviteRecipientMismatchError,
    )
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('does not turn an approval-required campaign into a minor join request without consent', async () => {
    const campaign = {
      id: 'campaign-minor',
      clubId: 'club-1',
      teamId: 'team-1',
      type: 'APPROVAL_REQUIRED',
      role: TeamRole.PLAYER,
      recipientEmail: null,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 60_000),
      useCount: 0,
      maxUses: 10,
      club: {},
      team: {},
    }
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'minor-1' }]) },
      inviteCampaign: { findUnique: jest.fn().mockResolvedValue(campaign) },
      inviteRedemption: { findUnique: jest.fn().mockResolvedValue(null) },
      parentalConsent: { findFirst: jest.fn().mockResolvedValue(null) },
      joinRequest: { findUnique: jest.fn(), upsert: jest.fn() },
    }
    const prisma = {
      inviteCampaign: { findUnique: jest.fn().mockResolvedValue(campaign) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          email: 'minor@example.com',
          dateOfBirth: new Date(),
        }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    }
    const service = new InvitesService(prisma as never, {} as never, {} as never)

    await expect(service.redeemCampaign('MINOR123', 'minor-1')).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(tx.parentalConsent.findFirst).toHaveBeenCalledWith({
      where: {
        playerUserId: 'minor-1',
        clubId: 'club-1',
        teamId: 'team-1',
        status: 'APPROVED',
      },
      select: { id: true },
    })
    expect(tx.joinRequest.upsert).not.toHaveBeenCalled()
    expect(tx.inviteRedemption.findUnique).toHaveBeenCalled()
  })
})
