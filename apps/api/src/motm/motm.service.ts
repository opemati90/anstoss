import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TeamsService } from '../teams/teams.service'

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

    // Ensure a Poll exists for this fixture (one MOTM poll per fixture)
    const poll = await this.ensureMotmPoll(fixture.id, fixture.clubId, fixture.teamId)

    // Resolve the target as a PollOption keyed by candidate userId
    const candidate = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true },
    })
    if (!candidate) throw new BadRequestException('Player not found')

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
