/** Public launch capabilities: never opt in to the future-capabilities fixture. */
import { ForbiddenException } from '@nestjs/common'
import { LAUNCH_FEATURES } from '@anstoss/shared'
import { FakePrisma } from '../test-utils/fake-prisma'
import { MotmService } from './motm.service'

function fixture(dateOfBirth: Date | null, deletedAt: Date | null = null) {
  const db = new FakePrisma(
    {
      user: {
        memberships: { kind: 'many', model: 'membership', to: 'userId' },
        teamAccess: { kind: 'many', model: 'teamAccess', to: 'userId' },
      },
      membership: { user: { kind: 'one', model: 'user', from: 'userId' } },
      teamAccess: { user: { kind: 'one', model: 'user', from: 'userId' } },
      importedFixture: {},
      poll: {},
      pollOption: {},
      pollVote: {},
      message: {},
    },
    {
      user: [
        { id: 'voter', name: 'Adult voter', dateOfBirth: new Date('1990-02-01'), deletedAt: null },
        { id: 'candidate', name: 'Historical candidate', dateOfBirth, deletedAt },
      ],
      membership: [
        { id: 'voter-member', userId: 'voter', clubId: 'club', role: 'COACH' },
        { id: 'candidate-member', userId: 'candidate', clubId: 'club', role: 'PLAYER' },
      ],
      teamAccess: [
        {
          id: 'candidate-access',
          userId: 'candidate',
          clubId: 'club',
          teamId: 'team',
          role: 'PLAYER',
          phase: 'FULL',
          status: 'ACTIVE',
          loanEndDate: null,
        },
        { id: 'voter-access', userId: 'voter', clubId: 'club', teamId: 'team', role: 'PLAYER', phase: 'FULL', status: 'ACTIVE', loanEndDate: null },
      ],
      importedFixture: [{ id: 'fixture', clubId: 'club', teamId: 'team', status: 'FINISHED' }],
      poll: [{ id: 'poll', question: 'motm:fixture', closesAt: new Date(Date.now() + 3_600_000) }],
      pollOption: [
        { id: 'poll:old-candidate', pollId: 'poll', label: 'Historical name', index: 0 },
      ],
      pollVote: [
        { id: 'old-vote', pollId: 'poll', optionId: 'poll:old-candidate', userId: 'voter' },
      ],
    },
  )
  const service = new MotmService(
    db as never,
    { assertReadableAccess: jest.fn().mockResolvedValue(undefined) } as never,
    { getEntitlements: jest.fn().mockResolvedValue({ features: ['motm_archive'] }) } as never,
  )
  jest.spyOn(service, 'getTally').mockResolvedValue({ fixtureId: 'fixture' } as never)
  return { db, service }
}

function newPollFixture() {
  const context = fixture(new Date('1990-02-01'))
  const { db } = context
  db.tables.poll = []
  db.rows('user').push({
    id: 'anchor-coach', name: 'Adult coach', dateOfBirth: new Date('1980-01-01'), deletedAt: null,
  })
  db.rows('membership').push({ id: 'coach-member', userId: 'anchor-coach', clubId: 'club', role: 'COACH' })
  db.rows('teamAccess').push({
    id: 'coach-access', userId: 'anchor-coach', clubId: 'club', teamId: 'team',
    role: 'HEAD_COACH', phase: 'FULL', status: 'ACTIVE', loanEndDate: null,
  })
  return context
}

describe('adult launch MOTM candidates', () => {
  it.each([null, new Date(NaN), new Date('2012-01-01')])(
    'does not award or mutate historical votes for an excluded candidate (%p)',
    async (dob) => {
      expect(LAUNCH_FEATURES.youthParticipation).toBe(false)
      const { db, service } = fixture(dob)
      const historicalVotes = [...db.rows('pollVote')]
      const historicalOptions = [...db.rows('pollOption')]
      await expect(service.vote('voter', 'fixture', 'candidate')).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      expect(db.rows('pollVote')).toEqual(historicalVotes)
      expect(db.rows('pollOption')).toEqual(historicalOptions)
      expect(
        db.calls.filter((call) => ['create', 'update', 'upsert', 'deleteMany'].includes(call.op)),
      ).toEqual([])
    },
  )

  it('does not recreate a deleted candidate through a newly copied poll option', async () => {
    const { db, service } = fixture(new Date('1990-02-01'), new Date())
    await expect(service.vote('voter', 'fixture', 'candidate')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(db.rows('pollOption')).toHaveLength(1)
    expect(db.rows('pollVote')[0].optionId).toBe('poll:old-candidate')
  })

  it('does not open a poll or its system anchor for an excluded candidate', async () => {
    const { db, service } = fixture(null)
    db.tables.poll = []
    await expect(service.vote('voter', 'fixture', 'candidate')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(db.rows('poll')).toEqual([])
    expect(db.rows('message')).toEqual([])
  })

  it('rechecks a candidate deleted while waiting for the lifecycle lock', async () => {
    const { db, service } = fixture(new Date('1990-02-01'))
    jest.spyOn(db, '$executeRaw').mockImplementation(async () => {
      db.rows('user')[1].deletedAt = new Date()
      return 0
    })
    await expect(service.vote('voter', 'fixture', 'candidate')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(db.rows('pollVote')[0].optionId).toBe('poll:old-candidate')
    expect(db.rows('pollOption')).toHaveLength(1)
  })

  it('rechecks player eligibility after acquiring the roster row locks', async () => {
    const { db, service } = fixture(new Date('1990-02-01'))
    jest.spyOn(db, '$queryRaw').mockImplementation(async () => {
      db.rows('teamAccess')[0].status = 'REVOKED'
      return []
    })
    await expect(service.vote('voter', 'fixture', 'candidate')).rejects.toThrow('roster')
    expect(db.rows('pollVote')[0].optionId).toBe('poll:old-candidate')
    expect(db.rows('pollOption')).toHaveLength(1)
  })

  it('still permits an independent adult player on a parent membership', async () => {
    const { db, service } = fixture(new Date('1990-02-01'))
    db.rows('membership')[1].role = 'PARENT'
    await service.vote('voter', 'fixture', 'candidate')
    expect(db.rows('pollVote')).toEqual([
      expect.objectContaining({ userId: 'voter', optionId: 'poll:candidate' }),
    ])
  })

  it('does not treat an adult guardian-only roster row as a player', async () => {
    const { db, service } = fixture(new Date('1990-02-01'))
    db.rows('membership')[1].role = 'PARENT'
    db.rows('teamAccess')[0].role = 'PARENT'
    await expect(service.vote('voter', 'fixture', 'candidate')).rejects.toThrow('roster')
    expect(db.rows('pollVote')[0].optionId).toBe('poll:old-candidate')
  })

  it('locks a third-party anchor sender in global account order before the fixture lock', async () => {
    const { db, service } = newPollFixture()
    const locks: string[] = []
    jest.spyOn(db, '$executeRaw').mockImplementation(async (_query?: unknown, ...values: unknown[]) => {
      locks.push(String(values[0]))
      return 0
    })

    await service.vote('voter', 'fixture', 'candidate')

    expect(locks).toEqual(['anchor-coach', 'candidate', 'voter', 'owner:club', 'motm-fixture:fixture'])
    expect(db.rows('message')).toEqual([expect.objectContaining({ senderId: 'anchor-coach' })])
  })

  it('locks sender, voter and candidate team rows before any membership row', async () => {
    const { db, service } = newPollFixture()
    const rows: string[] = []
    jest.spyOn(db, '$queryRaw').mockImplementation(async (query?: unknown, ...values: unknown[]) => {
      const sql = (query as TemplateStringsArray).join('')
      if (sql.includes('"TeamAccess"') || sql.includes('"Membership"')) {
        rows.push(`${sql.includes('"TeamAccess"') ? 'team' : 'membership'}:${String(values[values.length - 1])}`)
      }
      return []
    })
    await service.vote('voter', 'fixture', 'candidate')
    expect(rows).toEqual([
      'team:anchor-coach', 'team:candidate', 'team:voter',
      'membership:anchor-coach', 'membership:candidate', 'membership:voter',
    ])
  })

  it('does not create a poll or vote when the fixture changes before its row lock', async () => {
    const { db, service } = newPollFixture()
    jest.spyOn(db, '$queryRaw').mockImplementation(async (query?: unknown) => {
      if ((query as TemplateStringsArray).join('').includes('"ImportedFixture"')) {
        db.rows('importedFixture')[0].status = 'CANCELLED'
      }
      return []
    })
    await expect(service.vote('voter', 'fixture', 'candidate')).rejects.toThrow('final whistle')
    expect(db.rows('message')).toEqual([])
    expect(db.rows('poll')).toEqual([])
    expect(db.rows('pollVote')[0].optionId).toBe('poll:old-candidate')
  })

  it('does not add an anchor to a sender erased while its lifecycle lock was pending', async () => {
    const { db, service } = newPollFixture()
    jest.spyOn(db, '$executeRaw').mockImplementation(async () => {
      db.rows('user').find((user) => user.id === 'anchor-coach')!.deletedAt = new Date()
      return 0
    })

    await expect(service.vote('voter', 'fixture', 'candidate')).rejects.toBeInstanceOf(ForbiddenException)

    expect(db.rows('message')).toEqual([])
    expect(db.rows('poll')).toEqual([])
    expect(db.rows('pollVote')[0].optionId).toBe('poll:old-candidate')
  })

  it('denies a voter removed while the club lock was pending without changing the poll', async () => {
    const { db, service } = fixture(new Date('1990-02-01'))
    jest.spyOn(db, '$executeRaw').mockImplementation(async (_query?: unknown, ...values: unknown[]) => {
      if (values[0] === 'owner:club') {
        db.tables.membership = db.rows('membership').filter((row) => row.userId !== 'voter')
        db.tables.teamAccess = db.rows('teamAccess').filter((row) => row.userId !== 'voter')
      }
      return 0
    })
    await expect(service.vote('voter', 'fixture', 'candidate')).rejects.toThrow('no longer have access')
    expect(db.rows('pollVote')[0].optionId).toBe('poll:old-candidate')
    expect(db.rows('pollOption')).toHaveLength(1)
  })

  it('denies a voter whose team access was revoked while roster locks were pending', async () => {
    const { db, service } = fixture(new Date('1990-02-01'))
    jest.spyOn(db, '$queryRaw').mockImplementation(async () => {
      db.rows('teamAccess').find((row) => row.userId === 'voter')!.status = 'REVOKED'
      return []
    })
    await expect(service.vote('voter', 'fixture', 'candidate')).rejects.toThrow('no longer have access')
    expect(db.rows('pollVote')[0].optionId).toBe('poll:old-candidate')
  })

  it('revalidates the selected sender without switching to an unlocked fallback owner', async () => {
    const { db, service } = newPollFixture()
    db.rows('user').push({
      id: 'other-owner', name: 'Owner', dateOfBirth: new Date('1980-01-01'), deletedAt: null,
    })
    db.rows('membership').push({ id: 'owner-member', userId: 'other-owner', clubId: 'club', role: 'OWNER' })
    jest.spyOn(db, '$queryRaw').mockImplementation(async () => {
      db.rows('teamAccess').find((access) => access.userId === 'anchor-coach')!.phase = 'TRIAL'
      return []
    })

    await expect(service.vote('voter', 'fixture', 'candidate')).rejects.toThrow('No system sender')

    expect(db.rows('message')).toEqual([])
    expect(db.rows('poll')).toEqual([])
  })

  it('does not choose an unlocked replacement sender if the observed poll is erased', async () => {
    const { db, service } = fixture(new Date('1990-02-01'))
    jest.spyOn(db, '$executeRaw').mockImplementation(async () => {
      db.tables.poll = []
      return 0
    })

    await expect(service.vote('voter', 'fixture', 'candidate')).rejects.toThrow('please try again')

    expect(db.rows('message')).toEqual([])
    expect(db.rows('poll')).toEqual([])
    expect(db.rows('pollVote')[0].optionId).toBe('poll:old-candidate')
  })
})
