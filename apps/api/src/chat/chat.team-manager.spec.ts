import { ForbiddenException } from '@nestjs/common'
import { ChatService } from './chat.service'

describe('ChatService team-staff authority', () => {
  function trialCoachService() {
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn().mockResolvedValue([]),
      channel: {
        findUnique: jest.fn().mockResolvedValue({ teamId: 'team-1', clubId: 'club-1' }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ deletedAt: null }) },
      event: { findFirst: jest.fn() },
      message: { create: jest.fn() },
    }
    ;(prisma as typeof prisma & { $transaction: jest.Mock }).$transaction = jest.fn(
      (operation: (tx: typeof prisma) => unknown) => operation(prisma),
    )
    const teams = {
      assertReadableAccess: jest.fn().mockResolvedValue({
        team: { id: 'team-1', clubId: 'club-1' },
        membership: { role: 'COACH' },
        activeTeamAccess: [{ role: 'HEAD_COACH', phase: 'TRIAL' }],
      }),
    }
    const channels = { assertWritable: jest.fn().mockResolvedValue(undefined) }
    const billing = {
      getEntitlements: jest.fn().mockResolvedValue({ features: ['lineup_builder_pro'] }),
    }
    const service = new ChatService(
      prisma as never,
      teams as never,
      {} as never,
      {} as never,
      channels as never,
      billing as never,
    )
    return { service, prisma, billing, teams, channels }
  }

  it('recognizes only FULL team coach assignments (besides club owner/admin)', () => {
    const { service } = trialCoachService()
    const isTeamManager = (
      service as unknown as {
        isTeamManager: (access: {
          membership?: { role?: string | null } | null
          activeTeamAccess: Array<{ role?: string | null; phase?: string | null }>
        }) => boolean
      }
    ).isTeamManager.bind(service)

    expect(
      isTeamManager({
        membership: { role: 'COACH' },
        activeTeamAccess: [{ role: 'HEAD_COACH', phase: 'FULL' }],
      }),
    ).toBe(true)
    expect(
      isTeamManager({
        membership: { role: 'COACH' },
        activeTeamAccess: [{ role: 'HEAD_COACH', phase: 'TRIAL' }],
      }),
    ).toBe(false)
    expect(isTeamManager({ membership: { role: 'ADMIN' }, activeTeamAccess: [] })).toBe(true)
  })

  it('does not let a TRIAL coach post a saved lineup to a channel', async () => {
    const { service, prisma, billing } = trialCoachService()

    await expect(
      service.postLineup('trial-coach', {
        teamId: 'team-1',
        channelId: 'channel-1',
        formation: '4-3-3',
        xi: 'Starting XI',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)

    expect(billing.getEntitlements).not.toHaveBeenCalled()
    expect(prisma.message.create).not.toHaveBeenCalled()
  })

  it('does not let a TRIAL coach share an event RSVP card to a channel', async () => {
    const { service, prisma } = trialCoachService()

    await expect(
      service.postRsvpPoll('trial-coach', {
        teamId: 'team-1',
        channelId: 'channel-1',
        eventId: 'event-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)

    expect(prisma.event.findFirst).not.toHaveBeenCalled()
    expect(prisma.message.create).not.toHaveBeenCalled()
  })

  it.each(['lineup', 'rsvp'] as const)(
    'rechecks %s authority after the coach-assignment lock',
    async (kind) => {
      const { service, prisma, teams } = trialCoachService()
      const full = {
        team: { id: 'team-1', clubId: 'club-1' },
        membership: { role: 'COACH' },
        activeTeamAccess: [{ role: 'HEAD_COACH', phase: 'FULL' }],
      }
      const trial = {
        ...full,
        activeTeamAccess: [{ role: 'HEAD_COACH', phase: 'TRIAL' }],
      }
      teams.assertReadableAccess.mockResolvedValueOnce(full).mockResolvedValueOnce(trial)

      const operation =
        kind === 'lineup'
          ? service.postLineup('coach', {
              teamId: 'team-1',
              channelId: 'channel-1',
              formation: '4-3-3',
              xi: 'Starting XI',
            })
          : service.postRsvpPoll('coach', {
              teamId: 'team-1',
              channelId: 'channel-1',
              eventId: 'event-1',
            })

      await expect(operation).rejects.toBeInstanceOf(ForbiddenException)
      expect(prisma.message.create).not.toHaveBeenCalled()
      expect(prisma.event.findFirst).not.toHaveBeenCalled()
    },
  )
})
