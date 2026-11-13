import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { generateJoinCode, JOIN_CODE_LENGTH } from './team-join-code.util'
import { activeTeamAccessWhere } from './active-team-access'
import { effectiveAbsence, isSquadMember, loanedOutByTeam } from './squad-count'
// Kader adversarial fixes (H2, M2, M5): messaging rule, duty push, youth check.
import { resolveRosterMessaging } from './roster-messaging'
import { formatDutyAssignedPush, resolveDutyPushLocale } from './duty-push'
import { isYouthTeam } from '../channels/youth-team'
import { PushService } from '../push/push.service'
import {
  ClubCapability,
  ClubOperationalRole,
  MembershipRole,
  ParentalConsentStatus,
  JoinCodeExhaustionError,
  TeamAccessDeniedError,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamGroupType,
  TeamRole,
  rsvpStatusSchema,
  type CreateInjuryReportInput,
  type CreateHierarchicalTeamInput,
  type CreatePlayerLoanInput,
  type CreateTeamGroupInput,
  type RotateTeamDutyInput,
  type RosterOpsSnapshot,
  type TeamFamilyAccessSnapshot,
  type TrialDecisionInput,
  type UpdateTeamCoachAssignmentsInput,
  type UpdateInjuryReportInput,
  type UpdateTeamDutyInput,
  type UpdateTeamMemberInput,
  type UpdateGuardianRelationshipInput,
  type ClubAggregateStats,
} from '@anstoss/shared'
import { buildClubPermissionMap } from '@anstoss/shared'
import { inferLinkedTeamPerspective } from '../integrations/fussball.utils'
import { lockPlayerTeamAccess, reconcileGuardianTeamAccess } from './guardian-team-access'
import { ClubEntitlementsService } from '../billing/club-entitlements.service'
// ── Wechselbörse review fixes (H1/L2): trial-scoped reads + roster decisions.
import { closeLinkedJoinRequest, resolveTrialSessionScope } from '../marketplace/trial-access'
// Vorschau und Vertretung: a running stand-in session grants coach access.
import { hasActiveCoachActingSession } from '../acting/acting-access'

const RsvpStatus = rsvpStatusSchema.enum
const MAX_JOIN_CODE_RETRIES = 5
// First public release: no medic collection or disclosure until an Article 9
// basis, notice, retention/deletion path, and access review are approved.
const MEDIC_FEATURE_ENABLED = false

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
    private readonly clubEntitlements?: ClubEntitlementsService,
    @Optional() private readonly pushService?: PushService,
  ) {}

  async listTeamGroups(clubId: string, userId: string) {
    const membership = await this.getMembership(userId, clubId)
    const canManageClub = isClubManager(membership.role)

    const groups = await this.prisma.teamGroup.findMany({
      where: {
        clubId,
        ...(canManageClub
          ? {}
          : {
              teams: {
                some: {
                  access: {
                    some: {
                      userId,
                      ...activeTeamAccessWhere(),
                    },
                  },
                },
              },
            }),
      },
      include: {
        teams: {
          where: canManageClub
            ? undefined
            : {
                access: {
                  some: {
                    userId,
                    ...activeTeamAccessWhere(),
                  },
                },
              },
          orderBy: [{ displayName: 'asc' }],
          include: {
            _count: {
              select: {
                access: {
                  where: activeTeamAccessWhere(),
                },
              },
            },
            access: {
              where: {
                ...activeTeamAccessWhere(),
                role: {
                  in: [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH],
                },
              },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    avatarUrl: true,
                  },
                },
              },
              orderBy: [{ createdAt: 'asc' }],
            },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
    })

    return groups.map((group: (typeof groups)[number]) => ({
      ...group,
      teams: group.teams.map((team: (typeof group.teams)[number]) => {
        const headCoach =
          team.access.find(
            (entry: (typeof team.access)[number]) => entry.role === TeamRole.HEAD_COACH,
          ) || null
        const assistants = team.access.filter(
          (entry: (typeof team.access)[number]) => entry.role === TeamRole.ASSISTANT_COACH,
        )

        return {
          id: team.id,
          displayName: team.displayName,
          squadLabel: team.squadLabel,
          leagueName: team.leagueName,
          memberCount: team._count.access,
          coachAssignments: {
            headCoach: headCoach
              ? {
                  userId: headCoach.user.id,
                  name: headCoach.user.name,
                  avatarUrl: headCoach.user.avatarUrl,
                }
              : null,
            assistants: assistants.map((entry: (typeof assistants)[number]) => ({
              userId: entry.user.id,
              name: entry.user.name,
              avatarUrl: entry.user.avatarUrl,
            })),
          },
        }
      }),
    }))
  }

  async createTeamGroup(clubId: string, userId: string, data: CreateTeamGroupInput) {
    await this.assertClubAdministrator(clubId, userId)

    const existingCount = await this.prisma.teamGroup.count({
      where: { clubId },
    })

    return this.prisma.teamGroup.create({
      data: {
        clubId,
        type: data.type as TeamGroupType,
        displayName: data.displayName.trim(),
        sortOrder: data.sortOrder ?? existingCount,
      },
    })
  }

  async createTeam(
    clubId: string,
    groupId: string,
    userId: string,
    data: CreateHierarchicalTeamInput,
  ) {
    await this.assertClubAdministrator(clubId, userId)

    const group = await this.prisma.teamGroup.findFirst({
      where: { id: groupId, clubId },
    })

    if (!group) {
      throw new NotFoundException('Team group not found')
    }

    const squadLabel = data.squadLabel?.trim() || null
    const displayName = buildTeamDisplayName(group.displayName, squadLabel, data.name.trim())
    const headCoachUserId = data.headCoachUserId?.trim() || null

    await this.assertCoachAssignmentsAreValid(clubId, {
      headCoachUserId,
      assistantCoachUserIds: [],
    })

    const joinCode = await this.generateUniqueJoinCode()
    const team = await this.prisma.$transaction(async (tx) => {
      await this.requireEntitlements().assertCanCreateTeam(clubId, tx)
      return tx.team.create({
        data: {
          clubId,
          groupId: group.id,
          name: data.name.trim(),
          displayName,
          ageGroup: group.displayName,
          squadLabel,
          leagueName: data.leagueName?.trim() || null,
          seasonStart: data.seasonStart ? new Date(data.seasonStart) : null,
          joinCode,
        },
        include: { group: true },
      })
    })

    // Chat revamp (H4): provision the team's default channels at creation so
    // the inbox never has to seed them on read.
    this.eventEmitter?.emit('team.created', {
      clubId,
      teamId: team.id,
      ageGroup: team.ageGroup ?? null,
    })

    if (headCoachUserId) {
      await this.syncCoachAssignments(clubId, team.id, {
        headCoachUserId,
        assistantCoachUserIds: [],
      })
    }

    return team
  }

  async updateTeamCoachAssignments(
    clubId: string,
    teamId: string,
    userId: string,
    input: UpdateTeamCoachAssignmentsInput,
  ) {
    await this.assertClubAdministrator(clubId, userId)

    const team = await this.prisma.team.findFirst({
      where: {
        id: teamId,
        clubId,
      },
    })

    if (!team) {
      throw new NotFoundException('Team not found')
    }

    const assignments = normalizeCoachAssignments(input)
    await this.assertCoachAssignmentsAreValid(clubId, assignments)
    await this.syncCoachAssignments(clubId, teamId, assignments)

    return this.getTeamCoachAssignments(teamId)
  }

  async listTeamFamilyAccess(
    clubId: string,
    teamId: string,
    userId: string,
  ): Promise<TeamFamilyAccessSnapshot> {
    const access = await this.assertManageAccess(userId, teamId)

    const [playerAccess, relationships, pendingConsents] = await Promise.all([
      this.prisma.teamAccess.findMany({
        where: {
          clubId,
          teamId,
          role: TeamRole.PLAYER,
          status: {
            in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [{ user: { name: 'asc' } }],
      }),
      this.prisma.guardianRelationship.findMany({
        where: {
          clubId,
          OR: [
            { teamId },
            {
              player: {
                teamAccess: {
                  some: {
                    teamId,
                    role: TeamRole.PLAYER,
                    status: {
                      in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
                    },
                  },
                },
              },
            },
          ],
        },
        include: {
          parent: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              teamAccess: {
                where: {
                  teamId,
                  role: TeamRole.PARENT,
                  status: {
                    in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
                  },
                },
                select: {
                  id: true,
                  phase: true,
                  status: true,
                },
                take: 1,
              },
            },
          },
          player: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.parentalConsent.findMany({
        where: {
          clubId,
          teamId,
          status: {
            in: [ParentalConsentStatus.REQUIRED, ParentalConsentStatus.PENDING],
          },
        },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          guardian: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [{ requestedAt: 'desc' }],
      }),
    ])

    return {
      team: {
        id: access.team.id,
        displayName: access.team.displayName,
        group: {
          id: access.team.group.id,
          displayName: access.team.group.displayName,
        },
      },
      players: playerAccess.map((entry: any) => ({
        id: entry.user.id,
        name: entry.user.name,
        avatarUrl: entry.user.avatarUrl,
      })),
      relationships: relationships.map((relationship: any) => ({
        id: relationship.id,
        teamId: relationship.teamId,
        childName: relationship.childName,
        createdAt: relationship.createdAt.toISOString(),
        updatedAt: relationship.updatedAt.toISOString(),
        parent: {
          id: relationship.parent.id,
          name: relationship.parent.name,
          email: relationship.parent.email,
          avatarUrl: relationship.parent.avatarUrl,
        },
        player: relationship.player
          ? {
              id: relationship.player.id,
              name: relationship.player.name,
              avatarUrl: relationship.player.avatarUrl,
            }
          : null,
        parentAccess: relationship.parent.teamAccess[0]
          ? {
              id: relationship.parent.teamAccess[0].id,
              phase: relationship.parent.teamAccess[0].phase as TeamAccessPhase,
              status: relationship.parent.teamAccess[0].status as TeamAccessStatus,
            }
          : null,
      })),
      pendingConsents: pendingConsents.map((consent: any) => ({
        id: consent.id,
        guardianEmail: consent.guardianEmail,
        status: consent.status as ParentalConsentStatus,
        requestedAt: consent.requestedAt.toISOString(),
        approvedAt: consent.approvedAt?.toISOString() || null,
        player: {
          id: consent.player.id,
          name: consent.player.name,
          avatarUrl: consent.player.avatarUrl,
        },
        guardianUser: consent.guardian
          ? {
              id: consent.guardian.id,
              name: consent.guardian.name,
              email: consent.guardian.email,
              avatarUrl: consent.guardian.avatarUrl,
            }
          : null,
      })),
    }
  }

  async updateGuardianRelationship(
    clubId: string,
    teamId: string,
    relationshipId: string,
    userId: string,
    input: UpdateGuardianRelationshipInput,
  ) {
    await this.assertManageAccess(userId, teamId)

    const relationship = await this.prisma.guardianRelationship.findFirst({
      where: {
        id: relationshipId,
        clubId,
        OR: [
          { teamId },
          {
            player: {
              teamAccess: {
                some: {
                  teamId,
                  role: TeamRole.PLAYER,
                  status: {
                    in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
                  },
                },
              },
            },
          },
        ],
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!relationship) {
      throw new NotFoundException('Family link not found')
    }

    let nextPlayerUserId =
      input.playerUserId === undefined ? relationship.playerUserId : input.playerUserId
    let nextChildName = input.childName === undefined ? relationship.childName : input.childName

    if (input.playerUserId) {
      const playerAccess = await this.prisma.teamAccess.findFirst({
        where: {
          clubId,
          teamId,
          userId: input.playerUserId,
          role: TeamRole.PLAYER,
          status: {
            in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
          },
        },
        include: {
          user: {
            select: {
              name: true,
            },
          },
        },
      })

      if (!playerAccess) {
        throw new BadRequestException('Linked child must already have player access in this squad')
      }

      nextPlayerUserId = playerAccess.userId

      if (!nextChildName) {
        nextChildName = playerAccess.user.name
      }
    }

    if (!nextPlayerUserId && !nextChildName) {
      throw new BadRequestException('Family link must keep a child assignment or child name')
    }

    const updated = await this.prisma.guardianRelationship.update({
      where: { id: relationship.id },
      data: {
        teamId,
        playerUserId: nextPlayerUserId,
        childName: nextChildName,
      },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            teamAccess: {
              where: {
                teamId,
                role: TeamRole.PARENT,
                status: {
                  in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
                },
              },
              select: {
                id: true,
                phase: true,
                status: true,
              },
              take: 1,
            },
          },
        },
        player: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    })

    return {
      id: updated.id,
      teamId: updated.teamId,
      childName: updated.childName,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      parent: {
        id: updated.parent.id,
        name: updated.parent.name,
        email: updated.parent.email,
        avatarUrl: updated.parent.avatarUrl,
      },
      player: updated.player
        ? {
            id: updated.player.id,
            name: updated.player.name,
            avatarUrl: updated.player.avatarUrl,
          }
        : null,
      parentAccess: updated.parent.teamAccess[0]
        ? {
            id: updated.parent.teamAccess[0].id,
            phase: updated.parent.teamAccess[0].phase as TeamAccessPhase,
            status: updated.parent.teamAccess[0].status as TeamAccessStatus,
          }
        : null,
    }
  }

  async decideTrialAccess(
    clubId: string,
    teamAccessId: string,
    userId: string,
    input: TrialDecisionInput,
  ) {
    const teamAccess = await this.prisma.teamAccess.findFirst({
      where: {
        id: teamAccessId,
        clubId,
      },
      include: {
        team: true,
      },
    })

    if (!teamAccess) {
      throw new NotFoundException('Trial access not found')
    }

    await this.assertManageAccess(userId, teamAccess.teamId)

    // Also handle FULL-phase PENDING coach access (code-join coaches). The
    // same decision endpoint works for both trial and pending-coach rows so
    // the client doesn't need separate endpoints.
    const isCoachPending =
      teamAccess.phase === TeamAccessPhase.FULL &&
      teamAccess.status === TeamAccessStatus.PENDING &&
      isCoachRole(teamAccess.role)

    if (teamAccess.phase !== TeamAccessPhase.TRIAL && !isCoachPending) {
      throw new BadRequestException('Only trial or pending coach access can be decided')
    }

    if (input.decision === 'ACCEPT') {
      // For pending coach access: activate the TeamAccess and elevate the
      // club Membership to COACH so the mobile's role-based UI works.
      // isClubManager() returns true for COACH, which unlocks club/team
      // management screens, event creation, etc.
      if (isCoachPending) {
        return this.prisma.$transaction(async (tx) => {
          const updated = await tx.teamAccess.update({
            where: { id: teamAccess.id },
            data: { status: TeamAccessStatus.ACTIVE },
          })
          // Elevate membership only if it's still PLAYER (don't downgrade an
          // OWNER/ADMIN who also happens to have a coach access row).
          await tx.membership.updateMany({
            where: {
              userId: teamAccess.userId,
              clubId,
              role: MembershipRole.PLAYER,
            },
            data: { role: MembershipRole.COACH },
          })
          return updated
        })
      }
      // Wechselbörse: a Probetraining player has TRIAL access but no club
      // membership yet. They join through the Aufnahmeantrag (which also
      // runs the seat check), never by a roster "accept" (L2: also when they
      // already are a member of another team of the club).
      const [membership, wechselTrial] = await Promise.all([
        this.prisma.membership.findUnique({
          where: { userId_clubId: { userId: teamAccess.userId, clubId } },
          select: { id: true },
        }),
        this.prisma.trialInvite.findFirst({
          where: {
            clubId,
            teamId: teamAccess.teamId,
            status: { in: ['REQUESTED', 'PENDING', 'ACCEPTED', 'OFFERED'] },
            freeAgentProfile: { userId: teamAccess.userId },
          },
          select: { id: true },
        }),
      ])
      if (!membership || wechselTrial) {
        throw new BadRequestException(
          'This player is on a Probetraining. Offer a place in the Wechselbörse; they join via the membership application.',
        )
      }
      return this.prisma.$transaction(async (tx) => {
        // B1: TRIAL is not a seat; becoming FULL takes one.
        if (teamAccess.role === TeamRole.PLAYER && this.clubEntitlements) {
          await this.clubEntitlements.assertCanActivatePlayer(clubId, teamAccess.userId, tx)
        }
        return tx.teamAccess.update({
          where: { id: teamAccess.id },
          data: {
            phase: TeamAccessPhase.FULL,
            status: TeamAccessStatus.ACTIVE,
          },
        })
      })
    }

    const rejected = await this.prisma.$transaction(async (tx) => {
      const row = await tx.teamAccess.update({
        where: { id: teamAccess.id },
        data: {
          status: TeamAccessStatus.REJECTED,
        },
      })
      // L2: a roster "reject" of a Probetraining player ends the trial the
      // same way the Wechselbörse reject does (invite REJECTED, pending
      // Aufnahmeantrag closed).
      if (teamAccess.phase === TeamAccessPhase.TRIAL) {
        const openTrials = await tx.trialInvite.findMany({
          where: {
            clubId,
            teamId: teamAccess.teamId,
            status: { in: ['REQUESTED', 'PENDING', 'ACCEPTED', 'OFFERED'] },
            freeAgentProfile: { userId: teamAccess.userId },
          },
          select: { id: true },
        })
        for (const trial of openTrials) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trial-invite:${trial.id}`}))`
          await tx.trialInvite.updateMany({
            where: {
              id: trial.id,
              clubId,
              status: { in: ['REQUESTED', 'PENDING', 'ACCEPTED', 'OFFERED'] },
            },
            data: { status: 'REJECTED', decidedAt: new Date(), decidedByUserId: userId },
          })
          await closeLinkedJoinRequest(tx, trial.id, clubId, 'REJECTED' as any, userId)
        }
      }
      return row
    })
    this.eventEmitter?.emit('realtime.access.changed', { userId: teamAccess.userId })
    return rejected
  }

  /**
   * H1 (Wechselbörse review): a Probetraining player (TRIAL access from a
   * trial invite) reads only the invite's sessions, only while the trial
   * window is open (until TRIAL_ACCESS_GRACE_DAYS after the last session, and
   * never once all sessions are cancelled): pass `eventId` for an event read,
   * or `trialFeed` for the event list (the result then carries
   * `trialEventIds` to filter by). Roster, chat, fixtures etc. stay closed.
   */
  async assertReadableAccess(
    userId: string,
    teamId: string,
    opts: { eventId?: string; trialFeed?: boolean } = {},
  ): Promise<
    Awaited<ReturnType<TeamsService['getTeamContext']>> & { trialEventIds?: string[] }
  > {
    const access = await this.getTeamContext(userId, teamId)

    if (access.membership && isClubManager(access.membership.role)) {
      return access
    }

    const fullAccess = access.activeTeamAccess.filter(
      (entry: any) => entry.phase !== TeamAccessPhase.TRIAL,
    )
    if (fullAccess.length > 0) {
      return access
    }

    if (access.activeTeamAccess.length > 0) {
      const trial = await resolveTrialSessionScope(this.prisma as any, userId, teamId)
      if (!trial.wechsel) {
        // Legacy member trial (join request / invite code, pending the
        // coach's roster decision): a club member keeps team reads.
        if (access.membership) return access
      } else if (
        (opts.eventId && trial.eventIds.includes(opts.eventId)) ||
        (opts.trialFeed && trial.eventIds.length > 0)
      ) {
        return { ...access, trialEventIds: trial.eventIds }
      }
    }

    // Vorschau und Vertretung: a stand-in coach reads what a coach reads.
    if (await this.hasActingCoachGrant(userId, access)) {
      return access
    }

    // Parents reach the team via their kid's GuardianRelationship — they
    // don't have direct TeamAccess. Without this branch the parent
    // /event-detail call 401s and the screen surfaces "Try again".
    //
    // Two paths qualify a parent:
    //   (a) the relationship row itself names this team (typical primary team), or
    //   (b) the linked player has active TeamAccess to this team (covers
    //       loans / cross-team appearances where the relationship row's
    //       teamId differs from the event's teamId).
    const directGuardianLink = await this.prisma.guardianRelationship.findFirst({
      where: {
        parentUserId: userId,
        teamId,
        OR: [
          { playerUserId: null },
          {
            player: {
              teamAccess: { some: { teamId, ...activeTeamAccessWhere() } },
              // H1: a child's Probetraining (no club membership yet) does not
              // open the team to the parent.
              memberships: { some: { clubId: access.team.clubId } },
            },
          },
        ],
      },
      select: { id: true },
    })
    if (directGuardianLink) {
      return access
    }

    const guardianViaPlayerLink = await this.prisma.guardianRelationship.findFirst({
      where: {
        parentUserId: userId,
        playerUserId: { not: null },
        player: {
          teamAccess: {
            some: {
              teamId,
              ...activeTeamAccessWhere(),
            },
          },
          memberships: { some: { clubId: access.team.clubId } },
        },
      },
      select: { id: true },
    })
    if (guardianViaPlayerLink) {
      return access
    }

    throw new TeamAccessDeniedError('You do not have access to this team.')
  }

  async assertManageAccess(userId: string, teamId: string) {
    const access = await this.getTeamContext(userId, teamId)

    if (access.membership && isClubManager(access.membership.role)) {
      return access
    }

    const manageableTeamAccess = access.activeTeamAccess.find((entry: any) =>
      isCoachRole(entry.role),
    )

    if (manageableTeamAccess) {
      return access
    }

    if (await this.hasActingCoachGrant(userId, access)) {
      return access
    }

    throw new TeamAccessDeniedError('You do not manage this team.')
  }

  async assertEventManagementAccess(userId: string, teamId: string) {
    const access = await this.getTeamContext(userId, teamId)

    if (access.membership) {
      const permissions = buildClubPermissionMap({
        membershipRole: access.membership.role as any,
        operationalRoles: access.membership.operationalRoles as ClubOperationalRole[],
      })

      if (permissions[ClubCapability.EVENTS]) {
        return access
      }
    }

    const manageableTeamAccess = access.activeTeamAccess.find((entry: any) =>
      isCoachRole(entry.role),
    )

    if (manageableTeamAccess) {
      return access
    }

    if (await this.hasActingCoachGrant(userId, access)) {
      return access
    }

    throw new TeamAccessDeniedError('You do not manage events for this team.')
  }

  /**
   * Vorschau und Vertretung: a club member with a running, unexpired coach
   * acting session for this team ("Trainer vertreten") is treated like a
   * coach. Requires a current membership of the team's club, so the grant
   * ends with the membership even before the session expires.
   */
  private async hasActingCoachGrant(
    userId: string,
    access: { team: { id: string; clubId: string }; membership: unknown },
  ): Promise<boolean> {
    if (!access.membership) return false
    return hasActiveCoachActingSession(this.prisma as any, {
      userId,
      teamId: access.team.id,
      clubId: access.team.clubId,
    })
  }

  // ── ANS-38: Player Loans ─────────────────────────────────────

  async createPlayerLoan(
    clubId: string,
    sourceTeamId: string,
    userId: string,
    input: CreatePlayerLoanInput,
  ) {
    await this.assertLoanManageAccess(userId, clubId, sourceTeamId)

    // Both teams must be in the same club
    const targetTeam = await this.prisma.team.findUnique({
      where: { id: input.targetTeamId },
    })
    if (!targetTeam || targetTeam.clubId !== clubId) {
      throw new BadRequestException('Target team must be in the same club.')
    }
    if (input.targetTeamId === sourceTeamId) {
      throw new BadRequestException('Cannot loan a player to the same team.')
    }
    const loanEndDate = input.loanEndDate ? new Date(input.loanEndDate) : null
    if (loanEndDate && (Number.isNaN(loanEndDate.getTime()) || loanEndDate <= new Date())) {
      throw new BadRequestException('Loan end date must be in the future.')
    }

    return this.prisma.$transaction(async (tx) => {
      // Account deletion uses this same per-user lock. Taking it before team
      // locks prevents a loan from recreating access after deletion cleanup.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.playerUserId}))`
      const activePlayer = await tx.user.findFirst({
        where: { id: input.playerUserId, deletedAt: null },
        select: { id: true, dateOfBirth: true },
      })
      if (!activePlayer) {
        throw new BadRequestException('Player account is no longer active.')
      }

      const lockTeamIds = [sourceTeamId, input.targetTeamId].sort()
      for (const teamId of lockTeamIds) {
        await lockPlayerTeamAccess(tx, clubId, teamId, input.playerUserId)
      }

      // Validate the source entitlement only after both locks are held. A
      // temporary borrower cannot be loaned onward to create an entitlement
      // chain that outlives the original loan.
      const sourceAccess = await tx.teamAccess.findFirst({
        where: {
          teamId: sourceTeamId,
          userId: input.playerUserId,
          role: TeamRole.PLAYER,
          ...activeTeamAccessWhere(),
        },
      })
      if (!sourceAccess) {
        throw new BadRequestException('Player must have active access on the source team.')
      }
      if (sourceAccess.loanedFromTeamId) {
        throw new BadRequestException('A loaned player cannot be loaned to another team.')
      }

      const existingAccess = await tx.teamAccess.findUnique({
        where: {
          teamId_userId_role: {
            teamId: input.targetTeamId,
            userId: input.playerUserId,
            role: TeamRole.PLAYER,
          },
        },
      })
      if (
        existingAccess?.status === TeamAccessStatus.ACTIVE ||
        existingAccess?.status === TeamAccessStatus.PENDING
      ) {
        throw new BadRequestException('Player already has access to the target team.')
      }

      // Privacy (H3): a loan must never re-admit an under-16 whose access was
      // revoked, e.g. by a parental-consent withdrawal. Reactivating a
      // REVOKED row needs an APPROVED consent for the TARGET team; a fresh
      // loan needs the lending team's APPROVED consent (the age gate lets a
      // loaned child in through that consent). Checked under the player-team
      // locks shared with consent withdrawal/approval.
      if (activePlayer.dateOfBirth && isUnderConsentAge(activePlayer.dateOfBirth)) {
        const coveringTeamId =
          existingAccess?.status === TeamAccessStatus.REVOKED ? input.targetTeamId : sourceTeamId
        const approvedConsent = await tx.parentalConsent.findFirst({
          where: {
            clubId,
            teamId: coveringTeamId,
            playerUserId: input.playerUserId,
            status: ParentalConsentStatus.APPROVED,
          },
          select: { id: true },
        })
        if (!approvedConsent) {
          throw new BadRequestException(
            'This player is under 16 and needs an approved parental consent for this team.',
          )
        }
      }

      const loanData = {
        clubId,
        userId: input.playerUserId,
        phase: TeamAccessPhase.FULL,
        status: TeamAccessStatus.ACTIVE,
        loanedFromTeamId: sourceTeamId,
        loanStartDate: new Date(),
        loanEndDate,
      } as const

      if (existingAccess) {
        const reactivated = await tx.teamAccess.updateMany({
          where: {
            id: existingAccess.id,
            status: { in: [TeamAccessStatus.REJECTED, TeamAccessStatus.REVOKED] },
          },
          data: loanData,
        })
        if (reactivated.count !== 1) {
          throw new BadRequestException('Player already has access to the target team.')
        }
        return tx.teamAccess.findUnique({
          where: { id: existingAccess.id },
          include: { team: true },
        })
      }

      try {
        return await tx.teamAccess.create({
          data: {
            ...loanData,
            clubId,
            teamId: input.targetTeamId,
            role: TeamRole.PLAYER,
          },
          include: { team: true },
        })
      } catch (error) {
        if ((error as { code?: string })?.code === 'P2002') {
          throw new BadRequestException('Player already has access to the target team.')
        }
        throw error
      }
    })
  }

  async recallPlayerLoan(
    clubId: string,
    sourceTeamId: string,
    teamAccessId: string,
    userId: string,
  ) {
    await this.assertLoanManageAccess(userId, clubId, sourceTeamId)

    const loanAccess = await this.prisma.teamAccess.findUnique({
      where: { id: teamAccessId },
    })
    if (
      !loanAccess ||
      loanAccess.clubId !== clubId ||
      loanAccess.loanedFromTeamId !== sourceTeamId
    ) {
      throw new NotFoundException('Loan record not found.')
    }
    const recallResult = await this.prisma.$transaction(async (tx) => {
      await lockPlayerTeamAccess(tx, clubId, loanAccess.teamId, loanAccess.userId)
      const currentAccess = await tx.teamAccess.findUnique({ where: { id: teamAccessId } })
      if (
        !currentAccess ||
        currentAccess.clubId !== clubId ||
        currentAccess.teamId !== loanAccess.teamId ||
        currentAccess.userId !== loanAccess.userId ||
        currentAccess.loanedFromTeamId !== sourceTeamId
      ) {
        throw new BadRequestException('Loan changed before it could be recalled.')
      }
      if (
        loanAccess.status === TeamAccessStatus.REVOKED &&
        currentAccess.status === TeamAccessStatus.ACTIVE
      ) {
        throw new BadRequestException('Loan was reactivated before it could be recalled.')
      }

      let playerRevoked = currentAccess.status === TeamAccessStatus.REVOKED
      if (currentAccess.status !== TeamAccessStatus.REVOKED) {
        const recalled = await tx.teamAccess.updateMany({
          where: {
            id: teamAccessId,
            clubId,
            loanedFromTeamId: sourceTeamId,
            status: TeamAccessStatus.ACTIVE,
          },
          data: { status: TeamAccessStatus.REVOKED },
        })
        if (recalled.count !== 1) {
          throw new BadRequestException('Loan changed before it could be recalled.')
        }
        playerRevoked = true
      }
      const guardianDisconnects = await reconcileGuardianTeamAccess(tx, {
        clubId,
        teamId: currentAccess.teamId,
        affectedPlayerUserIds: [currentAccess.userId],
      })
      return { guardianDisconnects, playerRevoked, currentAccess }
    })
    if (recallResult.playerRevoked) {
      this.eventEmitter?.emit('realtime.access.changed', {
        userId: recallResult.currentAccess.userId,
      })
    }
    for (const parentUserId of recallResult.guardianDisconnects) {
      this.eventEmitter?.emit('realtime.access.changed', { userId: parentUserId })
    }
    return { ...recallResult.currentAccess, status: TeamAccessStatus.REVOKED }
  }

  async getTeamByCode(rawCode: string) {
    const code = rawCode.trim().toUpperCase()
    if (code.length !== JOIN_CODE_LENGTH) {
      throw new NotFoundException('Team not found')
    }
    const team = await this.prisma.team.findUnique({
      where: { joinCode: code },
      include: { club: { select: { id: true, name: true, badgeUrl: true, primaryColor: true } } },
    })
    if (!team) throw new NotFoundException('Team not found for this code')
    return {
      team: { id: team.id, name: team.name, displayName: team.displayName, clubId: team.clubId },
      club: team.club,
    }
  }

  // Find an unused join code (the @unique constraint is the final safety net).
  private async generateUniqueJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_JOIN_CODE_RETRIES; attempt++) {
      const code = generateJoinCode()
      const taken = await this.prisma.team.findUnique({
        where: { joinCode: code },
        select: { id: true },
      })
      if (!taken) return code
    }
    throw new JoinCodeExhaustionError()
  }

  async regenerateJoinCode(clubId: string, teamId: string, userId: string) {
    const membership = await this.getMembership(userId, clubId)
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      throw new TeamAccessDeniedError('You do not have access to regenerate the join code.')
    }
    for (let attempt = 0; attempt < MAX_JOIN_CODE_RETRIES; attempt++) {
      const code = generateJoinCode()
      try {
        return await this.prisma.team.update({
          where: { id: teamId, clubId },
          data: { joinCode: code },
          select: { id: true, joinCode: true },
        })
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          Array.isArray(err.meta?.target) &&
          (err.meta.target as string[]).includes('joinCode')
        ) {
          continue
        }
        throw err
      }
    }
    throw new JoinCodeExhaustionError()
  }

  // ── ANS-39: Enhanced Roster ──────────────────────────────────

  async updateRosterEntry(
    clubId: string,
    teamId: string,
    targetUserId: string,
    userId: string,
    input: UpdateTeamMemberInput,
  ) {
    // Kader revamp: a player may mark themself away (Urlaub) or back (NONE).
    // Everything else — position, number, activity, Sperre, and any change
    // to another member — stays coach-only.
    const selfAbsenceOnly =
      targetUserId === userId &&
      input.position === undefined &&
      input.jerseyNumber === undefined &&
      input.operationalStatus === undefined &&
      (input.absence === 'AWAY' || input.absence === 'NONE')

    if (selfAbsenceOnly) {
      await this.assertSelfAbsenceAccess(clubId, teamId, userId)
    } else {
      await this.assertManageAccess(userId, teamId)
      await this.assertRosterMemberExists(clubId, teamId, targetUserId)
    }

    // Kader fix L2: a shirt number is unique within the team's current roster.
    if (input.jerseyNumber !== undefined && input.jerseyNumber !== null) {
      await this.assertJerseyNumberFree(clubId, teamId, targetUserId, input.jerseyNumber)
    }

    const absenceData =
      input.absence !== undefined
        ? {
            absence: input.absence,
            absenceUntil:
              input.absence === 'NONE' || !input.absenceUntil ? null : new Date(input.absenceUntil),
          }
        : input.absenceUntil !== undefined
          ? { absenceUntil: input.absenceUntil ? new Date(input.absenceUntil) : null }
          : {}

    return this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId: targetUserId } },
      update: {
        ...(input.position !== undefined && { position: input.position }),
        ...(input.jerseyNumber !== undefined && {
          jerseyNumber: input.jerseyNumber,
        }),
        ...(input.operationalStatus !== undefined &&
          input.operationalStatus !== null && {
            operationalStatus: input.operationalStatus,
          }),
        ...absenceData,
      },
      create: {
        teamId,
        userId: targetUserId,
        position: input.position ?? null,
        jerseyNumber: input.jerseyNumber ?? null,
        operationalStatus: input.operationalStatus ?? 'ACTIVE',
        ...absenceData,
      },
    })
  }

  /**
   * Self-service absence: the caller must be an active player of the team
   * (coaches setting their own status fall through to manage access), and a
   * player cannot lift a Sperre a coach set by marking themself away or back.
   */
  private async assertSelfAbsenceAccess(clubId: string, teamId: string, userId: string) {
    const ownAccess = await this.prisma.teamAccess.findFirst({
      where: {
        clubId,
        teamId,
        userId,
        role: TeamRole.PLAYER,
        // Kader fix L1: trialists are not squad players and cannot self-report.
        phase: TeamAccessPhase.FULL,
        ...activeTeamAccessWhere(),
      },
      select: { id: true },
    })

    if (!ownAccess) {
      await this.assertManageAccess(userId, teamId)
      return
    }

    const existing = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { absence: true, absenceUntil: true },
    })
    if (effectiveAbsence(existing?.absence, existing?.absenceUntil).absence === 'SUSPENDED') {
      throw new TeamAccessDeniedError('Only a coach can lift a suspension.')
    }
  }

  /**
   * Kader fix L2: another member of this team's current roster (active or
   * pending access) already wears this number → 409 with a clear message.
   */
  private async assertJerseyNumberFree(
    clubId: string,
    teamId: string,
    targetUserId: string,
    jerseyNumber: number,
  ) {
    const holders = await this.prisma.teamMember.findMany({
      where: { teamId, jerseyNumber, userId: { not: targetUserId } },
      select: { userId: true },
    })
    if (holders.length === 0) return
    const onRoster = await this.prisma.teamAccess.findFirst({
      where: {
        clubId,
        teamId,
        userId: { in: holders.map((holder: { userId: string }) => holder.userId) },
        status: { in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING] },
      },
      select: { user: { select: { name: true } } },
    })
    if (!onRoster) return
    throw new ConflictException({
      message: `Jersey number ${jerseyNumber} is already taken in this team by ${onRoster.user?.name ?? 'another player'}.`,
      code: 'JERSEY_NUMBER_TAKEN',
    })
  }

  async getRosterOperations(
    clubId: string,
    teamId: string,
    userId: string,
  ): Promise<RosterOpsSnapshot> {
    const access = await this.assertReadableAccess(userId, teamId)
    // Injury titles and return dates are health data. A player's or guardian's
    // permission to read the roster must not disclose teammates' medic records.
    const canViewMedic =
      (access.membership && isClubManager(access.membership.role)) ||
      access.activeTeamAccess.some((entry: any) => isCoachRole(entry.role))

    const team = await this.prisma.team.findFirst({
      where: { id: teamId, clubId },
      select: {
        id: true,
        name: true,
        displayName: true,
        squadTarget: true,
        ageGroup: true,
      },
    })

    if (!team) {
      throw new NotFoundException('Team not found')
    }

    const accessEntries = await this.prisma.teamAccess.findMany({
      where: {
        clubId,
        teamId,
        status: {
          in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
        loanedFromTeam: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    })

    const teamMemberRecords = await this.prisma.teamMember.findMany({
      where: {
        teamId,
        userId: {
          in: accessEntries.map((entry: any) => entry.userId),
        },
      },
    })

    const teamMemberByUserId = new Map(
      teamMemberRecords.map((member: any) => [member.userId, member]),
    )
    const now = new Date()

    // ── Kader adversarial fixes (team agent) ──────────────────────────────
    // L5: players on an active loan from this team to another one.
    // H2: whether the viewer may DM each member (same rule as the DM API).
    // M5: in youth teams a Sperre reads as a neutral "Nicht verfügbar" for
    //     everyone but the team's managers and the player themself.
    const [loanedOut, messaging] = await Promise.all([
      loanedOutByTeam(this.prisma, [teamId], now).then((byTeam) => byTeam.get(teamId) ?? new Map()),
      resolveRosterMessaging(this.prisma, {
        viewerId: userId,
        clubId,
        memberIds: accessEntries.map((entry: any) => entry.userId),
        now,
      }),
    ])
    const loanTargetIds = Array.from(
      new Set(Array.from(loanedOut.values(), (loan: { teamId: string }) => loan.teamId)),
    )
    const loanTargets =
      loanTargetIds.length > 0
        ? await this.prisma.team.findMany({
            where: { id: { in: loanTargetIds } },
            select: { id: true, name: true, displayName: true },
          })
        : []
    const loanTargetName = new Map(
      (loanTargets ?? []).map((target: any) => [target.id, target.displayName || target.name]),
    )
    const maskSuspension = isYouthTeam(team.ageGroup) && !canViewMedic

    const rosterEntriesWithLoan = accessEntries
      .map((entry: any) => {
        const member = teamMemberByUserId.get(entry.userId)
        const absence = effectiveAbsence(member?.absence, member?.absenceUntil, now)
        const loan = entry.role === TeamRole.PLAYER ? loanedOut.get(entry.userId) : undefined
        const dm = messaging.get(entry.userId)
        return {
          id: entry.id,
          userId: entry.userId,
          name: entry.user.name,
          avatarUrl: entry.user.avatarUrl,
          role: entry.role,
          phase: entry.phase,
          status: entry.status,
          position: member?.position ?? null,
          jerseyNumber: member?.jerseyNumber ?? null,
          operationalStatus: member?.operationalStatus ?? 'ACTIVE',
          ...(maskSuspension && absence.absence === 'SUSPENDED' && entry.userId !== userId
            ? { absence: 'UNAVAILABLE' as const, absenceUntil: absence.absenceUntil }
            : absence),
          loanEndDate: entry.loanEndDate ?? null,
          createdAt: entry.createdAt.toISOString(),
          loanedFromTeamId: entry.loanedFromTeamId,
          loanedFromTeamName: entry.loanedFromTeam
            ? entry.loanedFromTeam.displayName || entry.loanedFromTeam.name
            : null,
          loanedOutToTeamName: loan ? (loanTargetName.get(loan.teamId) ?? null) : null,
          loanedOutUntil: loan?.loanEndDate ? new Date(loan.loanEndDate).toISOString() : null,
          canMessage: dm?.canMessage ?? false,
          messageBlockedReason: dm ? dm.reason : 'AGE_UNVERIFIED',
        }
      })
      .sort(compareRosterEntries)

    // One squad number (players only, FULL, ACTIVE, not INACTIVE) — the same
    // rule countSquadByTeam applies to event squadSize.
    const squadCount = new Set(
      rosterEntriesWithLoan
        .filter((entry) =>
          isSquadMember({ ...entry, loanedOut: loanedOut.has(entry.userId) }, now),
        )
        .map((entry) => entry.userId),
    ).size
    // A loan that has ended no longer puts the player on this team, even
    // before the expiry worker revokes the access row.
    const rosterEntries = rosterEntriesWithLoan
      .filter(
        (entry) => !(entry.loanEndDate && new Date(entry.loanEndDate).getTime() <= now.getTime()),
      )
      .map(({ loanEndDate: _loanEndDate, ...entry }) => entry)

    const [injuryReports, dutyAssignments, viewerChildIds] = await Promise.all([
      MEDIC_FEATURE_ENABLED && canViewMedic
        ? this.prisma.injuryReport.findMany({
            where: {
              clubId,
              teamId,
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatarUrl: true,
                },
              },
            },
            orderBy: [{ updatedAt: 'desc' }],
          })
        : Promise.resolve([]),
      this.prisma.teamDutyAssignment.findMany({
        where: {
          clubId,
          teamId,
        },
        include: {
          assignedUser: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }],
      }),
      // M2: parents see (and may tick off) their linked child's duty.
      this.getGuardianChildIds(clubId, userId),
    ])
    const withViewerRelation = (assignment: any) => ({
      ...serializeDutyAssignment(assignment),
      viewerRelation:
        assignment.assignedUserId === userId
          ? ('SELF' as const)
          : viewerChildIds.has(assignment.assignedUserId)
            ? ('CHILD' as const)
            : null,
    })

    return {
      team: {
        id: team.id,
        displayName: team.displayName || team.name,
        squadTarget: team.squadTarget,
      },
      squadCount,
      squad: rosterEntries.filter(
        (entry) =>
          entry.phase === TeamAccessPhase.FULL &&
          entry.status === TeamAccessStatus.ACTIVE &&
          entry.operationalStatus === 'ACTIVE',
      ),
      operations: {
        trials: rosterEntries.filter(
          (entry) =>
            entry.phase === TeamAccessPhase.TRIAL &&
            entry.status !== TeamAccessStatus.REJECTED &&
            entry.status !== TeamAccessStatus.REVOKED,
        ),
        newPlayers: rosterEntries.filter(
          (entry) =>
            entry.phase === TeamAccessPhase.FULL &&
            entry.status === TeamAccessStatus.ACTIVE &&
            entry.operationalStatus === 'NEW_PLAYER',
        ),
        inactive: rosterEntries.filter(
          (entry) =>
            entry.status === TeamAccessStatus.ACTIVE && entry.operationalStatus === 'INACTIVE',
        ),
        pendingCoaches: rosterEntries.filter(
          (entry) =>
            entry.phase === TeamAccessPhase.FULL &&
            entry.status === TeamAccessStatus.PENDING &&
            (entry.role === TeamRole.ASSISTANT_COACH || entry.role === TeamRole.HEAD_COACH),
        ),
      },
      medic: {
        active: injuryReports.filter((report: any) => !report.clearedAt).map(serializeInjuryReport),
        recentlyCleared: injuryReports
          .filter((report: any) => Boolean(report.clearedAt))
          .slice(0, 6)
          .map(serializeInjuryReport),
      },
      kit: {
        pending: dutyAssignments
          .filter((assignment: any) => assignment.status === 'PENDING')
          .map(withViewerRelation),
        recent: dutyAssignments
          .filter((assignment: any) => assignment.status !== 'PENDING')
          .slice(0, 6)
          .map(withViewerRelation),
      },
    }
  }

  async createInjuryReport(
    clubId: string,
    teamId: string,
    actorUserId: string,
    input: CreateInjuryReportInput,
  ) {
    if (!MEDIC_FEATURE_ENABLED) {
      throw new NotFoundException('Medic feature is unavailable')
    }
    await this.assertManageAccess(actorUserId, teamId)
    await this.assertRosterMemberExists(clubId, teamId, input.userId)

    const report = await this.prisma.injuryReport.create({
      data: {
        clubId,
        teamId,
        userId: input.userId,
        reportedById: actorUserId,
        title: input.title.trim(),
        notes: input.notes?.trim() || null,
        status: input.status,
        expectedReturnAt: input.expectedReturnAt ? new Date(input.expectedReturnAt) : null,
        expectedReturnLabel: input.expectedReturnLabel?.trim() || null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    })

    return serializeInjuryReport(report)
  }

  async updateInjuryReport(
    clubId: string,
    teamId: string,
    injuryId: string,
    actorUserId: string,
    input: UpdateInjuryReportInput,
  ) {
    if (!MEDIC_FEATURE_ENABLED) {
      throw new NotFoundException('Medic feature is unavailable')
    }
    await this.assertManageAccess(actorUserId, teamId)

    const existing = await this.prisma.injuryReport.findFirst({
      where: {
        id: injuryId,
        clubId,
        teamId,
      },
    })

    if (!existing) {
      throw new NotFoundException('Injury report not found')
    }

    const report = await this.prisma.injuryReport.update({
      where: { id: injuryId },
      data: {
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(input.notes !== undefined && { notes: input.notes?.trim() || null }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.expectedReturnAt !== undefined && {
          expectedReturnAt: input.expectedReturnAt ? new Date(input.expectedReturnAt) : null,
        }),
        ...(input.expectedReturnLabel !== undefined && {
          expectedReturnLabel: input.expectedReturnLabel?.trim() || null,
        }),
        ...(input.cleared !== undefined && {
          clearedAt: input.cleared ? new Date() : null,
        }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    })

    return serializeInjuryReport(report)
  }

  async rotateTeamDuty(
    clubId: string,
    teamId: string,
    actorUserId: string,
    input: RotateTeamDutyInput,
  ) {
    await this.assertManageAccess(actorUserId, teamId)

    const eligibleEntries = await this.prisma.teamAccess.findMany({
      where: {
        clubId,
        teamId,
        role: TeamRole.PLAYER,
        phase: TeamAccessPhase.FULL,
        ...activeTeamAccessWhere(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ user: { name: 'asc' } }],
    })

    // Kader fix M2: all profiles, not only the non-INACTIVE ones — filtering
    // them out in the query made an INACTIVE player look profile-less and
    // therefore eligible. Skipped: INACTIVE, anyone whose effective absence
    // is not NONE (Urlaub / Sperre), players loaned IN from another team and
    // players currently loaned OUT to another team.
    const now = new Date()
    const [eligibilityMembers, loanedOut] = await Promise.all([
      this.prisma.teamMember.findMany({
        where: {
          teamId,
          userId: {
            in: eligibleEntries.map((entry: any) => entry.userId),
          },
        },
      }),
      loanedOutByTeam(this.prisma, [teamId], now).then((byTeam) => byTeam.get(teamId) ?? new Map()),
    ])

    const eligibilityByUserId = new Map(
      eligibilityMembers.map((member: any) => [member.userId, member]),
    )
    const eligibleRoster = eligibleEntries.filter((entry: any) => {
      if (entry.loanedFromTeamId) return false
      if (loanedOut.has(entry.userId)) return false
      const member = eligibilityByUserId.get(entry.userId)
      if (!member) return true
      if (member.operationalStatus === 'INACTIVE') return false
      return effectiveAbsence(member.absence, member.absenceUntil, now).absence === 'NONE'
    })

    if (eligibleRoster.length === 0) {
      throw new BadRequestException('No eligible active players are available for kit rotation.')
    }

    const lastAssignment = await this.prisma.teamDutyAssignment.findFirst({
      where: {
        clubId,
        teamId,
        kind: input.kind,
      },
      orderBy: [{ createdAt: 'desc' }],
    })

    const lastIndex = eligibleRoster.findIndex(
      (entry: any) => entry.userId === lastAssignment?.assignedUserId,
    )
    const nextAssignee =
      eligibleRoster[(lastIndex + 1 + eligibleRoster.length) % eligibleRoster.length]

    const assignment = await this.prisma.teamDutyAssignment.create({
      data: {
        clubId,
        teamId,
        assignedUserId: nextAssignee.userId,
        createdById: actorUserId,
        kind: input.kind,
        status: 'PENDING',
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        notes: input.notes?.trim() || null,
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    })

    // M2: tell the assignee. Best-effort: a failed push never undoes the rota.
    await this.notifyDutyAssigned(clubId, teamId, assignment)

    return serializeDutyAssignment(assignment)
  }

  private async notifyDutyAssigned(
    clubId: string,
    teamId: string,
    assignment: { id: string; assignedUserId: string; kind: string; dueDate: Date | null },
  ) {
    if (!this.pushService) return
    try {
      const [recipient, team] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: assignment.assignedUserId },
          select: { preferredLanguage: true },
        }),
        this.prisma.team.findUnique({
          where: { id: teamId },
          select: { name: true, displayName: true },
        }),
      ])
      const { title, body } = formatDutyAssignedPush(
        {
          kind: assignment.kind,
          teamName: team?.displayName || team?.name || '',
          dueDate: assignment.dueDate ?? null,
        },
        resolveDutyPushLocale(recipient?.preferredLanguage),
      )
      await this.pushService.sendToUser(
        assignment.assignedUserId,
        title,
        body,
        { kind: 'TEAM_DUTY_ASSIGNED', clubId, teamId, dutyId: assignment.id },
        { clubId, category: 'events' },
      )
    } catch {
      // Delivery problems are logged by the push service; the rota stands.
    }
  }

  /**
   * Children the user is the linked guardian of in this club: a guardian
   * relationship naming the child, or the child's managing account.
   */
  private async getGuardianChildIds(clubId: string, userId: string): Promise<Set<string>> {
    const [links, managed] = await Promise.all([
      this.prisma.guardianRelationship.findMany({
        where: { clubId, parentUserId: userId, playerUserId: { not: null } },
        select: { playerUserId: true },
      }),
      this.prisma.user.findMany({
        where: { managedById: userId, deletedAt: null },
        select: { id: true },
      }),
    ])
    return new Set<string>([
      ...(links ?? []).map((link: any) => link.playerUserId as string).filter(Boolean),
      ...(managed ?? []).map((child: any) => child.id as string),
    ])
  }

  async updateTeamDuty(
    clubId: string,
    teamId: string,
    dutyId: string,
    actorUserId: string,
    input: UpdateTeamDutyInput,
  ) {
    const existing = await this.prisma.teamDutyAssignment.findFirst({
      where: {
        id: dutyId,
        clubId,
        teamId,
      },
    })

    if (!existing) {
      // Same answer for "missing" and "not yours" would need the access check
      // first; managers get the 404, everyone else the access error below.
      await this.assertManageAccess(actorUserId, teamId)
      throw new NotFoundException('Team duty assignment not found')
    }

    // Kader revamp (Aufgaben): the assignee — or their linked guardian (M2) —
    // may tick off the duty as done. Skipping, reopening and editing others'
    // duties stay coach-only.
    const completionOnly =
      existing.status === 'PENDING' && input.status === 'COMPLETED' && input.notes === undefined
    const ownCompletion =
      completionOnly &&
      (existing.assignedUserId === actorUserId ||
        (await this.getGuardianChildIds(clubId, actorUserId)).has(existing.assignedUserId))
    if (ownCompletion) {
      // Only while the assignee is still on the team; a coach's skip is never
      // overwritten (the compare-and-set below).
      const stillOnTeam = await this.prisma.teamAccess.findFirst({
        where: { clubId, teamId, userId: existing.assignedUserId, ...activeTeamAccessWhere() },
        select: { id: true },
      })
      if (!stillOnTeam) await this.assertManageAccess(actorUserId, teamId)
    } else {
      await this.assertManageAccess(actorUserId, teamId)
    }

    // Kader fix M3: compare-and-set on the status we authorised against, so a
    // coach's skip and a player's "Erledigt" racing each other cannot both win.
    const updated = await this.prisma.teamDutyAssignment.updateMany({
      where: { id: dutyId, clubId, teamId, status: existing.status },
      data: {
        status: input.status,
        ...(input.notes !== undefined && {
          notes: input.notes?.trim() || null,
        }),
        completedAt: input.status === 'COMPLETED' ? new Date() : null,
      },
    })
    if (updated.count === 0) {
      throw new ConflictException({
        message: 'This duty was changed in the meantime. Reload and try again.',
        code: 'DUTY_CHANGED',
      })
    }

    const assignment = await this.prisma.teamDutyAssignment.findUnique({
      where: { id: dutyId },
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    })

    return serializeDutyAssignment(assignment)
  }

  async getAggregateRoster(clubId: string, userId: string) {
    await this.assertClubManager(clubId, userId)

    const teams = await this.prisma.team.findMany({
      where: { clubId },
      include: {
        group: true,
        access: {
          where: activeTeamAccessWhere(),
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
        members: true,
      },
      orderBy: [{ group: { sortOrder: 'asc' } }, { displayName: 'asc' }],
    })

    const teamNameById = new Map(teams.map((t: any) => [t.id, t.displayName || t.name]))

    return teams.reduce((acc: any, team: any) => {
      acc[team.id] = {
        teamName: team.name,
        teamDisplayName: team.displayName,
        groupName: team.group?.displayName ?? null,
        members: team.access.map((access: any) => {
          const memberData = team.members.find((m: any) => m.userId === access.userId)
          return {
            userId: access.userId,
            name: access.user.name,
            email: access.user.email,
            avatarUrl: access.user.avatarUrl,
            role: access.role,
            phase: access.phase,
            status: access.status,
            position: memberData?.position ?? null,
            jerseyNumber: memberData?.jerseyNumber ?? null,
            loanedFromTeamId: access.loanedFromTeamId,
            loanedFromTeamName: access.loanedFromTeamId
              ? (teamNameById.get(access.loanedFromTeamId) ?? null)
              : null,
          }
        }),
      }
      return acc
    }, {})
  }

  // ── ANS-41: Club Stats ───────────────────────────────────────

  async getClubStats(clubId: string, userId: string): Promise<ClubAggregateStats> {
    await this.assertClubManager(clubId, userId)

    const now = new Date()

    const [memberCount, teams, upcomingEvents, rsvps] = await Promise.all([
      this.prisma.membership.count({ where: { clubId } }),
      this.prisma.team.findMany({
        where: { clubId },
        select: {
          id: true,
          name: true,
          displayName: true,
          _count: { select: { access: { where: activeTeamAccessWhere(now) } } },
          events: {
            where: { date: { gte: now }, cancelledAt: null },
            select: { id: true },
          },
        },
      }),
      this.prisma.event.count({
        where: { clubId, date: { gte: now }, cancelledAt: null },
      }),
      this.prisma.rsvp.findMany({
        where: {
          event: { clubId, date: { gte: now }, cancelledAt: null },
        },
        select: { status: true, event: { select: { teamId: true } } },
      }),
    ])

    const totalRsvps = rsvps.length
    const yesRsvps = rsvps.filter((r: any) => r.status === RsvpStatus.YES).length
    const overallRsvpRate = totalRsvps > 0 ? yesRsvps / totalRsvps : 0

    const perTeamRsvp = rsvps.reduce((acc: any, rsvp: any) => {
      const teamId = rsvp.event.teamId
      const stats = acc[teamId] ?? { total: 0, yes: 0 }
      stats.total += 1
      if (rsvp.status === RsvpStatus.YES) stats.yes += 1
      acc[teamId] = stats
      return acc
    }, {})

    return {
      memberCount,
      teamCount: teams.length,
      upcomingEventCount: upcomingEvents,
      overallRsvpRate: Math.round(overallRsvpRate * 100),
      teams: teams.map((team: any) => {
        const stats = perTeamRsvp[team.id] ?? { total: 0, yes: 0 }
        return {
          teamId: team.id,
          teamName: team.name,
          teamDisplayName: team.displayName,
          memberCount: team._count.access,
          upcomingEventCount: team.events.length,
          rsvpRate: stats.total > 0 ? Math.round((stats.yes / stats.total) * 100) : 0,
        }
      }),
    }
  }

  // ── ANS-50: Season Stats ────────────────────────────────────

  async getTeamSeasonStats(
    clubId: string,
    teamId: string,
    userId: string,
  ): Promise<{
    played: number
    wins: number
    draws: number
    losses: number
    winRate: number
    goalDifference: number
    recentForm: Array<'W' | 'D' | 'L'>
  }> {
    // Require coach or club-manager access
    await this.assertEventManagementAccess(userId, teamId)

    // Pull finished fixtures with results for this team, include teamLink label
    const fixtures = await this.prisma.importedFixture.findMany({
      where: {
        clubId,
        teamId,
        status: 'FINISHED',
        resultHome: { not: null },
        resultAway: { not: null },
      },
      select: {
        kickoffAt: true,
        homeTeam: true,
        awayTeam: true,
        resultHome: true,
        resultAway: true,
        teamLink: { select: { label: true } },
      },
      orderBy: { kickoffAt: 'desc' },
    })

    if (fixtures.length === 0) {
      return {
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        winRate: 0,
        goalDifference: 0,
        recentForm: [],
      }
    }

    let wins = 0
    let draws = 0
    let losses = 0
    let goalsFor = 0
    let goalsAgainst = 0
    const recentForm: Array<'W' | 'D' | 'L'> = []

    for (const fixture of fixtures) {
      const linkedLabel = fixture.teamLink.label ?? ''
      const { isHome } = inferLinkedTeamPerspective(linkedLabel, fixture.homeTeam, fixture.awayTeam)

      if (isHome === null) continue // can't determine side — skip

      const ownScore = isHome ? (fixture.resultHome ?? 0) : (fixture.resultAway ?? 0)
      const oppScore = isHome ? (fixture.resultAway ?? 0) : (fixture.resultHome ?? 0)

      goalsFor += ownScore
      goalsAgainst += oppScore

      let result: 'W' | 'D' | 'L'
      if (ownScore > oppScore) {
        wins++
        result = 'W'
      } else if (ownScore === oppScore) {
        draws++
        result = 'D'
      } else {
        losses++
        result = 'L'
      }

      if (recentForm.length < 5) {
        recentForm.push(result)
      }
    }

    const played = wins + draws + losses
    const winRate = played > 0 ? Math.round((wins / played) * 1000) / 10 : 0

    return {
      played,
      wins,
      draws,
      losses,
      winRate,
      goalDifference: goalsFor - goalsAgainst,
      recentForm,
    }
  }

  private async assertClubManager(clubId: string, userId: string) {
    const membership = await this.getMembership(userId, clubId)

    if (!isClubManager(membership.role)) {
      throw new TeamAccessDeniedError('You do not manage this club.')
    }

    return membership
  }

  private async assertClubAdministrator(clubId: string, userId: string) {
    const membership = await this.getMembership(userId, clubId)
    if (membership.role !== MembershipRole.OWNER && membership.role !== MembershipRole.ADMIN) {
      throw new TeamAccessDeniedError(
        'Only the club owner or an administrator can change club teams.',
      )
    }
    return membership
  }

  private requireEntitlements() {
    if (!this.clubEntitlements) {
      throw new ServiceUnavailableException('Club quota enforcement is unavailable')
    }
    return this.clubEntitlements
  }

  private async getMembership(userId: string, clubId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_clubId: { userId, clubId },
      },
    })

    if (!membership) {
      throw new TeamAccessDeniedError('You are not a member of this club.')
    }

    return membership
  }

  private async assertCoachAssignmentsAreValid(
    clubId: string,
    input: UpdateTeamCoachAssignmentsInput,
  ) {
    const coachUserIds = [
      ...(input.headCoachUserId ? [input.headCoachUserId] : []),
      ...input.assistantCoachUserIds,
    ]

    if (coachUserIds.length === 0) {
      return
    }

    const memberships = await this.prisma.membership.findMany({
      where: {
        clubId,
        userId: {
          in: coachUserIds,
        },
      },
      select: {
        userId: true,
        role: true,
      },
    })

    if (memberships.length !== coachUserIds.length) {
      throw new BadRequestException('Assigned coaches must already be members of this club')
    }

    const invalidMembership = memberships.find((membership: any) => !isClubManager(membership.role))

    if (invalidMembership) {
      throw new BadRequestException('Assigned coaches must already be part of the club staff')
    }
  }

  private async syncCoachAssignments(
    clubId: string,
    teamId: string,
    input: UpdateTeamCoachAssignmentsInput,
  ) {
    const assignments = normalizeCoachAssignments(input)
    const coachUserIds = [
      ...(assignments.headCoachUserId ? [assignments.headCoachUserId] : []),
      ...assignments.assistantCoachUserIds,
    ]
      .filter((userId, index, values) => values.indexOf(userId) === index)
      .sort()

    await this.prisma.$transaction(async (tx) => {
      // Serialize against account deletion for every user that will receive
      // access. Revalidate membership only after the lifecycle locks are held.
      for (const coachUserId of coachUserIds) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${coachUserId}))`
      }

      if (coachUserIds.length > 0) {
        const memberships = await tx.membership.findMany({
          where: {
            clubId,
            userId: { in: coachUserIds },
            user: { deletedAt: null },
          },
          select: { userId: true, role: true },
        })
        if (
          memberships.length !== coachUserIds.length ||
          memberships.some((membership) => !isClubManager(membership.role))
        ) {
          throw new BadRequestException('Assigned coaches must be active members of the club staff')
        }
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coach-assignments:${teamId}`}))`

      if (assignments.headCoachUserId) {
        await tx.teamAccess.updateMany({
          where: {
            teamId,
            role: TeamRole.HEAD_COACH,
            status: {
              in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
            },
            NOT: {
              userId: assignments.headCoachUserId,
            },
          },
          data: {
            status: TeamAccessStatus.REVOKED,
          },
        })

        await tx.teamAccess.upsert({
          where: {
            teamId_userId_role: {
              teamId,
              userId: assignments.headCoachUserId,
              role: TeamRole.HEAD_COACH,
            },
          },
          update: {
            phase: TeamAccessPhase.FULL,
            status: TeamAccessStatus.ACTIVE,
          },
          create: {
            clubId,
            teamId,
            userId: assignments.headCoachUserId,
            role: TeamRole.HEAD_COACH,
            phase: TeamAccessPhase.FULL,
            status: TeamAccessStatus.ACTIVE,
          },
        })
      } else {
        await tx.teamAccess.updateMany({
          where: {
            teamId,
            role: TeamRole.HEAD_COACH,
            status: {
              in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
            },
          },
          data: {
            status: TeamAccessStatus.REVOKED,
          },
        })
      }

      if (assignments.assistantCoachUserIds.length > 0) {
        await tx.teamAccess.updateMany({
          where: {
            teamId,
            role: TeamRole.ASSISTANT_COACH,
            status: {
              in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
            },
            userId: {
              notIn: assignments.assistantCoachUserIds,
            },
          },
          data: {
            status: TeamAccessStatus.REVOKED,
          },
        })
      } else {
        await tx.teamAccess.updateMany({
          where: {
            teamId,
            role: TeamRole.ASSISTANT_COACH,
            status: {
              in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
            },
          },
          data: {
            status: TeamAccessStatus.REVOKED,
          },
        })
      }

      if (assignments.headCoachUserId) {
        await tx.teamAccess.updateMany({
          where: {
            teamId,
            role: TeamRole.ASSISTANT_COACH,
            userId: assignments.headCoachUserId,
            status: {
              in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
            },
          },
          data: {
            status: TeamAccessStatus.REVOKED,
          },
        })
      }

      for (const assistantCoachUserId of assignments.assistantCoachUserIds) {
        await tx.teamAccess.upsert({
          where: {
            teamId_userId_role: {
              teamId,
              userId: assistantCoachUserId,
              role: TeamRole.ASSISTANT_COACH,
            },
          },
          update: {
            phase: TeamAccessPhase.FULL,
            status: TeamAccessStatus.ACTIVE,
          },
          create: {
            clubId,
            teamId,
            userId: assistantCoachUserId,
            role: TeamRole.ASSISTANT_COACH,
            phase: TeamAccessPhase.FULL,
            status: TeamAccessStatus.ACTIVE,
          },
        })
      }
    })
  }

  private async getTeamCoachAssignments(teamId: string) {
    const access = await this.prisma.teamAccess.findMany({
      where: {
        teamId,
        ...activeTeamAccessWhere(),
        role: {
          in: [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH],
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    })

    const headCoach = access.find((entry: any) => entry.role === TeamRole.HEAD_COACH) || null

    return {
      teamId,
      coachAssignments: {
        headCoach: headCoach
          ? {
              userId: headCoach.user.id,
              name: headCoach.user.name,
              avatarUrl: headCoach.user.avatarUrl,
            }
          : null,
        assistants: access
          .filter((entry: any) => entry.role === TeamRole.ASSISTANT_COACH)
          .map((entry: any) => ({
            userId: entry.user.id,
            name: entry.user.name,
            avatarUrl: entry.user.avatarUrl,
          })),
      },
    }
  }

  private async assertRosterMemberExists(clubId: string, teamId: string, targetUserId: string) {
    const teamAccess = await this.prisma.teamAccess.findFirst({
      where: {
        clubId,
        teamId,
        userId: targetUserId,
        status: {
          in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
        },
      },
    })

    if (!teamAccess) {
      throw new BadRequestException('Roster member was not found in this team.')
    }

    return teamAccess
  }

  private async getTeamContext(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        group: true,
      },
    })

    if (!team) {
      throw new NotFoundException('Team not found')
    }

    const [membership, teamAccess] = await Promise.all([
      this.prisma.membership.findUnique({
        where: {
          userId_clubId: {
            userId,
            clubId: team.clubId,
          },
        },
      }),
      this.prisma.teamAccess.findMany({
        where: {
          teamId,
          userId,
          ...activeTeamAccessWhere(),
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
    ])

    return {
      team,
      membership,
      activeTeamAccess: teamAccess,
    }
  }

  private async assertLoanManageAccess(userId: string, clubId: string, sourceTeamId: string) {
    const access = await this.getTeamContext(userId, sourceTeamId)
    if (access.team.clubId !== clubId) {
      throw new TeamAccessDeniedError('You do not manage loans for this team.')
    }

    if (
      access.membership?.role === MembershipRole.OWNER ||
      access.membership?.role === MembershipRole.ADMIN ||
      access.activeTeamAccess.some((entry: any) => isCoachRole(entry.role))
    ) {
      return access
    }

    throw new TeamAccessDeniedError('You do not manage loans for this team.')
  }
}

function isClubManager(role: string) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'COACH'
}

function compareRosterEntries(
  left: {
    role: string
    phase: string
    name: string
  },
  right: {
    role: string
    phase: string
    name: string
  },
) {
  const roleDelta = getRosterRoleSortOrder(left.role) - getRosterRoleSortOrder(right.role)

  if (roleDelta !== 0) {
    return roleDelta
  }

  const phaseDelta = getRosterPhaseSortOrder(left.phase) - getRosterPhaseSortOrder(right.phase)

  if (phaseDelta !== 0) {
    return phaseDelta
  }

  return left.name.localeCompare(right.name, 'de')
}

function getRosterRoleSortOrder(role: string) {
  switch (role) {
    case TeamRole.HEAD_COACH:
      return 0
    case TeamRole.ASSISTANT_COACH:
      return 1
    case TeamRole.PLAYER:
      return 2
    case TeamRole.PARENT:
      return 3
    default:
      return 99
  }
}

function getRosterPhaseSortOrder(phase: string) {
  return phase === TeamAccessPhase.FULL ? 0 : 1
}

function isCoachRole(role: string) {
  return role === 'HEAD_COACH' || role === 'ASSISTANT_COACH'
}

function buildTeamDisplayName(
  groupDisplayName: string,
  squadLabel: string | null,
  fallbackName: string,
) {
  if (squadLabel) {
    return `${groupDisplayName} ${squadLabel}`.trim()
  }

  return fallbackName.trim()
}

function normalizeCoachAssignments(input: UpdateTeamCoachAssignmentsInput) {
  const headCoachUserId = input.headCoachUserId?.trim() || null
  const assistantCoachUserIds = Array.from(
    new Set(input.assistantCoachUserIds.map((userId) => userId.trim()).filter(Boolean)),
  )

  if (headCoachUserId) {
    return {
      headCoachUserId,
      assistantCoachUserIds: assistantCoachUserIds.filter((userId) => userId !== headCoachUserId),
    }
  }

  return {
    headCoachUserId: null,
    assistantCoachUserIds,
  }
}

function serializeInjuryReport(report: any) {
  return {
    id: report.id,
    clubId: report.clubId,
    teamId: report.teamId,
    userId: report.userId,
    reportedById: report.reportedById,
    title: report.title,
    notes: report.notes ?? null,
    status: report.status,
    expectedReturnAt: report.expectedReturnAt ? report.expectedReturnAt.toISOString() : null,
    expectedReturnLabel: report.expectedReturnLabel ?? null,
    clearedAt: report.clearedAt ? report.clearedAt.toISOString() : null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    user: report.user
      ? {
          id: report.user.id,
          name: report.user.name,
          avatarUrl: report.user.avatarUrl,
        }
      : undefined,
  }
}

function serializeDutyAssignment(assignment: any) {
  return {
    id: assignment.id,
    clubId: assignment.clubId,
    teamId: assignment.teamId,
    assignedUserId: assignment.assignedUserId,
    createdById: assignment.createdById,
    kind: assignment.kind,
    status: assignment.status,
    dueDate: assignment.dueDate ? assignment.dueDate.toISOString() : null,
    notes: assignment.notes ?? null,
    completedAt: assignment.completedAt ? assignment.completedAt.toISOString() : null,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
    assignedUser: assignment.assignedUser
      ? {
          id: assignment.assignedUser.id,
          name: assignment.assignedUser.name,
          avatarUrl: assignment.assignedUser.avatarUrl,
        }
      : undefined,
  }
}

/** Privacy (H3): under the GDPR Art. 8 consent age (16) on today's date. */
function isUnderConsentAge(dateOfBirth: Date, today = new Date()): boolean {
  let age = today.getFullYear() - dateOfBirth.getFullYear()
  const m = today.getMonth() - dateOfBirth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dateOfBirth.getDate())) age--
  return age < 16
}
