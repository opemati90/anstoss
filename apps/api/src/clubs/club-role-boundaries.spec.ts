import { MembershipRole } from '@anstoss/shared'
import { ClubActivationService } from '../club-activation/club-activation.service'
import { TeamsService } from '../teams/teams.service'
import { UsersService } from '../users/users.service'

function fixture(options: { currentRole?: string; adminCount?: number; nextRole?: string } = {}) {
  const currentRole = options.currentRole ?? 'PLAYER'
  const claim = {
    id: 'claim', kind: 'STAFF_CLAIM', clubId: 'club', claimantUserId: 'target',
    desiredRole: options.nextRole ?? 'ADMIN', requestedTeamIds: [], requestedTeamRoles: [],
    status: 'SUBMITTED', createdAt: new Date(Date.now() - 8 * 86400_000),
    expiresAt: new Date(Date.now() + 60_000),
  }
  const transfer = {
    id: 'transfer', clubId: 'club', fromUserId: 'owner', toUserId: 'target',
    status: 'PENDING', expiresAt: new Date(Date.now() + 60_000),
  }
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([]),
    membership: {
      findUnique: jest.fn(async ({ where }: any) => ({
        id: `membership-${where.userId_clubId.userId}`, userId: where.userId_clubId.userId,
        role: where.userId_clubId.userId === 'owner' ? 'OWNER' : currentRole,
        operationalRoles: [],
      })),
      findFirst: jest.fn().mockResolvedValue({ id: 'old-owner', userId: 'owner', role: 'OWNER' }),
      findMany: jest.fn().mockResolvedValue([{ userId: 'owner', role: 'OWNER' }]),
      count: jest.fn().mockResolvedValue(options.adminCount ?? 3),
      update: jest.fn().mockResolvedValue({ role: 'ADMIN', operationalRoles: [] }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    teamAccess: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn(), updateMany: jest.fn() },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'target' }) },
    team: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue({ id: 'team' }) },
    clubClaim: { findUnique: jest.fn().mockResolvedValue(claim), update: jest.fn().mockResolvedValue(claim) },
    clubDispute: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({ id: 'dispute', clubId: 'club', status: 'OPEN' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'dispute', status: 'RESOLVED' }),
    },
    ownershipTransfer: {
      findFirst: jest.fn().mockResolvedValue(transfer), findUnique: jest.fn().mockResolvedValue(transfer),
      update: jest.fn().mockResolvedValue(transfer), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn() },
  }
  let committed = false
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (fn: (db: typeof tx) => unknown) => {
      const result = await fn(tx)
      committed = true
      return result
    }),
  }
  const events = { emit: jest.fn(() => { expect(committed).toBe(true) }) }
  const activation = new ClubActivationService(prisma as never, {} as never, {} as never, {} as never, events as never)
  jest.spyOn(activation as any, 'consumeOwnershipChallenge').mockResolvedValue(undefined)
  const users = new UsersService(prisma as never, {} as never, {} as never, {} as never, {} as never, undefined, events as never)
  const teams = new TeamsService(prisma as never, events as never)
  return { tx, prisma, events, activation, users, teams }
}

type Fixture = ReturnType<typeof fixture>
const promotionPaths: Array<[string, (f: Fixture) => Promise<unknown>]> = [
  ['member role', (f) => f.users.updateClubMemberRole('club', 'owner', 'target', MembershipRole.ADMIN)],
  ['staff approval', (f) => f.activation.reviewStaffRequest('owner', 'club', 'claim', { decision: 'APPROVE' })],
  ['escalated staff approval', (f) => (f.activation as any).approveEscalatedStaffClaim('platform', 'club', 'claim')],
  ['ownership acceptance', (f) => f.activation.acceptOwnershipTransfer(
    { id: 'target', authenticatedAt: Math.floor(Date.now() / 1000) }, 'transfer', { challengeId: 'challenge', code: '123456' },
  )],
  ['ownership dispute', (f) => f.activation.resolvePlatformDispute('platform', 'dispute', {
    newOwnerUserId: 'target', resolution: 'Verified the replacement owner with the club.',
  })],
]

describe('club administrator capacity boundaries', () => {
  it.each(promotionPaths)('rejects a fourth administrator through %s before any role write', async (_name, perform) => {
    const f = fixture()
    await expect(perform(f)).rejects.toMatchObject({ response: { code: 'CLUB_ADMIN_LIMIT_REACHED' } })
    expect(f.tx.membership.count).toHaveBeenCalledWith({ where: { clubId: 'club', role: { in: ['OWNER', 'ADMIN'] } } })
    expect(f.tx.$executeRaw.mock.calls.some((call: any[]) => call[1] === 'owner:club')).toBe(true)
    expect(f.tx.membership.update).not.toHaveBeenCalled()
    expect(f.tx.membership.upsert).not.toHaveBeenCalled()
    expect(f.tx.membership.updateMany).not.toHaveBeenCalled()
    expect(f.events.emit).not.toHaveBeenCalled()
  })

  it.each(promotionPaths)('allows the third administrator through %s and broadcasts after commit', async (_name, perform) => {
    const f = fixture({ adminCount: 2 })
    await perform(f)
    expect(f.events.emit).toHaveBeenCalledWith('realtime.access.changed', { userId: 'target' })
  })

  it.each(promotionPaths)('allows existing admin authority through %s even at capacity', async (_name, perform) => {
    const f = fixture({ currentRole: 'ADMIN' })
    await perform(f)
    expect(f.tx.membership.count).not.toHaveBeenCalled()
  })

  it('preserves owner-only admin promotion', async () => {
    const f = fixture({ adminCount: 0 })
    f.tx.membership.findUnique.mockResolvedValue({ id: 'admin', userId: 'admin', role: 'ADMIN', operationalRoles: [] })
    await expect(f.users.updateClubMemberRole('club', 'admin', 'target', MembershipRole.ADMIN))
      .rejects.toThrow('Only club owners can assign admin role')
    expect(f.tx.membership.update).not.toHaveBeenCalled()
  })

  it('does not rewrite independent team roles during club promotion or demotion', async () => {
    const f = fixture({ adminCount: 2 })
    f.tx.teamAccess.findMany.mockResolvedValue([{ id: 'coach-access' }] as never)
    await f.users.updateClubMemberRole('club', 'owner', 'target', MembershipRole.ADMIN)
    expect(f.tx.teamAccess.upsert).not.toHaveBeenCalled()
    expect(f.tx.teamAccess.updateMany).not.toHaveBeenCalled()
    expect(f.tx.membership.update).toHaveBeenCalledWith(expect.objectContaining({ data: { role: 'ADMIN' } }))
  })

  it('broadcasts operational role revocation only after commit', async () => {
    const f = fixture()
    await f.users.updateOperationalRoles('club', 'owner', 'target', [])
    expect(f.events.emit).toHaveBeenCalledWith('realtime.access.changed', { userId: 'target' })
  })
})

describe('coach reassignment authorization and access invalidation', () => {
  it('refreshes both removed and assigned coaches after commit', async () => {
    const f = fixture()
    f.tx.membership.findMany.mockResolvedValue([{ userId: 'new-coach', role: 'COACH' }])
    f.tx.teamAccess.findMany.mockResolvedValue([{ userId: 'old-coach' }, { userId: 'new-coach' }] as never)
    await f.teams.updateTeamCoachAssignments('club', 'team', 'owner', { headCoachUserId: 'new-coach', assistantCoachUserIds: [] })
    expect(f.events.emit.mock.calls).toEqual([
      ['realtime.access.changed', { userId: 'new-coach' }],
      ['realtime.access.changed', { userId: 'old-coach' }],
    ])
  })

  it('rechecks an actor demoted after the initial request authorization', async () => {
    const f = fixture()
    f.tx.membership.findUnique
      .mockResolvedValueOnce({ id: 'actor', userId: 'actor', role: 'ADMIN', operationalRoles: [] })
      .mockResolvedValueOnce({ id: 'actor', userId: 'actor', role: 'PLAYER', operationalRoles: [] })
    await expect(f.teams.updateTeamCoachAssignments('club', 'team', 'actor', { headCoachUserId: null, assistantCoachUserIds: [] }))
      .rejects.toThrow('Only the club owner or an administrator')
    expect(f.tx.teamAccess.updateMany).not.toHaveBeenCalled()
    expect(f.events.emit).not.toHaveBeenCalled()
  })

  it('reads target roles after the shared role-mutation lock', async () => {
    const f = fixture()
    f.tx.membership.findMany.mockResolvedValueOnce([{ userId: 'target', role: 'COACH' }])
      .mockResolvedValueOnce([{ userId: 'target', role: 'PLAYER' }])
    await expect(f.teams.updateTeamCoachAssignments('club', 'team', 'owner', { headCoachUserId: 'target', assistantCoachUserIds: [] }))
      .rejects.toThrow('Assigned coaches must be active members of the club staff')
    const ownerLockIndex = f.tx.$executeRaw.mock.calls.findIndex((call: any[]) => call[1] === 'owner:club')
    expect(ownerLockIndex).toBeGreaterThanOrEqual(0)
    expect(f.tx.$executeRaw.mock.invocationCallOrder[ownerLockIndex])
      .toBeLessThan(f.tx.membership.findMany.mock.invocationCallOrder[1])
    expect(f.tx.teamAccess.upsert).not.toHaveBeenCalled()
  })
})
