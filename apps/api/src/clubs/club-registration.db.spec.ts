import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { submitFirstClubClaimSchema } from '@anstoss/shared'
import { ClubActivationService } from '../club-activation/club-activation.service'
import { ClubsService, createClubWithUniqueSlug } from './clubs.service'
import { assertTeamNameAvailable } from './club-registration-name'

const databaseUrl = process.env.ANSTOSS_MVP_TEST_DATABASE_URL
if (databaseUrl) {
  const target = new URL(databaseUrl)
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !target.pathname.endsWith('_test')) {
    throw new Error('Registration tests require an isolated localhost *_test database')
  }
}

const databaseTests = databaseUrl ? describe : describe.skip
databaseTests('club registration identity in PostgreSQL (no external data source)', () => {
  const runId = randomUUID()
  const userIds: string[] = []
  let db: PrismaClient
  let activation: ClubActivationService

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } })
    await db.$connect()
    for (const suffix of ['one', 'two']) {
      const user = await db.user.create({ data: {
        name: `Registration QA ${suffix}`, email: `${runId}-${suffix}@example.invalid`,
        registrationRole: 'CLUB_ADMIN',
      } })
      userIds.push(user.id)
    }
    activation = new ClubActivationService(db as never, {} as never, {
      ensureClubChannels: jest.fn(), ensureTeamChannels: jest.fn(),
    } as never, {} as never)
  })

  afterAll(async () => {
    if (!db) return
    // Delete only this test run's synthetic rows; never existing QA fixtures.
    await db.clubClaim.deleteMany({ where: { claimantUserId: { in: userIds } } })
    await db.club.deleteMany({ where: { name: { contains: runId, mode: 'insensitive' } } })
    await db.clubDirectoryEntry.deleteMany({ where: { name: { contains: runId, mode: 'insensitive' } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.$disconnect()
  })

  it('serializes two simultaneous registrations of the same name despite case and spaces', async () => {
    const name = `Codex FC II ${runId}`
    const results = await Promise.allSettled([name, `  CODEX   FC II ${runId}  `].map(value =>
      db.$transaction(tx => createClubWithUniqueSlug(tx, { name: value, primaryColor: '#123456' })),
    ))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toMatchObject({ response: { code: 'CLUB_ALREADY_REGISTERED' } })
    expect(await db.club.count({ where: { name: { contains: runId } } })).toBe(1)
  })

  it('finds legacy clubs without a directory entry or search index and blocks a duplicate claim', async () => {
    await db.club.create({ data: { name: `Legacy FC ${runId}`, slug: `legacy-${runId}` } })
    await expect(activation.submitFirstClaim(userIds[0], null,
      submitFirstClubClaimSchema.parse({ clubName: ` legacy   FC ${runId} `, teamName: 'II' }),
    )).rejects.toMatchObject({ response: { code: 'CLUB_ALREADY_REGISTERED' } })
    expect(await db.membership.count({ where: { userId: { in: userIds } } })).toBe(0)
  })

  it('activates one new club immediately, without a roster or DFB code, and blocks a competing claimant', async () => {
    const name = `New Local FC ${runId}`
    const results = await Promise.allSettled(userIds.map((userId, index) =>
      activation.submitFirstClaim(userId, 'personal@gmail.com', submitFirstClubClaimSchema.parse({
        clubName: index ? ` new  local fc ${runId} ` : name, teamName: 'II',
      })),
    ))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason.getStatus()).toBe(409)
    const claim = (results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof activation.submitFirstClaim>>>).value
    expect(claim.externalTeamUrl).toBeNull()
    expect(claim.status).toBe('APPROVED')
    expect(claim.reviewerId).toBeNull()
    expect(await db.clubDirectoryEntry.count({ where: { name: { contains: runId } } })).toBe(1)
    expect(await db.membership.count({ where: { userId: claim.claimantUserId, clubId: claim.clubId!, role: 'OWNER' } })).toBe(1)
    expect(await db.team.count({ where: { clubId: claim.clubId! } })).toBe(1)
    expect(await db.teamMember.count({ where: { team: { clubId: claim.clubId! } } })).toBe(0)
    expect(await db.entitlementGrant.count({ where: { clubId: claim.clubId!, source: 'TRIAL' } })).toBe(1)
    expect(await db.auditLog.count({ where: { clubId: claim.clubId!, type: 'club.self_registered' } })).toBe(1)
  })

  it('permits different club names and does not reserve generic team labels globally', async () => {
    const service = new ClubsService(db as never)
    for (const index of [0, 1]) {
      const user = await db.user.create({ data: { name: `Distinct QA ${index}`, email: `${runId}-distinct-${index}@example.invalid`, registrationRole: 'CLUB_ADMIN' } })
      const userId = user.id
      userIds.push(userId)
      const result = await service.createClubWithTeam(userId,
        { name: `Distinct ${index} FC ${runId}`, primaryColor: '#123456' }, { name: 'First team' })
      expect(result.team.name).toBe('First team')
    }
  })

  it('blocks renaming a club to an existing normalized name', async () => {
    const club = await db.club.findFirstOrThrow({ where: { slug: `legacy-${runId}` } })
    const service = new ClubsService(db as never)
    await expect(service.updateClub(club.id, { name: `codex  fc II ${runId}` }))
      .rejects.toMatchObject({ response: { code: 'CLUB_ALREADY_REGISTERED' } })
    expect((await db.club.findUniqueOrThrow({ where: { id: club.id } })).name).toBe(`Legacy FC ${runId}`)
  })

  it('prevents duplicate team display names within a club, including concurrent creates', async () => {
    const club = await db.club.findFirstOrThrow({ where: { slug: `legacy-${runId}` } })
    const group = await db.teamGroup.create({ data: { clubId: club.id, type: 'SENIOR', displayName: 'Herren' } })
    const results = await Promise.allSettled(['Codex FC II', ' codex  fc ii '].map(displayName =>
      db.$transaction(async tx => {
        await assertTeamNameAvailable(tx, club.id, displayName)
        return tx.team.create({ data: { clubId: club.id, groupId: group.id, name: 'II', displayName } })
      }),
    ))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason)
      .toMatchObject({ response: { code: 'TEAM_ALREADY_REGISTERED' } })
    expect(await db.team.count({ where: { clubId: club.id } })).toBe(1)
  })
})
