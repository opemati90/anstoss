import { Injectable, Logger } from '@nestjs/common'
import { TeamRole } from '@prisma/client'
import {
  ActingSessionForbiddenError,
  ActingSessionNotActiveError,
  ActingSessionTeamNotFoundError,
  type ActingCandidatesResponse,
  type ActingSessionDto,
  type CurrentActingSessionResponse,
  type StartActingSessionInput,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { PushService } from '../push/push.service'
import { activeTeamAccessWhere } from '../teams/active-team-access'
import { effectiveAbsence } from '../teams/squad-count'
import { activeActingSessionWhere, canStartActingSession } from './acting-access'

type SessionRow = {
  id: string
  clubId: string
  teamId: string
  role: string
  reason: string | null
  startedAt: Date
  expiresAt: Date
  endedAt: Date | null
  team: { displayName: string | null; name: string }
}

const SESSION_INCLUDE = { team: { select: { displayName: true, name: true } } } as const

function toDto(row: SessionRow): ActingSessionDto {
  return {
    id: row.id,
    clubId: row.clubId,
    teamId: row.teamId,
    teamName: row.team.displayName || row.team.name,
    role: 'COACH',
    reason: row.reason,
    startedAt: row.startedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
  }
}

/**
 * Vorschau und Vertretung (redesign 29/31): a club board member or team
 * manager temporarily acts as a team's coach. While the session runs,
 * TeamsService grants coach-level permissions for that team. Starting
 * replaces any running session of the same actor.
 */
@Injectable()
export class ActingService {
  private readonly logger = new Logger(ActingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly push: PushService,
  ) {}

  /**
   * Teams the caller may stand in for: every club team the caller does not
   * already coach, with its head coach, teams whose head coach is AWAY first.
   */
  async candidates(clubId: string, userId: string): Promise<ActingCandidatesResponse> {
    await this.assertCanAct(clubId, userId)
    const teams = (await this.prisma.team.findMany({
      where: { clubId },
      select: {
        id: true,
        displayName: true,
        name: true,
        access: {
          where: {
            role: { in: [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH] },
            ...activeTeamAccessWhere(),
          },
          select: { userId: true, role: true, user: { select: { name: true } } },
        },
        // Kader: holiday / suspension lives on the roster row.
        members: { select: { userId: true, absence: true, absenceUntil: true } },
      },
      orderBy: { createdAt: 'asc' },
    })) as unknown as Array<{
      id: string
      displayName: string | null
      name: string
      access: Array<{
        userId: string
        role: string
        user: { name: string | null } | null
      }>
      members: Array<{ userId: string; absence: string | null; absenceUntil: Date | null }>
    }>
    const now = new Date()
    const items = teams
      .filter((team) => !team.access.some((access) => access.userId === userId))
      .map((team) => {
        const head = team.access.find((access) => access.role === TeamRole.HEAD_COACH) ?? null
        const roster = head ? team.members.find((m) => m.userId === head.userId) : undefined
        return {
          teamId: team.id,
          teamName: team.displayName || team.name,
          headCoachName: head?.user?.name ?? null,
          coachAway: roster
            ? effectiveAbsence(roster.absence, roster.absenceUntil, now).absence === 'AWAY'
            : false,
        }
      })
      .sort((a, b) => Number(b.coachAway) - Number(a.coachAway))
    return { items }
  }

  private async assertCanAct(clubId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { role: true, operationalRoles: true },
    })
    if (!canStartActingSession(membership)) {
      throw new ActingSessionForbiddenError(`User ${userId} may not act as coach in ${clubId}`)
    }
  }

  async start(
    clubId: string,
    userId: string,
    input: StartActingSessionInput,
  ): Promise<ActingSessionDto> {
    await this.assertCanAct(clubId, userId)
    const team = await this.prisma.team.findFirst({
      where: { id: input.teamId, clubId },
      select: { id: true, displayName: true, name: true },
    })
    if (!team) {
      throw new ActingSessionTeamNotFoundError(`Team ${input.teamId} not in club ${clubId}`)
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + input.minutes * 60_000)
    const row = (await this.prisma.$transaction(async (tx) => {
      await tx.actingSession.updateMany({
        where: { ...activeActingSessionWhere(userId, now), clubId },
        data: { endedAt: now },
      })
      return tx.actingSession.create({
        data: {
          clubId,
          actorUserId: userId,
          teamId: team.id,
          role: 'COACH',
          reason: input.reason ?? null,
          startedAt: now,
          expiresAt,
        },
        include: SESSION_INCLUDE,
      })
    })) as SessionRow

    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    })
    const actorName = actor?.name || 'Vorstand'
    const teamName = team.displayName || team.name

    await this.audit.log({
      clubId,
      type: 'acting_session.started',
      actorType: 'user',
      actorId: userId,
      actorLabel: `${actorName} (Vorstand) als Trainer`,
      summary: `${actorName} handelt ${input.minutes} Min als Trainer · ${teamName}`,
      metadata: {
        sessionId: row.id,
        teamId: team.id,
        minutes: input.minutes,
        expiresAt: expiresAt.toISOString(),
        reason: input.reason ?? null,
      },
    })

    await this.notifyHeadCoaches(clubId, team.id, userId, {
      actorName,
      teamName,
      minutes: input.minutes,
    })

    return toDto(row)
  }

  async end(clubId: string, userId: string): Promise<ActingSessionDto> {
    const now = new Date()
    const current = await this.prisma.actingSession.findFirst({
      where: { ...activeActingSessionWhere(userId, now), clubId },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    })
    if (!current) {
      throw new ActingSessionNotActiveError(`No active acting session for ${userId} in ${clubId}`)
    }
    const row = (await this.prisma.actingSession.update({
      where: { id: current.id },
      data: { endedAt: now },
      include: SESSION_INCLUDE,
    })) as SessionRow

    await this.audit.log({
      clubId,
      type: 'acting_session.ended',
      actorType: 'user',
      actorId: userId,
      actorLabel: null,
      summary: `Vertretung beendet · ${row.team.displayName || row.team.name}`,
      metadata: { sessionId: row.id, teamId: row.teamId },
    })
    return toDto(row)
  }

  async current(userId: string): Promise<CurrentActingSessionResponse> {
    const row = (await this.prisma.actingSession.findFirst({
      where: activeActingSessionWhere(userId),
      orderBy: { startedAt: 'desc' },
      include: SESSION_INCLUDE,
    })) as SessionRow | null
    return { session: row ? toDto(row) : null }
  }

  private async notifyHeadCoaches(
    clubId: string,
    teamId: string,
    actorUserId: string,
    data: { actorName: string; teamName: string; minutes: number },
  ) {
    const coaches = await this.prisma.teamAccess.findMany({
      where: { teamId, role: TeamRole.HEAD_COACH, ...activeTeamAccessWhere() },
      select: { userId: true },
    })
    const recipients = Array.from(
      new Set(coaches.map((c: { userId: string }) => c.userId)),
    ).filter((id) => id !== actorUserId)
    for (const coachId of recipients) {
      // A failed push must not undo the session; the inbox entry and the
      // audit log still record it.
      await this.push
        .sendToUserLocalized(
          coachId,
          'ACTING_SESSION_STARTED',
          data,
          { type: 'acting_session', clubId, teamId },
          { clubId },
        )
        .catch((error: unknown) =>
          this.logger.warn(`Acting-session push to ${coachId} failed: ${String(error)}`),
        )
    }
  }
}
