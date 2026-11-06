import { Injectable, NotFoundException } from '@nestjs/common'
import { ClubClaimStatus, TeamGroupType, TeamRole } from '@prisma/client'
import {
  REQUIRED_CLUB_OFFICES,
  complianceStatus,
  type AdminInbox,
  type AdminInboxJoinRequest,
  type AdminInboxOffice,
  type AdminInboxOverdueDue,
  type AdminInboxSafeguardingItem,
  type AdminInboxSection,
  type AdminInboxStaffRequest,
  type AdminInboxTeamWithoutCoach,
  type AdminMemberSummary,
  type ComplianceRecordStatus,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { ContributionsService } from '../contributions/contributions.service'
import { ClubActivationService } from '../club-activation/club-activation.service'
import { activeTeamAccessWhere } from '../teams/active-team-access'
import { COMPLIANCE_FEATURE_ENABLED } from './compliance-release'

const TOP_ITEMS = 3
const YOUTH_GROUP_TYPES = [TeamGroupType.YOUTH, TeamGroupType.MINI]
const COACH_ROLES = [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH]
const OPEN_CLAIM_STATUSES: string[] = [ClubClaimStatus.SUBMITTED, ClubClaimStatus.NEEDS_INFO]

function emptySection<T>(): AdminInboxSection<T> {
  return { count: 0, items: [] }
}

function settledOr<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback
}

export function isUnder18(dateOfBirth: Date | null | undefined, now = new Date()): boolean {
  if (!dateOfBirth) return false
  const eighteenth = new Date(dateOfBirth)
  eighteenth.setFullYear(eighteenth.getFullYear() + 18)
  return eighteenth.getTime() > now.getTime()
}

const SAFEGUARDING_ORDER: Record<Exclude<ComplianceRecordStatus, 'VALID'>, number> = {
  EXPIRED: 0,
  MISSING: 1,
  EXPIRING: 2,
}

@Injectable()
export class AdminInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contributions: ContributionsService,
    private readonly activation: ClubActivationService,
  ) {}

  async getInbox(clubId: string, userId: string): Promise<AdminInbox> {
    const now = new Date()
    const [members, teams, joinRequests, staff, dues, noCoach, safeguarding, offices] =
      await Promise.allSettled([
        this.prisma.membership.count({ where: { clubId } }),
        this.prisma.team.count({ where: { clubId } }),
        this.joinRequests(clubId),
        this.staffRequests(clubId),
        this.overdueDues(clubId, userId),
        this.teamsWithoutHeadCoach(clubId, now),
        COMPLIANCE_FEATURE_ENABLED
          ? this.safeguarding(clubId, now)
          : Promise.resolve(emptySection<AdminInboxSafeguardingItem>()),
        this.unfilledOffices(clubId),
      ])

    const inbox: AdminInbox = {
      generatedAt: now.toISOString(),
      totalOpen: 0,
      memberCount: settledOr(members, 0),
      teamCount: settledOr(teams, 0),
      joinRequests: settledOr(joinRequests, emptySection<AdminInboxJoinRequest>()),
      staffAccessRequests: settledOr(staff, emptySection<AdminInboxStaffRequest>()),
      overdueDues: settledOr(dues, {
        ...emptySection<AdminInboxOverdueDue>(),
        amount: 0,
        currency: 'eur',
      }),
      teamsWithoutHeadCoach: settledOr(noCoach, emptySection<AdminInboxTeamWithoutCoach>()),
      safeguarding: settledOr(safeguarding, emptySection<AdminInboxSafeguardingItem>()),
      unfilledOffices: settledOr(offices, emptySection<AdminInboxOffice>()),
    }
    inbox.totalOpen =
      inbox.joinRequests.count +
      inbox.staffAccessRequests.count +
      inbox.overdueDues.count +
      inbox.teamsWithoutHeadCoach.count +
      inbox.safeguarding.count +
      inbox.unfilledOffices.count
    return inbox
  }

  private async joinRequests(clubId: string): Promise<AdminInboxSection<AdminInboxJoinRequest>> {
    const [count, rows] = await Promise.all([
      this.prisma.joinRequest.count({ where: { clubId, status: 'PENDING' } }),
      this.prisma.joinRequest.findMany({
        where: { clubId, status: 'PENDING' },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        take: TOP_ITEMS,
      }),
    ])
    return {
      count,
      items: rows.map((row: any) => ({
        id: row.id,
        teamId: row.teamId ?? null,
        revision: row.revision,
        role: row.role,
        message: row.message ?? null,
        createdAt: row.createdAt.toISOString(),
        user: {
          id: row.user.id,
          name: row.user.name,
          avatarUrl: row.user.avatarUrl ?? null,
        },
      })),
    }
  }

  private async staffRequests(clubId: string): Promise<AdminInboxSection<AdminInboxStaffRequest>> {
    const claims = (await this.activation.listClubRequests(clubId)) as any[]
    const open = claims.filter((claim) => OPEN_CLAIM_STATUSES.includes(claim.status))
    return {
      count: open.length,
      items: open.slice(0, TOP_ITEMS).map((claim) => ({
        id: claim.id,
        desiredRole: claim.desiredRole,
        createdAt: new Date(claim.createdAt).toISOString(),
        claimant: {
          id: claim.claimant?.id ?? claim.claimantUserId,
          name: claim.claimant?.name ?? '',
          avatarUrl: claim.claimant?.avatarUrl ?? null,
        },
      })),
    }
  }

  /** Read-only (M2): no contribution records or settings are written on load. */
  private async overdueDues(
    clubId: string,
    userId: string,
  ): Promise<AdminInbox['overdueDues']> {
    const summary = await this.contributions.getOverdueSummary(clubId, userId)
    const items = summary.members.map((member) => ({
      memberUserId: member.memberUserId,
      name: member.name,
      amount: member.outstanding,
      dueDate: member.dueDate,
    }))
    return {
      count: items.length,
      items: items.slice(0, TOP_ITEMS),
      amount: items.reduce((sum, item) => sum + item.amount, 0),
      currency: summary.currency,
    }
  }

  private async teamsWithoutHeadCoach(
    clubId: string,
    now: Date,
  ): Promise<AdminInboxSection<AdminInboxTeamWithoutCoach>> {
    const teams = await this.prisma.team.findMany({
      where: {
        clubId,
        access: { none: { role: TeamRole.HEAD_COACH, ...activeTeamAccessWhere(now) } },
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        group: { select: { displayName: true, sortOrder: true } },
      },
      orderBy: [{ group: { sortOrder: 'asc' } }, { displayName: 'asc' }],
    })
    return {
      count: teams.length,
      items: teams.slice(0, TOP_ITEMS).map((team: any) => ({
        teamId: team.id,
        teamName: team.displayName || team.name,
        groupName: team.group?.displayName ?? null,
      })),
    }
  }

  /** Coaches/assistants of YOUTH or MINI teams, keyed by user. */
  private async youthStaff(clubId: string, now: Date) {
    const access = await this.prisma.teamAccess.findMany({
      where: {
        clubId,
        role: { in: COACH_ROLES },
        team: { group: { type: { in: YOUTH_GROUP_TYPES } } },
        ...activeTeamAccessWhere(now),
      },
      select: {
        userId: true,
        user: { select: { name: true } },
        team: { select: { name: true, displayName: true } },
      },
    })
    const byUser = new Map<string, { name: string; teamNames: string[] }>()
    for (const row of access as any[]) {
      const entry = byUser.get(row.userId) ?? { name: row.user?.name ?? '', teamNames: [] as string[] }
      const teamName = row.team?.displayName || row.team?.name
      if (teamName && !entry.teamNames.includes(teamName)) entry.teamNames.push(teamName)
      byUser.set(row.userId, entry)
    }
    return byUser
  }

  private async safeguarding(
    clubId: string,
    now: Date,
  ): Promise<AdminInboxSection<AdminInboxSafeguardingItem>> {
    const staff = await this.youthStaff(clubId, now)
    if (staff.size === 0) return emptySection()
    const records = await this.prisma.complianceRecord.findMany({
      where: { clubId, kind: 'FUEHRUNGSZEUGNIS', memberUserId: { in: [...staff.keys()] } },
      select: { id: true, memberUserId: true, expiresAt: true },
    })
    const recordByUser = new Map(records.map((record: any) => [record.memberUserId, record]))

    const items: AdminInboxSafeguardingItem[] = []
    for (const [memberUserId, entry] of staff) {
      const record: any = recordByUser.get(memberUserId)
      const status: ComplianceRecordStatus = record
        ? complianceStatus(record.expiresAt, now)
        : 'MISSING'
      if (status === 'VALID') continue
      items.push({
        memberUserId,
        name: entry.name,
        teamNames: entry.teamNames,
        status,
        expiresAt: record?.expiresAt ? record.expiresAt.toISOString() : null,
        recordId: record?.id ?? null,
      })
    }
    items.sort(
      (a, b) =>
        SAFEGUARDING_ORDER[a.status] - SAFEGUARDING_ORDER[b.status] ||
        (a.expiresAt ?? '').localeCompare(b.expiresAt ?? '') ||
        a.name.localeCompare(b.name),
    )
    return { count: items.length, items: items.slice(0, TOP_ITEMS) }
  }

  private async unfilledOffices(clubId: string): Promise<AdminInboxSection<AdminInboxOffice>> {
    const holders = await this.prisma.membership.findMany({
      where: { clubId, operationalRoles: { hasSome: [...REQUIRED_CLUB_OFFICES] } },
      select: { operationalRoles: true },
    })
    const filled = new Set<string>(holders.flatMap((holder: any) => holder.operationalRoles))
    const items = REQUIRED_CLUB_OFFICES.filter((office) => !filled.has(office)).map((office) => ({
      office,
    }))
    return { count: items.length, items }
  }

  // ── Member sheet ────────────────────────────────────────────────────────

  async getMemberSummary(
    clubId: string,
    actorUserId: string,
    memberUserId: string,
  ): Promise<AdminMemberSummary> {
    const now = new Date()
    const membership = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId: memberUserId, clubId } },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true, dateOfBirth: true },
        },
      },
    })
    if (!membership) throw new NotFoundException('Member not found in this club')

    const [access, records, parentalConsent, contribution] = await Promise.all([
      this.prisma.teamAccess.findMany({
        where: { clubId, userId: memberUserId, ...activeTeamAccessWhere(now) },
        select: {
          teamId: true,
          role: true,
          team: {
            select: { name: true, displayName: true, group: { select: { type: true } } },
          },
        },
      }),
      COMPLIANCE_FEATURE_ENABLED
        ? this.prisma.complianceRecord.findMany({
            where: {
              clubId,
              memberUserId,
              kind: { in: ['FUEHRUNGSZEUGNIS', 'SEPA_MANDATE', 'DATA_CONSENT'] },
            },
            select: { id: true, kind: true, issuedAt: true, expiresAt: true },
          })
        : Promise.resolve([]),
      this.prisma.parentalConsent.findFirst({
        where: { clubId, playerUserId: memberUserId, status: 'APPROVED' },
        select: { approvedAt: true },
        orderBy: { approvedAt: 'desc' },
      }),
      // Read-only single-member lookup (M2); null when the actor can't see billing.
      this.contributions
        .getMemberContributionStatus(clubId, actorUserId, memberUserId)
        .catch(() => null),
    ])

    const accessRows = access as any[]
    const isYouthTeam = (row: any) =>
      (YOUTH_GROUP_TYPES as string[]).includes(row.team?.group?.type)
    const isYouth =
      isUnder18(membership.user.dateOfBirth, now) ||
      accessRows.some((row) => row.role === TeamRole.PLAYER && isYouthTeam(row))
    const isYouthStaff = accessRows.some(
      (row) => (COACH_ROLES as string[]).includes(row.role) && isYouthTeam(row),
    )

    const recordOf = (kind: string) => (records as any[]).find((record) => record.kind === kind)
    const fz = recordOf('FUEHRUNGSZEUGNIS')
    const sepa = recordOf('SEPA_MANDATE')
    const consent = recordOf('DATA_CONSENT')

    return {
      userId: membership.user.id,
      name: membership.user.name,
      email: membership.user.email ?? null,
      avatarUrl: membership.user.avatarUrl ?? null,
      role: membership.role as AdminMemberSummary['role'],
      operationalRoles: (membership.operationalRoles ?? []) as string[],
      isYouth,
      teams: accessRows.map((entry) => ({
        teamId: entry.teamId,
        teamName: entry.team?.displayName || entry.team?.name || '',
        role: entry.role,
      })),
      contribution: contribution
        ? {
            status: contribution.status,
            amount: contribution.amount,
            currency: contribution.currency,
            dueDate: contribution.dueDate,
            planName: contribution.planName,
          }
        : null,
      sepaMandate: sepa ? { issuedAt: sepa.issuedAt ? sepa.issuedAt.toISOString() : null } : null,
      dataConsent: consent
        ? {
            issuedAt: consent.issuedAt ? consent.issuedAt.toISOString() : null,
            source: 'RECORD',
          }
        : parentalConsent
          ? {
              issuedAt: parentalConsent.approvedAt
                ? parentalConsent.approvedAt.toISOString()
                : null,
              source: 'PARENTAL_CONSENT',
            }
          : null,
      safeguarding: COMPLIANCE_FEATURE_ENABLED && isYouthStaff
        ? {
            status: fz ? complianceStatus(fz.expiresAt, now) : 'MISSING',
            expiresAt: fz?.expiresAt ? fz.expiresAt.toISOString() : null,
            recordId: fz?.id ?? null,
          }
        : null,
    }
  }
}
