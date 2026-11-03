/** Public capabilities only: historical records are filtered, never erased. */
import { LAUNCH_FEATURES } from '@anstoss/shared'
import { MotmService } from '../motm/motm.service'
import { StreaksService } from '../streaks/streaks.service'
import { FakePrisma } from '../test-utils/fake-prisma'

const excludedIds = ['youth', 'unknown', 'guardian', 'deleted']

function fixture() {
  const adultDob = new Date('1990-02-01')
  const users = [
    { id: 'adult-voter', name: 'Adult voter', dateOfBirth: adultDob },
    { id: 'adult-candidate', name: 'Actual candidate', dateOfBirth: adultDob },
    { id: 'dual-role', name: 'Independent adult player', dateOfBirth: adultDob },
    { id: 'youth', name: 'Minor confidential', dateOfBirth: new Date('2012-01-01') },
    { id: 'unknown', name: 'Unknown confidential', dateOfBirth: null },
    { id: 'guardian', name: 'Guardian confidential', dateOfBirth: adultDob },
    { id: 'deleted', name: 'Deleted confidential', dateOfBirth: adultDob },
    ...excludedIds.map((id) => ({
      id: `adult-${id}-voter`,
      name: `Adult voter for ${id}`,
      dateOfBirth: adultDob,
    })),
  ].map((user) => ({
    ...user,
    avatarUrl: null,
    deletedAt: user.id === 'deleted' ? new Date() : null,
  }))
  const eventDate = new Date()
  const db = new FakePrisma(
    {
      user: {
        memberships: { kind: 'many', model: 'membership', to: 'userId' },
        teamAccess: { kind: 'many', model: 'teamAccess', to: 'userId' },
      },
      membership: { user: { kind: 'one', model: 'user', from: 'userId' } },
      teamAccess: { user: { kind: 'one', model: 'user', from: 'userId' } },
      event: { rsvps: { kind: 'many', model: 'rsvp', to: 'eventId' } },
      rsvp: { user: { kind: 'one', model: 'user', from: 'userId' } },
      poll: {
        votes: { kind: 'many', model: 'pollVote', to: 'pollId' },
        message: { kind: 'one', model: 'message', from: 'messageId' },
      },
      message: { team: { kind: 'one', model: 'team', from: 'teamId' } },
      pollVote: { user: { kind: 'one', model: 'user', from: 'userId' } },
      team: {},
      importedFixture: {},
      pollOption: {},
    },
    {
      user: users,
      membership: users.map((user) => ({
        id: `member-${user.id}`,
        userId: user.id,
        clubId: 'club',
        role: ['guardian', 'dual-role'].includes(user.id) ? 'PARENT' : 'PLAYER',
      })),
      teamAccess: users.map((user) => ({
        id: `access-${user.id}`,
        userId: user.id,
        clubId: 'club',
        teamId: 'team',
        role: user.id === 'guardian' ? 'PARENT' : 'PLAYER',
        status: 'ACTIVE',
        phase: 'FULL',
        loanEndDate: null,
      })),
      team: [{ id: 'team', clubId: 'club', name: 'Club team' }],
      event: [{ id: 'event', clubId: 'club', teamId: 'team', date: eventDate }],
      rsvp: users.map((user) => ({
        id: `rsvp-${user.id}`,
        eventId: 'event',
        userId: user.id,
        status: 'YES',
      })),
      importedFixture: [
        {
          id: 'fixture',
          clubId: 'club',
          teamId: 'team',
          status: 'FINISHED',
          kickoffAt: eventDate,
          homeTeam: 'Club team',
          awayTeam: 'Opponent',
        },
      ],
      message: [{ id: 'message', teamId: 'team' }],
      poll: [
        {
          id: 'poll',
          messageId: 'message',
          question: 'motm:fixture',
          closesAt: new Date(Date.now() + 3_600_000),
        },
      ],
      pollOption: ['adult-candidate', ...excludedIds].map((id) => ({
        id: `poll:${id}`,
        pollId: 'poll',
        label: `Historical ${id}`,
      })),
      pollVote: [
        { id: 'adult-vote', userId: 'adult-voter', optionId: 'poll:adult-candidate' },
        ...excludedIds.map((id) => ({
          id: `vote-for-${id}`,
          userId: `adult-${id}-voter`,
          optionId: `poll:${id}`,
        })),
        ...excludedIds.map((id) => ({
          id: `vote-by-${id}`,
          userId: id,
          optionId: 'poll:adult-candidate',
        })),
      ].map((vote) => ({ ...vote, pollId: 'poll', votedAt: eventDate })),
    },
  )
  const motm = new MotmService(
    db as never,
    { assertReadableAccess: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
  )
  return { db, motm, streaks: new StreaksService(db as never) }
}

describe('default adult operational projections', () => {
  it.each([undefined, 'team'])(
    'filters streak membership and roster projections (team=%s) without changing history',
    async (teamId) => {
      expect(LAUNCH_FEATURES.youthParticipation).toBe(false)
      const { db, streaks } = fixture()
      const history = JSON.stringify(db.tables)
      const result = await streaks.getStreaks('club', 'adult-candidate', teamId)
      const visibleIds = result.leaderboard.map((member) => member.userId)
      expect(visibleIds).toEqual(
        expect.arrayContaining(['adult-candidate', 'adult-voter', 'dual-role']),
      )
      for (const id of excludedIds) expect(visibleIds).not.toContain(id)
      expect(result.me.motmWeeks).toBe(1)
      expect(JSON.stringify(db.tables)).toBe(history)
    },
  )

  it('filters both excluded voters and candidates from the live tally, with actual candidate names', async () => {
    const { db, motm } = fixture()
    const history = JSON.stringify(db.tables)
    const result = await motm.getTally('adult-voter', 'fixture')
    expect(result).toMatchObject({
      totalVotes: 1,
      myVoteUserId: 'adult-candidate',
      results: [{ userId: 'adult-candidate', name: 'Actual candidate', votes: 1, pct: 100 }],
    })
    expect(JSON.stringify(db.tables)).toBe(history)
  })

  it('does not return an excluded candidate as the caller’s historical selection', async () => {
    const { motm } = fixture()
    expect((await motm.getTally('adult-youth-voter', 'fixture')).myVoteUserId).toBeNull()
  })

  it('filters excluded MOTM winners from the season archive without deleting votes/options', async () => {
    const { db, motm } = fixture()
    const history = JSON.stringify(db.tables)
    const result = await motm.getArchive('adult-voter', 'club', undefined, 'team')
    expect(result.topByPlayer).toEqual([
      { userId: 'adult-candidate', name: 'Actual candidate', avatarUrl: null, count: 1 },
    ])
    expect(result.byMatch[0]).toMatchObject({
      motmUserId: 'adult-candidate',
      motmName: 'Actual candidate',
    })
    expect(JSON.stringify(db.tables)).toBe(history)
  })
})
