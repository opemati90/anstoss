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
import { tenantContext } from '../prisma/tenant.context'
import { AuditService } from '../audit/audit.service'
import { PushService } from '../push/push.service'
import { activeTeamAccessWhere } from '../teams/active-team-access'
import { effectiveAbsence } from '../teams/squad-count'
import {
  actingAttribution,
  actingScopeFor,
  activeActingSessionWhere,
  type ActingScope,
} from './acting-access'

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

type CandidateTeamRow = {
  id: string
  displayName: string | null
  name: string
  access: Array<{ userId: string; role: string; user: { name: string | null } | null }>
  members: Array<{ userId: string; absence: string | null; absenceUntil: Date | null }>
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
 * Vorschau und Vertretung (redesign 29/31, REVAMP_HANDOFF "Vorschau und
 * Vertretung"): Vorstand (any team) or a Teammanager (own team) stands in as
 * a team's coach for 15, 30 or 60 minutes. While the session runs,
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
   * Teams the caller may stand in for: in scope (any team for Vorstand, own
   * teams for a Teammanager), not already coached by the caller, with the
   * head coach; teams whose head coach is AWAY come first.
   */
  async candidates(clubId: string, userId: string): Promise<ActingCandidatesResponse> {
    const scope = await this.scopeFor(clubId, userId)
    const ownTeamIds = scope === 'TEAM_MANAGER' ? await this.ownTeamIds(userId, clubId) : null
    const teams = (await this.prisma.team.findMany({
      where: { clubId, ...(ownTeamIds ? { id: { in: ownTeamIds } } : {}) },
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
    })) as unknown as CandidateTeamRow[]
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

  async start(
    clubId: string,
    userId: string,
    input: StartActingSessionInput,
  ): Promise<ActingSessionDto> {
    const scope = await this.scopeFor(clubId, userId)
    const team = await this.prisma.team.findFirst({
      where: { id: input.teamId, clubId },
      select: { id: true, displayName: true, name: true },
    })
    if (!team) {
      throw new ActingSessionTeamNotFoundError(`Team ${input.teamId} not in club ${clubId}`)
    }
    if (scope === 'TEAM_MANAGER' && !(await this.ownTeamIds(userId, clubId)).includes(team.id)) {
      throw new ActingSessionForbiddenError(`Team manager ${userId} is not in team ${team.id}`)
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + input.durationMin * 60_000)
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
          role: input.role,
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
    const actorName = actor?.name || (scope === 'BOARD' ? 'Vorstand' : 'Teammanager')
    const teamName = team.displayName || team.name

    await this.audit.log({
      clubId,
      type: 'acting_session.started',
      actorType: 'user',
      actorId: userId,
      actorLabel: actingAttribution(actorName, scope),
      summary: `${actingAttribution(actorName, scope)} · ${teamName} · ${input.durationMin} Min`,
      metadata: {
        actingSessionId: row.id,
        teamId: team.id,
        durationMin: input.durationMin,
        expiresAt: expiresAt.toISOString(),
        reason: input.reason ?? null,
      },
    })

    await this.notifyHeadCoaches(clubId, team.id, userId, {
      actorName,
      teamName,
      minutes: input.durationMin,
    })

    return toDto(row)
  }

  /** DELETE /acting-sessions/:id — only the actor ends their own session. */
  async end(sessionId: string, userId: string): Promise<ActingSessionDto> {
    const now = new Date()
    // No club in the route: this read is filtered by actor explicitly.
    const current = await this.prisma.actingSession.findFirst({
      where: { id: sessionId, ...activeActingSessionWhere(userId, now) },
      select: { id: true, clubId: true },
    })
    if (!current) {
      throw new ActingSessionNotActiveError(`No active acting session ${sessionId} for ${userId}`)
    }
    // Tenant-scoped write: run it inside the session's club context.
    const row = (await tenantContext.run({ clubId: current.clubId, userId }, () =>
      this.prisma.actingSession.update({
        where: { id: current.id },
        data: { endedAt: now },
        include: SESSION_INCLUDE,
      }),
    )) as SessionRow

    await this.audit.log({
      clubId: row.clubId,
      type: 'acting_session.ended',
      actorType: 'user',
      actorId: userId,
      actorLabel: null,
      summary: `Vertretung beendet · ${row.team.displayName || row.team.name}`,
      metadata: { actingSessionId: row.id, teamId: row.teamId },
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

  private async scopeFor(clubId: string, userId: string): Promise<ActingScope> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { role: true, operationalRoles: true },
    })
    const scope = actingScopeFor(membership)
    if (!scope) {
      throw new ActingSessionForbiddenError(`User ${userId} may not act as coach in ${clubId}`)
    }
    return scope
  }

  /** Teams the user belongs to (any active team role) in this club. */
  private async ownTeamIds(userId: string, clubId: string): Promise<string[]> {
    const rows = await this.prisma.teamAccess.findMany({
      where: { userId, clubId, ...activeTeamAccessWhere() },
      select: { teamId: true },
    })
    return rows.map((row: { teamId: string }) => row.teamId)
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
