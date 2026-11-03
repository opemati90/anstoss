import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { activeLaunchTeamAccessWhere, activeTeamAccessWhere } from '../teams/active-team-access'
import { TeamsService } from '../teams/teams.service'
import { BillingService } from '../billing/billing.service'
import type { Prisma } from '@prisma/client'
import { assertLaunchParticipant, launchClubParticipantWhere } from '../auth/launch-access-policy'

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
  /** Set when scoped to one team (?teamId=); absent = whole club. */
  teamId?: string
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

  async vote(userId: string, fixtureId: string, targetUserId: string): Promise<MotmTally> {
    if (typeof targetUserId !== 'string' || !targetUserId.trim()) {
      throw new BadRequestException('A player is required')
    }
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
      throw new ForbiddenException("MOTM voting requires the club's premium plan")
    }

    await this.prisma.$transaction(async (tx) => {
      // Select any third-party attribution before taking lifecycle locks. Never
      // acquire an extra account lock after the fixture/roster locks: erasure
      // takes account locks first too. Revalidate this exact sender below.
      const observedPoll = await tx.poll.findFirst({ where: { question: motmQuestion(fixtureId) } })
      const selectedSender = observedPoll
        ? null
        : await this.systemSender(fixture.clubId, fixture.teamId, tx)
      // Account deletion takes these same lifecycle locks. Recheck both
      // participants and the anchor sender before creating any linked records.
      const accountIds = [userId, targetUserId, ...(selectedSender ? [selectedSender.id] : [])]
      for (const id of Array.from(new Set(accountIds)).sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`
        await assertLaunchParticipant(tx, id)
      }
      // Club removal takes this lock before changing either membership or team
      // access. Without it a successful preflight could outlive removal.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner:${fixture.clubId}`}))`
      // Participant lifecycle locks always precede feature-scoped locks. The
      // fixture lock makes the first poll lookup/create linearizable even when
      // simultaneous votes have completely disjoint voter/candidate pairs.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`motm-fixture:${fixtureId}`}))`

      // Fixture sync and manual corrections update this row without the MOTM
      // advisory lock. Hold a row lock across the vote so a corrected status
      // cannot invalidate the initial preflight while a vote is being saved.
      await tx.$queryRaw`SELECT "id" FROM "ImportedFixture" WHERE "id" = ${fixtureId} AND "clubId" = ${fixture.clubId} FOR SHARE`
      const currentFixture = await tx.importedFixture.findUnique({ where: { id: fixtureId } })
      if (!currentFixture || currentFixture.clubId !== fixture.clubId || currentFixture.teamId !== fixture.teamId
        || currentFixture.status !== 'FINISHED') {
        throw new BadRequestException('MOTM voting opens after the final whistle')
      }

      // Reading an existing window is safe; opening a new poll must wait until
      // the candidate has passed the adult-only and roster checks below.
      const existingPoll = await tx.poll.findFirst({ where: { question: motmQuestion(fixtureId) } })

      // Enforce the voting window. closesAt is stamped when the poll opens; once
      // it passes the result is final and can't be swung days/weeks later.
      if (existingPoll?.closesAt && Date.now() > existingPoll.closesAt.getTime()) {
        throw new BadRequestException('MOTM voting has closed')
      }

      // Integrity guards. The endpoint previously accepted any existing userId,
      // so a member could crown themselves or award a non-player / another
      // club's player. Block self-votes and require the candidate to be an
      // ACTIVE player on this fixture's roster.
      if (targetUserId === userId) {
        throw new BadRequestException('You cannot vote for yourself')
      }
      // Team mutations can update TeamAccess before Membership. Lock every
      // relevant row in that order (and stable user order) before re-reading
      // voter, candidate and prospective sender authority. Row locks also
      // serialize revocations which don't take the club advisory lock.
      const authorityIds = Array.from(new Set(accountIds)).sort()
      for (const id of authorityIds) {
        await tx.$queryRaw`SELECT "id" FROM "TeamAccess" WHERE "clubId" = ${fixture.clubId} AND "teamId" = ${fixture.teamId} AND "userId" = ${id} ORDER BY "id" FOR SHARE`
      }
      for (const id of authorityIds) {
        await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "clubId" = ${fixture.clubId} AND "userId" = ${id} ORDER BY "id" FOR SHARE`
      }
      const voterMembership = await tx.membership.findFirst({
        where: { clubId: fixture.clubId, userId, user: launchClubParticipantWhere(fixture.clubId) },
        select: { role: true },
      })
      if (!voterMembership) throw new ForbiddenException('You no longer have access to this team')
      if (!['OWNER', 'ADMIN'].includes(voterMembership.role)) {
        const voterAccess = await tx.teamAccess.findFirst({
          where: { clubId: fixture.clubId, teamId: fixture.teamId, userId,
            ...activeLaunchTeamAccessWhere(), phase: 'FULL' },
          select: { id: true },
        })
        if (!voterAccess) throw new ForbiddenException('You no longer have access to this team')
      }
      const rosterEntry = await tx.teamAccess.findFirst({
        where: {
          clubId: fixture.clubId,
          teamId: fixture.teamId,
          userId: targetUserId,
          ...activeTeamAccessWhere(),
          phase: 'FULL',
          role: 'PLAYER',
          user: launchClubParticipantWhere(fixture.clubId),
        },
        select: { user: { select: { id: true, name: true } } },
      })
      if (!rosterEntry) {
        throw new BadRequestException("That player is not on this team's roster")
      }
      const candidate = rosterEntry.user
      if (!existingPoll) {
        if (!selectedSender) {
          // An observed poll can disappear through account erasure while this
          // request waits. Retry rather than selecting an unlocked new sender.
          throw new BadRequestException('No system sender available; please try again')
        }
        const sender = await this.systemSender(fixture.clubId, fixture.teamId, tx, selectedSender.id)
        if (!sender) throw new BadRequestException('No system sender available; please try again')
      }
      const poll =
        existingPoll ??
        (await this.ensureMotmPoll(fixture.id, fixture.clubId, fixture.teamId, selectedSender!.id, tx))
      if (poll.closesAt && Date.now() > poll.closesAt.getTime()) {
        throw new BadRequestException('MOTM voting has closed')
      }

      const option = await tx.pollOption.upsert({
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
      await tx.pollVote.deleteMany({
        where: { pollId: poll.id, userId },
      })
      await tx.pollVote.create({
        data: { pollId: poll.id, optionId: option.id, userId },
      })
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
        votes: {
          where: { user: launchClubParticipantWhere(fixture.clubId) },
          include: { user: { select: { id: true, name: true } } },
        },
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

    const candidates = await this.readLaunchCandidates(fixture.clubId, poll.votes)
    const visibleVotes = poll.votes.filter((vote) => candidates.has(vote.optionId.split(':')[1]))
    const total = visibleVotes.length
    const tally = new Map<string, { name: string; votes: number }>()
    for (const v of visibleVotes) {
      const candidateId = (v.optionId as string).split(':')[1]
      const existing = tally.get(candidateId) || {
        name: candidates.get(candidateId)!.name,
        votes: 0,
      }
      existing.votes += 1
      tally.set(candidateId, existing)
    }

    const myVote = visibleVotes.find((v) => v.userId === userId)
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
    teamId?: string,
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

    // Kader Statistik: optional team scope; the team must be in this club.
    if (teamId) {
      const team = await this.prisma.team.findFirst({
        where: { id: teamId, clubId },
        select: { id: true },
      })
      if (!team) throw new NotFoundException('Team not found')
    }
    const scope = teamId ? { teamId } : {}

    const season = (seasonInput ?? '').trim() || currentSeason()
    const { start, end } = seasonRange(season)

    // 1. Every finished fixture for the club inside the season window.
    const fixtures = await this.prisma.importedFixture.findMany({
      where: {
        clubId,
        ...(teamId ? { teamId } : {}),
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
      return { season, topByPlayer: [], byMatch: [], ...scope }
    }

    // 2. Locate every MOTM poll for those fixtures in a single round trip.
    const questions = fixtures.map((f) => motmQuestion(f.id))
    const polls = await this.prisma.poll.findMany({
      where: { question: { in: questions } },
      include: {
        votes: {
          where: { user: launchClubParticipantWhere(clubId) },
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
          orderBy: { votedAt: 'asc' },
        },
      },
    })
    const candidates = await this.readLaunchCandidates(clubId, polls.flatMap((poll) => poll.votes))

    const pollByFixtureId = new Map<string, (typeof polls)[number]>()
    for (const p of polls) {
      const fixtureId = p.question.startsWith('motm:') ? p.question.slice('motm:'.length) : null
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
          const candidate = candidates.get(candidateId)
          if (!candidate) continue
          const existing = tally.get(candidateId)
          if (existing) {
            existing.votes += 1
          } else {
            tally.set(candidateId, {
              name: candidate.name,
              avatarUrl: candidate.avatarUrl,
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
      const opponentName = computeOpponent(fixture.homeTeam, fixture.awayTeam, clubTeamName)

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

    return { season, topByPlayer, byMatch, ...scope }
  }

  /** Operational projection only: never rewrite historical options or votes. */
  private async readLaunchCandidates(clubId: string, votes: Array<{ optionId: string }>) {
    const ids = Array.from(new Set(votes.map((vote) => vote.optionId.split(':')[1]).filter(Boolean)))
    if (ids.length === 0) return new Map<string, { id: string; name: string; avatarUrl: string | null }>()
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, ...launchClubParticipantWhere(clubId) },
      select: { id: true, name: true, avatarUrl: true },
    })
    return new Map(users.map((user) => [user.id, user]))
  }

  private async ensureMotmPoll(
    fixtureId: string,
    clubId: string,
    teamId: string,
    senderId: string,
    client: Prisma.TransactionClient,
  ) {
    const question = motmQuestion(fixtureId)
    const existing = await client.poll.findFirst({ where: { question } })
    if (existing) return existing

    // System message anchor for the poll
    const message = await client.message.create({
      data: {
        clubId,
        teamId,
        senderId,
        content: 'Man of the Match',
        messageType: 'POLL',
        isAnnouncement: false,
      },
    })

    return client.poll.create({
      data: {
        messageId: message.id,
        question,
        multiSelect: false,
        closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // open 24h
      },
    })
  }

  private async systemSender(
    clubId: string,
    teamId: string,
    client: Prisma.TransactionClient = this.prisma,
    selectedUserId?: string,
  ) {
    // Use any team coach as the system sender; if none, fall back to club owner.
    const coach = await client.teamAccess.findFirst({
      where: {
        clubId,
        teamId,
        ...(selectedUserId ? { userId: selectedUserId } : {}),
        ...activeTeamAccessWhere(),
        phase: 'FULL',
        role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] as any },
        user: launchClubParticipantWhere(clubId),
      },
      include: { user: { select: { id: true } } },
    })
    if (coach) return { id: coach.userId }
    const owner = await client.membership.findFirst({
      where: {
        clubId,
        role: 'OWNER',
        ...(selectedUserId ? { userId: selectedUserId } : {}),
        user: launchClubParticipantWhere(clubId),
      },
    })
    return owner ? { id: owner.userId } : null
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
function computeOpponent(homeTeam: string, awayTeam: string, clubTeamName: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const club = norm(clubTeamName)
  if (club && norm(homeTeam).includes(club)) return awayTeam
  if (club && norm(awayTeam).includes(club)) return homeTeam
  return awayTeam
}
