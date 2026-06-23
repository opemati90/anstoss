import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TeamsService } from '../teams/teams.service'
import { BillingService } from '../billing/billing.service'

export interface MotmTally {
  fixtureId: string
  totalVotes: number
  results: Array<{
    userId: string
    name: string
    votes: number
    pct: number
  }>
  myVoteUserId: string | null
  closesAt: string | null
}

export interface MotmArchive {
  season: string
  topByPlayer: Array<{
    userId: string
    name: string
    avatarUrl: string | null
    count: number
  }>
  byMatch: Array<{
    matchId: string
    kickoffAt: string
    opponentName: string
    motmUserId: string | null
    motmName: string | null
  }>
}

/**
 * German amateur season runs Aug → May. A date in months Aug–Dec belongs
 * to the season `Y-Y+1`; Jan–Jul belongs to `Y-1-Y`. Returned as the
 * short canonical form `YYYY-YY` (e.g. `2025-26`).
 */
export function currentSeason(now: Date = new Date()): string {
  const month = now.getUTCMonth() // 0–11
  const year = now.getUTCFullYear()
  const startYear = month >= 7 ? year : year - 1 // 7 = August
  const endShort = String((startYear + 1) % 100).padStart(2, '0')
  return `${startYear}-${endShort}`
}

function seasonRange(season: string): { start: Date; end: Date } {
  // Accept "YYYY-YY" or "YYYY-YYYY"; fall back gracefully on garbage.
  const match = /^(\d{4})-(\d{2,4})$/.exec(season.trim())
  if (!match) {
    const fallback = currentSeason()
    return seasonRange(fallback)
  }
  const startYear = parseInt(match[1], 10)
  // Aug 1 of startYear (inclusive) → Aug 1 of startYear+1 (exclusive).
  const start = new Date(Date.UTC(startYear, 7, 1, 0, 0, 0))
  const end = new Date(Date.UTC(startYear + 1, 7, 1, 0, 0, 0))
  return { start, end }
}

/**
 * Man-of-the-Match voting. Backed by a single PollVote row per (fixture, user)
 * — fixture-scoped polls are stored as Polls attached to a synthetic SYSTEM
 * Message in the team channel, so MOTM data flows through the same chat
 * infrastructure as RSVP polls.
 */
@Injectable()
export class MotmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly billingService: BillingService,
  ) {}

  async vote(
    userId: string,
    fixtureId: string,
    targetUserId: string,
  ): Promise<MotmTally> {
    const fixture = await this.prisma.importedFixture.findUnique({
      where: { id: fixtureId },
    })
    if (!fixture) throw new BadRequestException('Fixture not found')
    if (fixture.status !== 'FINISHED') {
      throw new BadRequestException('MOTM voting opens after the final whistle')
    }
    await this.teamsService.assertReadableAccess(userId, fixture.teamId)

    // Premium gate: MOTM voting is part of the 'motm_archive' feature
    // (paywall mirrors apps/web/src/index.html pricing). Read-only
    // tally stays free so match-day flow doesn't dead-end on a Free
    // club, but writing a vote requires the club to be on PREMIUM.
    const entitlements = await this.billingService.getEntitlements(fixture.clubId)
    if (!entitlements.features.includes('motm_archive')) {
      throw new ForbiddenException(
        "MOTM voting requires the club's premium plan",
      )
    }

    // Ensure a Poll exists for this fixture (one MOTM poll per fixture)
    const poll = await this.ensureMotmPoll(fixture.id, fixture.clubId, fixture.teamId)

    // Enforce the voting window. closesAt is stamped when the poll opens; once
    // it passes the result is final and can't be swung days/weeks later.
    if (poll.closesAt && Date.now() > poll.closesAt.getTime()) {
      throw new BadRequestException('MOTM voting has closed')
    }

    // Integrity guards. The endpoint previously accepted any existing userId,
    // so a member could crown themselves or award a non-player / another
    // club's player. Block self-votes and require the candidate to be an
    // ACTIVE player on this fixture's roster.
    if (targetUserId === userId) {
      throw new BadRequestException('You cannot vote for yourself')
    }
    const rosterEntry = await this.prisma.teamAccess.findFirst({
      where: {
        teamId: fixture.teamId,
        userId: targetUserId,
        status: 'ACTIVE',
        role: 'PLAYER',
      },
      select: { user: { select: { id: true, name: true } } },
    })
    if (!rosterEntry) {
      throw new BadRequestException("That player is not on this team's roster")
    }
    const candidate = rosterEntry.user

    const option = await this.prisma.pollOption.upsert({
      where: { id: `${poll.id}:${candidate.id}` },
      create: {
        id: `${poll.id}:${candidate.id}`,
        pollId: poll.id,
        label: candidate.name,
        index: 0,
      },
      update: { label: candidate.name },
    })

    // Replace user's existing vote for this poll (one vote per user)
    await this.prisma.pollVote.deleteMany({
      where: { pollId: poll.id, userId },
    })
    await this.prisma.pollVote.create({
      data: { pollId: poll.id, optionId: option.id, userId },
    })

    return this.getTally(userId, fixtureId)
  }

  async getTally(userId: string, fixtureId: string): Promise<MotmTally> {
    const fixture = await this.prisma.importedFixture.findUnique({
      where: { id: fixtureId },
    })
    if (!fixture) throw new BadRequestException('Fixture not found')
    await this.teamsService.assertReadableAccess(userId, fixture.teamId)

    const poll = await this.prisma.poll.findFirst({
      where: { message: { team: { id: fixture.teamId } }, question: motmQuestion(fixtureId) },
      include: {
        votes: { include: { user: { select: { id: true, name: true } } } },
        options: true,
      },
    })

    if (!poll) {
      return {
        fixtureId,
        totalVotes: 0,
        results: [],
        myVoteUserId: null,
        closesAt: null,
      }
    }

    const total = poll.votes.length
    const tally = new Map<string, { name: string; votes: number }>()
    for (const v of poll.votes as any[]) {
      const candidateId = (v.optionId as string).split(':')[1]
      const existing = tally.get(candidateId) || {
        name: v.user.name as string,
        votes: 0,
      }
      existing.votes += 1
      tally.set(candidateId, existing)
    }

    const myVote = (poll.votes as any[]).find((v) => v.userId === userId)
    const myVoteUserId = myVote ? (myVote.optionId as string).split(':')[1] : null

    return {
      fixtureId,
      totalVotes: total,
      results: Array.from(tally.entries())
        .map(([userId, agg]) => ({
          userId,
          name: agg.name,
          votes: agg.votes,
          pct: total > 0 ? Math.round((agg.votes / total) * 100) : 0,
        }))
        .sort((a, b) => b.votes - a.votes),
      myVoteUserId,
      closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
    }
  }

  /**
   * Read-only archive: every finished fixture in the given season plus
   * the MOTM winner for that fixture (max-votes, ties broken by earliest
   * vote). Aggregates a per-player winner count for the season as well.
   *
   * No new tables — derives everything from the existing fixture +
   * Poll/PollVote graph the live voting flow already writes to.
   */
  async getArchive(
    userId: string,
    clubId: string,
    seasonInput?: string,
  ): Promise<MotmArchive> {
    // Membership check — EntitlementGuard already verified the club is
    // on a plan that includes 'motm_archive', but we still gate read
    // access to club members. (Non-members on a paid club shouldn't be
    // able to scrape the squad's MOTM history.)
    const membership = await this.prisma.membership.findFirst({
      where: { userId, clubId },
    })
    if (!membership) {
      throw new ForbiddenException('Not a member of this club')
    }

    const season = (seasonInput ?? '').trim() || currentSeason()
    const { start, end } = seasonRange(season)

    // 1. Every finished fixture for the club inside the season window.
    const fixtures = await this.prisma.importedFixture.findMany({
      where: {
        clubId,
        status: 'FINISHED',
        kickoffAt: { gte: start, lt: end },
      },
      orderBy: { kickoffAt: 'desc' },
      select: {
        id: true,
        kickoffAt: true,
        homeTeam: true,
        awayTeam: true,
        teamId: true,
      },
    })

    if (fixtures.length === 0) {
      return { season, topByPlayer: [], byMatch: [] }
    }

    // 2. Locate every MOTM poll for those fixtures in a single round trip.
    const questions = fixtures.map((f) => motmQuestion(f.id))
    const polls = await this.prisma.poll.findMany({
      where: { question: { in: questions } },
      include: {
        votes: {
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
          orderBy: { votedAt: 'asc' },
        },
      },
    })

    const pollByFixtureId = new Map<string, (typeof polls)[number]>()
    for (const p of polls) {
      const fixtureId = p.question.startsWith('motm:')
        ? p.question.slice('motm:'.length)
        : null
      if (fixtureId) pollByFixtureId.set(fixtureId, p)
    }

    // 3. Resolve the team's display name(s) so we can compute opponent.
    const teamIds = Array.from(new Set(fixtures.map((f) => f.teamId)))
    const teams = await this.prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, name: true },
    })
    const teamNameById = new Map(teams.map((t) => [t.id, t.name]))

    // 4. Compute per-match winners and per-player tallies.
    const playerCounts = new Map<
      string,
      { name: string; avatarUrl: string | null; count: number }
    >()
    const byMatch: MotmArchive['byMatch'] = []

    for (const fixture of fixtures) {
      const poll = pollByFixtureId.get(fixture.id)
      let motmUserId: string | null = null
      let motmName: string | null = null

      if (poll && poll.votes.length > 0) {
        const tally = new Map<
          string,
          { name: string; avatarUrl: string | null; votes: number; firstAt: number }
        >()
        for (const v of poll.votes) {
          const candidateId = v.optionId.split(':')[1]
          if (!candidateId) continue
          const existing = tally.get(candidateId)
          if (existing) {
            existing.votes += 1
          } else {
            tally.set(candidateId, {
              name: v.user.name,
              avatarUrl: v.user.avatarUrl,
              votes: 1,
              firstAt: v.votedAt.getTime(),
            })
          }
        }
        // Highest votes wins; ties broken by earliest first-vote timestamp
        // (deterministic, matches "first to reach that count").
        const ranked = Array.from(tally.entries()).sort(
          (a, b) => b[1].votes - a[1].votes || a[1].firstAt - b[1].firstAt,
        )
        const winner = ranked[0]
        if (winner) {
          motmUserId = winner[0]
          motmName = winner[1].name
          const prev = playerCounts.get(motmUserId)
          if (prev) {
            prev.count += 1
          } else {
            playerCounts.set(motmUserId, {
              name: winner[1].name,
              avatarUrl: winner[1].avatarUrl,
              count: 1,
            })
          }
        }
      }

      const clubTeamName = teamNameById.get(fixture.teamId) ?? ''
      const opponentName = computeOpponent(
        fixture.homeTeam,
        fixture.awayTeam,
        clubTeamName,
      )

      byMatch.push({
        matchId: fixture.id,
        kickoffAt: fixture.kickoffAt.toISOString(),
        opponentName,
        motmUserId,
        motmName,
      })
    }

    const topByPlayer = Array.from(playerCounts.entries())
      .map(([userId, agg]) => ({
        userId,
        name: agg.name,
        avatarUrl: agg.avatarUrl,
        count: agg.count,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

    return { season, topByPlayer, byMatch }
  }

  private async ensureMotmPoll(
    fixtureId: string,
    clubId: string,
    teamId: string,
  ) {
    const question = motmQuestion(fixtureId)
    const existing = await this.prisma.poll.findFirst({ where: { question } })
    if (existing) return existing

    // System message anchor for the poll
    const message = await this.prisma.message.create({
      data: {
        clubId,
        teamId,
        senderId: (await this.systemSender(clubId, teamId)).id,
        content: 'Man of the Match',
        messageType: 'POLL',
        isAnnouncement: false,
      },
    })

    return this.prisma.poll.create({
      data: {
        messageId: message.id,
        question,
        multiSelect: false,
        closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // open 24h
      },
    })
  }

  private async systemSender(clubId: string, teamId: string) {
    // Use any team coach as the system sender; if none, fall back to club owner.
    const coach = await this.prisma.teamAccess.findFirst({
      where: {
        teamId,
        status: 'ACTIVE',
        role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] as any },
      },
      include: { user: { select: { id: true } } },
    })
    if (coach) return { id: coach.userId }
    const owner = await this.prisma.membership.findFirst({
      where: { clubId, role: 'OWNER' },
    })
    if (!owner) throw new BadRequestException('No system sender available')
    return { id: owner.userId }
  }
}

function motmQuestion(fixtureId: string): string {
  return `motm:${fixtureId}`
}

/**
 * Imported fixtures don't carry a stable "home/away" flag for our club,
 * so we infer the opponent by token-matching the club team name against
 * the home / away labels. Falls back to the away team when we can't
 * decide — that's the common case for amateur leagues where the home
 * team is listed first.
 */
function computeOpponent(
  homeTeam: string,
  awayTeam: string,
  clubTeamName: string,
): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const club = norm(clubTeamName)
  if (club && norm(homeTeam).includes(club)) return awayTeam
  if (club && norm(awayTeam).includes(club)) return homeTeam
  return awayTeam
}
