import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { MembershipRole } from '@anstoss/shared'
import { UsersService } from '../users/users.service'
import { TeamsService } from '../teams/teams.service'
import { createTenantMiddleware } from '../prisma/tenant.middleware'
import { tenantContext } from '../prisma/tenant.context'

const url = process.env.BILLING_TEST_DATABASE_URL
if (url) {
  const parsed = new URL(url)
  if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/anstoss_billing_test' || parsed.search) {
    throw new Error('Role tests require the dedicated localhost anstoss_billing_test database')
  }
}

;(url ? describe : describe.skip)('club role boundaries (real PostgreSQL)', () => {
  let db: PrismaClient
  let users: UsersService
  let teams: TeamsService
  let clubId: string
  let owner: string
  let admin: string
  let first: string
  let second: string
  let userIds: string[]
  const events = { emit: jest.fn() }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url } } })
    db.$use(createTenantMiddleware(() => tenantContext.getStore()?.clubId) as Prisma.Middleware)
    await db.$connect()
    users = new UsersService(db as never, {} as never, {} as never, {} as never, {} as never, undefined, events as never)
    teams = new TeamsService(db as never, events as never)
  })
  beforeEach(async () => {
    const prefix = `role-test-${randomUUID()}`
    clubId = `${prefix}-club`
    ;[owner, admin, first, second] = ['owner', 'admin', 'first', 'second'].map(name => `${prefix}-${name}`)
    userIds = [owner, admin, first, second]
    events.emit.mockClear()
    await db.user.createMany({ data: userIds.map(id => ({ id, name: 'Local role regression' })) })
    await db.club.create({ data: { id: clubId, name: 'Local role regression', slug: clubId } })
    await db.membership.createMany({ data: userIds.map((userId, i) => ({
      clubId, userId, role: i === 0 ? 'OWNER' : i === 1 ? 'ADMIN' : 'PLAYER',
    })) })
  })
  afterEach(async () => {
    if (!clubId || !userIds?.length) return
    await db.club.deleteMany({ where: { id: clubId } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
  })
  afterAll(async () => { await db?.$disconnect() })

  it('serializes simultaneous promotions so only one can take the last admin place', async () => {
    const results = await tenantContext.run({ clubId, userId: owner }, () => Promise.allSettled([
      users.updateClubMemberRole(clubId, owner, first, MembershipRole.ADMIN),
      users.updateClubMemberRole(clubId, owner, second, MembershipRole.ADMIN),
    ]))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason.response.code).toBe('CLUB_ADMIN_LIMIT_REACHED')
    expect(await db.membership.count({ where: { clubId, role: { in: ['OWNER', 'ADMIN'] } } })).toBe(3)
    expect(events.emit).toHaveBeenCalledTimes(1)
    const winner = results[0].status === 'fulfilled' ? first : second
    const loser = winner === first ? second : first
    await tenantContext.run({ clubId, userId: owner }, async () => {
      await users.updateClubMemberRole(clubId, owner, winner, MembershipRole.PLAYER)
      await users.updateClubMemberRole(clubId, owner, loser, MembershipRole.ADMIN)
    })
    expect(await db.membership.count({ where: { clubId, role: { in: ['OWNER', 'ADMIN'] } } })).toBe(3)
  })

  it('cannot race a staff demotion into newly activated coach access', async () => {
    await tenantContext.run({ clubId, userId: owner }, async () => {
      await db.membership.update({ where: { userId_clubId: { userId: first, clubId } }, data: { role: 'COACH' } })
      const group = await db.teamGroup.create({ data: { clubId, type: 'SENIOR', displayName: 'Seniors' } })
      const team = await db.team.create({ data: { clubId, groupId: group.id, name: 'First team', displayName: 'First team', joinCode: randomUUID().slice(0, 8) } })
      const results = await Promise.allSettled([
        users.updateClubMemberRole(clubId, owner, first, MembershipRole.PLAYER),
        teams.updateTeamCoachAssignments(clubId, team.id, owner, { headCoachUserId: first, assistantCoachUserIds: [] }),
      ])
      expect(results.some(result => result.status === 'rejected')).toBe(true)
      const membership = await db.membership.findUniqueOrThrow({ where: { userId_clubId: { userId: first, clubId } } })
      const activeCoachCount = await db.teamAccess.count({ where: { clubId, userId: first, role: 'HEAD_COACH', status: 'ACTIVE' } })
      expect(membership.role === 'PLAYER' && activeCoachCount > 0).toBe(false)
    })
  })
})
