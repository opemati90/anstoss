import { ForbiddenException } from '@nestjs/common'
import { ChannelsService } from './channels.service'

type State = ReturnType<typeof initialState>

function initialState() {
  return {
    user: {
      deletedAt: null as Date | null,
      dateOfBirth: new Date('1990-01-01') as Date | null,
    },
    team: { id: 'team' } as { id: string } | null,
    channel: {
      id: 'channel', clubId: 'club', teamId: 'team' as string | null,
      kind: 'TEAM', visibility: 'MEMBERS', slug: 'team', name: 'Team',
      description: null, createdAt: new Date(), updatedAt: new Date(),
    },
    membership: { role: 'PLAYER' } as { role: string } | null,
    teamAccess: [
      { teamId: 'team', role: 'PLAYER', phase: 'FULL', status: 'ACTIVE' },
    ],
    channelMember: null as { id: string } | null,
  }
}

function build(mutateAfterInitialRead?: (state: State) => void) {
  const state = initialState()
  let lifecycleLocked = false
  const tx = {
    $executeRaw: jest.fn(async (..._args: unknown[]) => {
      if (!lifecycleLocked) {
        lifecycleLocked = true
        mutateAfterInitialRead?.(state)
      }
      return 1
    }),
    $queryRaw: jest.fn(async (..._args: unknown[]) => []),
    user: {
      findUnique: jest.fn(async () => state.user),
      findFirst: jest.fn(async () => state.user.deletedAt ? null : state.user),
    },
    team: { findFirst: jest.fn(async () => state.team) },
    channel: { findUnique: jest.fn(async () => state.channel) },
    membership: { findUnique: jest.fn(async () => state.membership) },
    teamAccess: { findMany: jest.fn(async () => state.teamAccess.filter((row) => row.status === 'ACTIVE')) },
    channelMember: { findUnique: jest.fn(async () => state.channelMember) },
    trialInvite: { findMany: jest.fn().mockResolvedValue([]) },
    event: { findMany: jest.fn().mockResolvedValue([]) },
  }
  const service = new ChannelsService({} as never, {} as never, { emit: jest.fn() } as never)
  return { service, state, tx }
}

describe('transaction-bound channel private-upload authorization', () => {
  it('locks lifecycle and exact scope rows before returning a write target', async () => {
    const { service, tx } = build()

    await expect(
      service.authorizePrivateUpload('user', 'club', 'team', 'channel', 'write', tx as never),
    ).resolves.toEqual({
      userId: 'user', clubId: 'club', teamId: 'team',
      targetType: 'CHANNEL', targetId: 'channel',
    })

    expect(tx.$executeRaw.mock.calls.map((call) => call[1])).toEqual(['user', 'owner:club'])
    expect(tx.$queryRaw.mock.calls.map((call) => String((call[0] as TemplateStringsArray)[0]))).toEqual([
      expect.stringContaining('FROM "Channel"'),
      expect.stringContaining('FROM "Team"'),
      expect.stringContaining('FROM "TeamAccess"'),
      expect.stringContaining('FROM "Membership"'),
    ])
    expect(tx.$queryRaw.mock.invocationCallOrder.at(-1))
      .toBeLessThan(tx.membership.findUnique.mock.invocationCallOrder.at(-1)!)
  })

  it('rejects a route-bound club/team mismatch before taking lifecycle locks', async () => {
    const { service, tx } = build()
    await expect(
      service.authorizePrivateUpload('user', 'other-club', 'team', 'channel', 'write', tx as never),
    ).rejects.toThrow(ForbiddenException)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })

  it.each([
    ['account deletion', (state: State) => { state.user.deletedAt = new Date() }],
    ['club removal', (state: State) => { state.membership = null }],
    ['team deletion', (state: State) => { state.team = null }],
    ['channel move', (state: State) => { state.channel.clubId = 'other-club' }],
    ['team-access revocation', (state: State) => { state.teamAccess[0]!.status = 'REVOKED' }],
  ])('rejects %s that wins while authorization waits for locks', async (_label, revoke) => {
    const { service, tx } = build(revoke)
    await expect(
      service.authorizePrivateUpload('user', 'club', 'team', 'channel', 'write', tx as never),
    ).rejects.toThrow(ForbiddenException)
  })

  it.each([
    ['unknown age', null],
    ['underage', new Date('2012-01-01')],
  ])('rejects a FULL player with %s for both reads and writes', async (_label, dateOfBirth) => {
    for (const mode of ['read', 'write'] as const) {
      const { service, state, tx } = build()
      state.user.dateOfBirth = dateOfBirth
      await expect(
        service.authorizePrivateUpload('user', 'club', 'team', 'channel', mode, tx as never),
      ).rejects.toThrow(ForbiddenException)
      expect(tx.$queryRaw).not.toHaveBeenCalled()
    }
  })

  it('requires the concrete CUSTOM membership after the row lock', async () => {
    const { service, state, tx } = build()
    state.channel.kind = 'CUSTOM'
    await expect(
      service.authorizePrivateUpload('user', 'club', 'team', 'channel', 'read', tx as never),
    ).rejects.toThrow(ForbiddenException)
    state.channelMember = { id: 'member' }
    await expect(
      service.authorizePrivateUpload('user', 'club', 'team', 'channel', 'read', tx as never),
    ).resolves.toMatchObject({ targetId: 'channel' })
  })

  it('rejects a CUSTOM member removed while authorization waits for its row lock', async () => {
    const { service, state, tx } = build((current) => { current.channelMember = null })
    state.channel.kind = 'CUSTOM'
    state.channelMember = { id: 'member' }
    await expect(
      service.authorizePrivateUpload('user', 'club', 'team', 'channel', 'write', tx as never),
    ).rejects.toThrow(ForbiddenException)
    expect(tx.$queryRaw.mock.calls.some((call) =>
      String((call[0] as TemplateStringsArray)[0]).includes('FROM "ChannelMember"'),
    )).toBe(true)
  })

  it('distinguishes readable announcements from writable announcements', async () => {
    const { service, state, tx } = build()
    state.channel.kind = 'ANNOUNCEMENTS'
    await expect(
      service.authorizePrivateUpload('user', 'club', 'team', 'channel', 'read', tx as never),
    ).resolves.toMatchObject({ targetId: 'channel' })
    await expect(
      service.authorizePrivateUpload('user', 'club', 'team', 'channel', 'write', tx as never),
    ).rejects.toThrow('You cannot post to this channel')
  })

  it('does not grant staff visibility to a TRIAL coach', async () => {
    const { service, state, tx } = build()
    state.membership = { role: 'COACH' }
    state.teamAccess = [
      { teamId: 'team', role: 'HEAD_COACH', phase: 'TRIAL', status: 'ACTIVE' },
    ]
    state.channel.kind = 'COACHES'
    state.channel.visibility = 'COACHES_ONLY'
    await expect(
      service.authorizePrivateUpload('user', 'club', 'team', 'channel', 'read', tx as never),
    ).rejects.toThrow(ForbiddenException)
  })

  it('does not turn a marketplace TRIAL into channel media access for an existing member', async () => {
    const { service, state, tx } = build()
    state.teamAccess = [
      { teamId: 'team', role: 'PLAYER', phase: 'TRIAL', status: 'ACTIVE' },
    ]
    tx.trialInvite.findMany.mockResolvedValue([{ sessionEventIds: ['event'] }])
    tx.event.findMany.mockResolvedValue([
      { id: 'event', date: new Date(Date.now() + 60_000), cancelledAt: null },
    ])
    await expect(
      service.authorizePrivateUpload('user', 'club', 'team', 'channel', 'read', tx as never),
    ).rejects.toThrow(ForbiddenException)
  })

  it('allows a club-level read but not a new team-bound upload without team access', async () => {
    const { service, state, tx } = build()
    state.channel.teamId = null
    state.teamAccess = []
    await expect(
      service.authorizePrivateUpload('user', 'club', 'team', 'channel', 'read', tx as never),
    ).resolves.toMatchObject({ teamId: 'team' })
    await expect(
      service.authorizePrivateUpload('user', 'club', 'team', 'channel', 'write', tx as never),
    ).rejects.toThrow(ForbiddenException)
  })

  it('takes team access before membership for club-level channels as well', async () => {
    const { service, state, tx } = build()
    state.channel.teamId = null
    await service.authorizePrivateUpload('user', 'club', 'team', 'channel', 'read', tx as never)
    const locks = tx.$queryRaw.mock.calls.map((call) => String((call[0] as TemplateStringsArray)[0]))
    const teamAccess = locks.findIndex((sql) => sql.includes('FROM "TeamAccess"'))
    const membership = locks.findIndex((sql) => sql.includes('FROM "Membership"'))
    expect(teamAccess).toBeGreaterThanOrEqual(0)
    expect(membership).toBeGreaterThan(teamAccess)
  })
})
