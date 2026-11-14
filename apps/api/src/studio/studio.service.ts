import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
  studioBrandKitSchema,
  studioContextQuerySchema,
  studioSponsorSchema,
  updateStudioBrandKitSchema,
  type StudioBrandKit,
  type StudioContext,
  type StudioContextQuery,
  type UpdateStudioBrandKitInput,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'
import { ClubEntitlementsService } from '../billing/club-entitlements.service'
import { activeTeamAccessWhere } from '../teams/active-team-access'

type Db = PrismaService | Prisma.TransactionClient
type Scope = { clubWide: boolean; teamIds: string[] }
const CLUB_OFFICES = new Set(['BOARD_MEMBER', 'MEDIA_MANAGER'])
const TEAM_OFFICES = new Set(['TEAM_COORDINATOR', 'CAPTAIN'])
const SPONSOR_REFS = studioSponsorSchema.pick({ id: true, name: true }).array().max(8)
const DAY_MS = 24 * 60 * 60 * 1000

export class StudioAccessDeniedException extends ForbiddenException {
  constructor() {
    super('Studio access is not available for this account and club')
  }
}
export class StudioPlanRequiredException extends ForbiddenException {
  constructor() {
    super('Studio requires an active Verein plan')
  }
}
export class StudioSelectionNotFoundException extends NotFoundException {
  constructor() {
    super('The selected team or match is not available')
  }
}

@Injectable()
export class StudioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: ClubEntitlementsService,
  ) {}

  private async scope(db: Db, clubId: string, userId: string): Promise<Scope> {
    const membership = await db.membership.findFirst({
      where: { clubId, userId, user: { deletedAt: null } },
      select: { role: true, operationalRoles: true },
    })
    if (!membership) throw new StudioAccessDeniedException()
    const offices = membership.operationalRoles ?? []
    const clubWide =
      membership.role === 'OWNER' ||
      membership.role === 'ADMIN' ||
      offices.some((role) => CLUB_OFFICES.has(role))
    if (!clubWide && !offices.some((role) => TEAM_OFFICES.has(role)))
      throw new StudioAccessDeniedException()
    const now = new Date()
    const access = clubWide
      ? []
      : await db.teamAccess.findMany({
          where: {
            clubId,
            userId,
            phase: 'FULL',
            role: { in: ['PLAYER', 'HEAD_COACH', 'ASSISTANT_COACH'] },
            ...activeTeamAccessWhere(now),
            AND: [{ OR: [{ loanStartDate: null }, { loanStartDate: { lte: now } }] }],
            team: { clubId },
          },
          select: { teamId: true },
          distinct: ['teamId'],
        })
    if (!clubWide && !access.length) throw new StudioAccessDeniedException()
    const { tier } = await this.plans.resolve(clubId, db)
    if (tier !== 'PRO' && tier !== 'SCALE') throw new StudioPlanRequiredException()
    return { clubWide, teamIds: access.map((row) => row.teamId) }
  }

  async context(clubId: string, userId: string, raw: StudioContextQuery): Promise<StudioContext> {
    const query = studioContextQuerySchema.parse(raw)
    return tenantContext.run({ clubId, userId }, async () => {
      const scope = await this.scope(this.prisma, clubId, userId)
      if (query.teamId) {
        if (!scope.clubWide && !scope.teamIds.includes(query.teamId))
          throw new StudioSelectionNotFoundException()
        const team = await this.prisma.team.findFirst({
          where: { id: query.teamId, clubId },
          select: { id: true },
        })
        if (!team) throw new StudioSelectionNotFoundException()
      }
      const where: Prisma.EventWhereInput = {
        clubId,
        type: 'MATCH',
        archivedAt: null,
        ...(query.teamId
          ? { teamId: query.teamId }
          : scope.clubWide
            ? {}
            : { teamId: { in: scope.teamIds } }),
      }
      let event: { id: string } | null
      if (query.eventId) {
        event = await this.prisma.event.findFirst({
          where: { ...where, id: query.eventId },
          select: { id: true },
        })
        if (!event) throw new StudioSelectionNotFoundException()
      } else {
        const now = new Date()
        const since = new Date(now.getTime() - DAY_MS)
        const eligible = { ...where, cancelledAt: null }
        event = await this.prisma.event.findFirst({
          where: {
            ...eligible,
            date: { gte: since, lte: now },
            matchLive: { is: { status: { in: ['FIRST_HALF', 'HALF_TIME', 'SECOND_HALF'] } } },
          },
          select: { id: true },
          orderBy: [{ date: 'desc' }, { id: 'asc' }],
        })
        event ??= await this.prisma.event.findFirst({
          where: {
            ...eligible,
            matchLive: { is: { status: 'FINISHED', finishedAt: { gte: since, lte: now } } },
          },
          select: { id: true },
          orderBy: [{ matchLive: { finishedAt: 'desc' } }, { id: 'asc' }],
        })
        event ??= await this.prisma.event.findFirst({
          where: {
            ...eligible,
            date: { gte: now },
            OR: [{ matchLive: { is: null } }, { matchLive: { is: { status: 'NOT_STARTED' } } }],
          },
          select: { id: true },
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
        })
      }
      // ParentalConsent authorizes app access, NOT public names/photos. There is
      // no publication-consent record yet. Never derive permission from a roster,
      // avatar or generic parental approval. The graphic builder hides identities.
      return { eventId: event?.id ?? null, consents: [] }
    })
  }

  async brandKit(clubId: string, userId: string): Promise<StudioBrandKit> {
    return tenantContext.run({ clubId, userId }, async () => {
      await this.scope(this.prisma, clubId, userId)
      return this.readBrandKit(this.prisma, clubId)
    })
  }

  async updateBrandKit(
    clubId: string,
    userId: string,
    raw: UpdateStudioBrandKitInput,
  ): Promise<StudioBrandKit> {
    const input = updateStudioBrandKitSchema.parse(raw)
    return tenantContext.run({ clubId, userId }, () =>
      this.prisma.$transaction(async (tx) => {
        const scope = await this.scope(tx, clubId, userId)
        // Captains/team managers can prepare graphics, not change the whole club's identity.
        if (!scope.clubWide) throw new StudioAccessDeniedException()
        if (input.sponsors) {
          const ids = input.sponsors.map((sponsor) => sponsor.id)
          if (new Set(ids).size !== ids.length)
            throw new BadRequestException('Duplicate sponsor selection')
          const owned = await tx.sponsor.findMany({
            where: { clubId, id: { in: ids } },
            select: { id: true },
          })
          if (owned.length !== ids.length)
            throw new BadRequestException('Sponsor selection is not available')
        }
        await tx.studioBrandKit.upsert({
          where: { clubId },
          create: { clubId, ...input },
          // Apply only provided fields: simultaneous font/handle edits do not overwrite each other.
          update: input,
        })
        return this.readBrandKit(tx, clubId)
      }),
    )
  }

  private async readBrandKit(db: Db, clubId: string): Promise<StudioBrandKit> {
    const [club, kit, sponsors] = await Promise.all([
      db.club.findUnique({ where: { id: clubId }, select: { badgeUrl: true, primaryColor: true } }),
      db.studioBrandKit.findUnique({ where: { clubId } }),
      db.sponsor.findMany({
        where: { clubId },
        select: { id: true, name: true, logoUrl: true },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      }),
    ])
    if (!club) throw new StudioSelectionNotFoundException()
    const refs = kit?.sponsors == null ? null : SPONSOR_REFS.parse(kit.sponsors)
    const selected =
      refs == null
        ? sponsors.slice(0, 8)
        : refs.flatMap((ref) => {
            const sponsor = sponsors.find((row) => row.id === ref.id)
            return sponsor ? [{ ...sponsor, name: ref.name }] : []
          })
    return studioBrandKitSchema.parse({
      clubId,
      crestUrl: club.badgeUrl,
      sponsors: selected.map((sponsor) => ({ ...sponsor, name: sponsor.name.slice(0, 60) })),
      colors: { primary: club.primaryColor, accent: '#D4F25C', dark: '#121A15', light: '#F1EEE4' },
      fontPairing: kit?.fontPairing ?? 'CONDENSED',
      handle: kit?.handle ?? null,
      hashtags: kit?.hashtags ?? [],
      accounts: [
        { channel: 'INSTAGRAM', connected: false, handle: null },
        { channel: 'FACEBOOK', connected: false, handle: null },
      ],
      templateSetAt: null,
    })
  }
}
