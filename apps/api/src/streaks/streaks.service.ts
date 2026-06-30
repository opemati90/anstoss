import { Injectable } from '@nestjs/common'
import { type StreaksResponse } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { distinctInOrder, isoWeekKey, weekStreaks } from './streak-math'

export { type StreaksResponse }

// How far back streaks look. A rolling window keeps the query bounded and the
// "current streak" meaningful (a run that ended six months ago isn't live).
const WINDOW_DAYS = 26 * 7

@Injectable()
export class StreaksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Real consecutive-week streaks computed on read from existing data:
   *  - attendance = weeks the user RSVP'd YES to ≥1 event, over the weeks the
   *    club actually had events (so off-weeks don't break the run).
   *  - MOTM = weeks the user won Man of the Match, over the weeks the club had
   *    a finished fixture with votes.
   * Returns the caller's current + longest run for each, plus a club
   * leaderboard ranked by current attendance streak.
   */
  async getStreaks(clubId: string, userId: string): Promise<StreaksResponse> {
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000)

    const [events, memberships, fixtures] = await Promise.all([
      this.prisma.event.findMany({
        where: { clubId, date: { gte: since } },
        select: {
          date: true,
          rsvps: { where: { status: 'YES' }, select: { userId: true } },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.membership.findMany({
        where: { clubId },
        select: {
          userId: true,
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.importedFixture.findMany({
        where: { clubId, status: 'FINISHED', kickoffAt: { gte: since } },
        select: { id: true, kickoffAt: true },
        orderBy: { kickoffAt: 'asc' },
      }),
    ])

    // --- Attendance: timeline of event-weeks + per-user attended weeks. ---
    const attendanceTimeline = distinctInOrder(events.map((e) => isoWeekKey(e.date)))
    const attendedByUser = new Map<string, Set<string>>()
    const lastAttendedAtByUser = new Map<string, number>()
    for (const event of events) {
      const week = isoWeekKey(event.date)
      for (const rsvp of event.rsvps) {
        let set = attendedByUser.get(rsvp.userId)
        if (!set) {
          set = new Set<string>()
          attendedByUser.set(rsvp.userId, set)
        }
        set.add(week)
        const t = event.date.getTime()
        if (t > (lastAttendedAtByUser.get(rsvp.userId) ?? 0)) {
          lastAttendedAtByUser.set(rsvp.userId, t)
        }
      }
    }

    // --- MOTM: winner per fixture, bucketed into the fixture's week. ---
    const motmWonByUser = new Map<string, Set<string>>()
    const motmTimeline: string[] = []
    if (fixtures.length > 0) {
      const fixtureWeekById = new Map(fixtures.map((f) => [f.id, isoWeekKey(f.kickoffAt)]))
      const polls = await this.prisma.poll.findMany({
        where: { question: { in: fixtures.map((f) => `motm:${f.id}`) } },
        include: {
          votes: {
            include: { user: { select: { id: true } } },
            orderBy: { votedAt: 'asc' },
          },
        },
      })
      const pollByFixtureId = new Map<string, (typeof polls)[number]>()
      for (const p of polls) {
        if (p.question.startsWith('motm:')) {
          pollByFixtureId.set(p.question.slice('motm:'.length), p)
        }
      }
      // Walk fixtures in chronological order so the MOTM timeline is ascending.
      for (const fixture of fixtures) {
        const poll = pollByFixtureId.get(fixture.id)
        if (!poll || poll.votes.length === 0) continue
        const winner = tallyWinner(poll.votes)
        if (!winner) continue
        const week = fixtureWeekById.get(fixture.id)!
        motmTimeline.push(week)
        let set = motmWonByUser.get(winner)
        if (!set) {
          set = new Set<string>()
          motmWonByUser.set(winner, set)
        }
        set.add(week)
      }
    }
    const motmTimelineDistinct = distinctInOrder(motmTimeline)

    const attendanceFor = (uid: string) =>
      weekStreaks(attendanceTimeline, attendedByUser.get(uid) ?? new Set())
    const motmFor = (uid: string) =>
      weekStreaks(motmTimelineDistinct, motmWonByUser.get(uid) ?? new Set())

    const myAttendance = attendanceFor(userId)
    const myMotm = motmFor(userId)
    const myLastActivity = lastAttendedAtByUser.get(userId)

    // Power ranking — every member (including the caller, so the client can
    // locate and highlight their own row), ranked by MOTM streak first then
    // attendance. Capped so the payload stays bounded on large clubs.
    const leaderboard = memberships
      .map((m) => {
        const a = attendanceFor(m.userId)
        const mo = motmFor(m.userId)
        return {
          userId: m.user.id,
          name: m.user.name,
          avatarUrl: m.user.avatarUrl,
          attendanceWeeks: a.current,
          motmWeeks: mo.current,
        }
      })
      .sort((a, b) => b.motmWeeks - a.motmWeeks || b.attendanceWeeks - a.attendanceWeeks)
      .slice(0, 25)

    return {
      me: {
        attendanceWeeks: myAttendance.current,
        attendanceLongest: myAttendance.longest,
        motmWeeks: myMotm.current,
        motmLongest: myMotm.longest,
        lastActivityAt: new Date(myLastActivity ?? Date.now()).toISOString(),
      },
      leaderboard,
    }
  }
}

/**
 * Highest-votes-wins, ties broken by the earliest first vote (deterministic,
 * mirrors MotmService.getArchive). Returns the winning userId or null.
 */
function tallyWinner(
  votes: Array<{ optionId: string; votedAt: Date; user: { id: string } }>,
): string | null {
  const tally = new Map<string, { votes: number; firstAt: number }>()
  for (const v of votes) {
    const candidateId = v.optionId.split(':')[1]
    if (!candidateId) continue
    const existing = tally.get(candidateId)
    if (existing) existing.votes += 1
    else tally.set(candidateId, { votes: 1, firstAt: v.votedAt.getTime() })
  }
  const ranked = Array.from(tally.entries()).sort(
    (a, b) => b[1].votes - a[1].votes || a[1].firstAt - b[1].firstAt,
  )
  return ranked[0]?.[0] ?? null
}
