import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import { Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type {
  ChatMediaItem,
  ChatMediaTab,
  Channel as SharedChannel,
  ChannelKind,
  ChannelVisibility,
  ChatChannelDetail,
  ChatChannelMember,
  MessageType,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { TeamsService } from '../teams/teams.service'
import { activeLaunchTeamAccessWhere as activeTeamAccessWhere } from '../teams/active-team-access'
import { LAUNCH_FEATURES } from '@anstoss/shared'
import { isYouthTeam } from './youth-team'
import { evaluateGroupSafeguarding, isKnownAdult } from './group-safeguarding'
import { CHAT_MEDIA_PAGE, chatMediaWhere, toChatMediaItems } from './chat-media'
import { assertLaunchParticipant, launchClubParticipantWhere } from '../auth/launch-access-policy'
import { resolveTrialSessionScope } from '../marketplace/trial-access'

type AccessCtx = {
  membership?: { role: string } | null
  activeTeamAccess: Array<{ role: string; phase?: string | null }>
  teamScoped?: boolean
}

/** Raw last-message fields the inbox localizes client-side. */
export type ChannelLastMessageRaw = {
  senderId: string | null
  senderName: string | null
  content: string
  type: MessageType
  createdAt: string
}

/** A readable channel decorated with the caller's unread/mute state. */
export type DecoratedChannel = SharedChannel & {
  teamName: string | null
  muted: boolean
  mutedUntil: string | null
  lastMessageRaw: ChannelLastMessageRaw | null
}

export type ChannelAccessResult = {
  channel: {
    id: string
    clubId: string
    teamId: string | null
    slug: string
    kind: ChannelKind
    name: string
    description: string | null
    visibility: ChannelVisibility
    createdAt: Date
    updatedAt: Date
  }
  canRead: boolean
  canWrite: boolean
  /** Role context used for the decision (team-scoped for team channels). */
  access: AccessCtx
  /** Manager of the channel's team or a club manager. */
  isManager: boolean
}

export type AuthorizedPrivateChannelTarget = {
  userId: string
  clubId: string
  teamId: string
  targetType: 'CHANNEL'
  targetId: string
}

/** A mute is active while muted is set and mutedUntil (if any) is ahead. */
export function isMuteActive(
  row: { muted: boolean; mutedUntil: Date | null } | null | undefined,
  now = new Date(),
): boolean {
  if (!row?.muted) return false
  return !row.mutedUntil || row.mutedUntil.getTime() > now.getTime()
}

type ChannelSeed = {
  slug: string
  kind: ChannelKind
  name: string
  visibility: ChannelVisibility
}

const TEAM_CHANNEL_SEEDS: ChannelSeed[] = [
  { slug: 'team', kind: 'TEAM', name: 'Team', visibility: 'MEMBERS' },
  { slug: 'announcements', kind: 'ANNOUNCEMENTS', name: 'Announcements', visibility: 'MEMBERS' },
  { slug: 'coaches', kind: 'COACHES', name: 'Coaches', visibility: 'COACHES_ONLY' },
  { slug: 'parents', kind: 'PARENTS', name: 'Parents', visibility: 'PARENTS_ONLY' },
]

const CLUB_CHANNEL_SEEDS: ChannelSeed[] = [
  { slug: 'news', kind: 'CLUB_NEWS', name: 'Club news', visibility: 'MEMBERS' },
  { slug: 'announcements', kind: 'ANNOUNCEMENTS', name: 'Announcements', visibility: 'MEMBERS' },
  { slug: 'staff', kind: 'COACHES', name: 'Staff room', visibility: 'COACHES_ONLY' },
]

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private readonly logger = new Logger(ChannelsService.name)
  /**
   * Chat revamp (H4): provisioning runs once per process per team/club. The
   * inbox used to seed 4 upserts + 3 find/updates per team on every read.
   * teamId → youth flag it was provisioned with (PARENTS depends on it).
   */
  private readonly provisionedTeams = new Map<string, boolean>()
  private readonly provisionedClubs = new Set<string>()

  /** Channels are provisioned when a team is created (TeamsService emits). */
  @OnEvent('team.created')
  async onTeamCreated(payload: { clubId: string; teamId: string; ageGroup?: string | null }) {
    try {
      await this.ensureTeamChannels(payload.clubId, payload.teamId, payload.ageGroup ?? null)
      await this.ensureClubChannels(payload.clubId)
    } catch (error) {
      this.logger.warn(`channel provisioning failed for team ${payload.teamId}: ${String(error)}`)
    }
  }

  /**
   * Idempotent provisioning. Safe to call from team / club bootstrap or on
   * first access. Reads the existing seed rows once and only writes the
   * missing or drifted ones (kind/visibility corrections still propagate).
   */
  async ensureTeamChannels(
    clubId: string,
    teamId: string,
    ageGroup?: string | null,
  ): Promise<void> {
    // Parents channels only make sense for youth teams. Existing adult-team
    // PARENTS rows are left untouched (history is kept) but none are created.
    const cached = this.provisionedTeams.get(teamId)
    if (ageGroup === undefined && cached !== undefined) return
    let resolvedAgeGroup = ageGroup
    if (resolvedAgeGroup === undefined) {
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
        select: { ageGroup: true },
      })
      resolvedAgeGroup = team?.ageGroup ?? null
    }
    const youth = isYouthTeam(resolvedAgeGroup)
    if (cached === youth) return

    const seeds = TEAM_CHANNEL_SEEDS.filter((seed) => seed.kind !== 'PARENTS' || (youth && LAUNCH_FEATURES.youthParticipation))
    const existing = await this.prisma.channel.findMany({
      where: { clubId, teamId, slug: { in: seeds.map((seed) => seed.slug) } },
      select: { id: true, slug: true, kind: true, visibility: true },
    })
    const bySlug = new Map((existing ?? []).map((row) => [row.slug, row]))
    for (const seed of seeds) {
      const row = bySlug.get(seed.slug)
      if (!row) {
        try {
          await this.prisma.channel.create({
            data: {
              clubId,
              teamId,
              slug: seed.slug,
              kind: seed.kind,
              name: seed.name,
              visibility: seed.visibility,
            },
          })
        } catch (error) {
          // A concurrent first access created it; the unique key converges.
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
            throw error
          }
        }
        continue
      }
      if (row.kind !== seed.kind || row.visibility !== seed.visibility) {
        await this.prisma.channel.update({
          where: { id: row.id },
          data: { kind: seed.kind, visibility: seed.visibility },
        })
      }
    }
    this.provisionedTeams.set(teamId, youth)
  }

  async ensureClubChannels(clubId: string): Promise<void> {
    if (this.provisionedClubs.has(clubId)) return
    // Club channels have teamId = null, which Prisma cannot address in a
    // composite upsert key: resolve by a nullable-safe lookup instead.
    const existing = await this.prisma.channel.findMany({
      where: { clubId, teamId: null, slug: { in: CLUB_CHANNEL_SEEDS.map((seed) => seed.slug) } },
      select: { id: true, slug: true, kind: true, visibility: true },
    })
    const bySlug = new Map((existing ?? []).map((row) => [row.slug, row]))
    for (const seed of CLUB_CHANNEL_SEEDS) {
      const row = bySlug.get(seed.slug)
      if (row) {
        if (row.kind !== seed.kind || row.visibility !== seed.visibility) {
          await this.prisma.channel.update({
            where: { id: row.id },
            data: { kind: seed.kind, visibility: seed.visibility },
          })
        }
        continue
      }
      try {
        await this.prisma.channel.create({
          data: {
            clubId,
            teamId: null,
            slug: seed.slug,
            kind: seed.kind,
            name: seed.name,
            visibility: seed.visibility,
          },
        })
      } catch (error) {
        // Two first-access requests can race; the other one created it.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error
        }
      }
    }
    this.provisionedClubs.add(clubId)
  }

  /**
   * Manager-gated provisioning entrypoint for the team-creation flow.
   * Verifies the caller is a club OWNER/ADMIN or holds a FULL active coach
   * assignment on this exact team before seeding channels — without this,
   * any authenticated user could provision channels for an arbitrary teamId.
   */
  async provisionTeamChannels(userId: string, teamId: string): Promise<{ provisioned: number }> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { clubId: true },
    })
    if (!team) return { provisioned: 0 }

    const [membership, teamStaffAccess] = await Promise.all([
      this.prisma.membership.findFirst({
        where: { userId, clubId: team.clubId },
        select: { role: true },
      }),
      this.prisma.teamAccess.findFirst({
        where: {
          userId,
          teamId,
          ...activeTeamAccessWhere(),
          phase: 'FULL',
          role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] },
        },
        select: { id: true },
      }),
    ])
    if (
      !membership ||
      (membership.role !== 'OWNER' && membership.role !== 'ADMIN' && !teamStaffAccess)
    ) {
      throw new ForbiddenException('Only club admins or coaches can provision channels')
    }

    await this.ensureTeamChannels(team.clubId, teamId)
    await this.ensureClubChannels(team.clubId)
    return { provisioned: TEAM_CHANNEL_SEEDS.length + CLUB_CHANNEL_SEEDS.length }
  }

  /**
   * Returns club-level channels (teamId IS NULL) visible to the requesting
   * user. Called by AnnounceSheet when no teamId is available (admin home).
   */
  async listClubChannelsForUser(userId: string, clubId: string): Promise<SharedChannel[]> {
    const [membership, activeTeamAccess] = await Promise.all([
      this.prisma.membership.findFirst({
        where: { userId, clubId },
        select: { role: true },
      }),
      this.prisma.teamAccess.findMany({
        where: { userId, clubId, ...activeTeamAccessWhere() },
        select: { role: true, phase: true },
      }),
    ])
    if (!membership) throw new ForbiddenException('Not a club member')

    await this.ensureClubChannels(clubId)

    const channels = await this.prisma.channel.findMany({
      where: { clubId, teamId: null, kind: { not: 'CUSTOM' } },
      include: CHANNEL_ROW_INCLUDE,
      orderBy: { kind: 'asc' },
    })

    const access = { membership, activeTeamAccess }
    const visible = channels.filter((channel) =>
      this.userMayRead(channel.visibility as ChannelVisibility, access),
    )
    const decorated = await this.decorate(userId, visible as ChannelRow[], (c) =>
      this.userMayWrite(c, access),
    )
    return decorated.map(stripDecoration)
  }

  async listAnnouncements(
    userId: string,
    clubId: string,
    limit: number,
  ): Promise<Array<{ id: string; title: string; body: string; createdAt: string }>> {
    const [membership, teamAccess] = await Promise.all([
      this.prisma.membership.findFirst({ where: { userId, clubId }, select: { role: true } }),
      this.prisma.teamAccess.findMany({
        where: { userId, clubId, ...activeTeamAccessWhere() },
        select: { teamId: true },
      }),
    ])
    if (!membership) throw new ForbiddenException('Not a club member')
    const teamIds = teamAccess.map((row) => row.teamId)

    const messages = await this.prisma.message.findMany({
      where: {
        clubId,
        deletedAt: null,
        messageType: 'TEXT',
        channel: {
          kind: 'ANNOUNCEMENTS',
          OR: [{ teamId: null }, ...(teamIds.length ? [{ teamId: { in: teamIds } }] : [])],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, content: true, createdAt: true },
    })

    return messages.map((m) => {
      const [title, ...rest] = m.content.split(/\n\n+/)
      return {
        id: m.id,
        title: title.trim(),
        body: rest.join('\n\n').trim(),
        createdAt: m.createdAt.toISOString(),
      }
    })
  }

  async listForUser(userId: string, teamId: string): Promise<SharedChannel[]> {
    const access = await this.teamsService.assertReadableAccess(userId, teamId)
    const decorated = await this.listDecoratedForTeam(userId, teamId, access)
    return decorated.map(stripDecoration)
  }

  /**
   * listForUser with the caller's mute state and raw last-message fields.
   * Adult-team PARENTS channels are hidden while empty (they are no longer
   * seeded, but older rows exist).
   */
  private async listDecoratedForTeam(
    userId: string,
    teamId: string,
    access: AccessCtx & { team: { clubId: string; ageGroup?: string | null } },
  ): Promise<DecoratedChannel[]> {
    const ageGroup = access.team.ageGroup ?? null
    await this.ensureTeamChannels(access.team.clubId, teamId, ageGroup)
    await this.ensureClubChannels(access.team.clubId)

    const channels = (await this.prisma.channel.findMany({
      where: {
        OR: [{ teamId }, { clubId: access.team.clubId, teamId: null }],
      },
      include: CHANNEL_ROW_INCLUDE,
      orderBy: [{ teamId: 'desc' }, { kind: 'asc' }],
    })) as ChannelRow[]

    // CUSTOM channels are scoped to their explicit ChannelMember set — load
    // this user's memberships so a CUSTOM channel only appears for its members,
    // not for anyone in the team's role-derived audience. (For default
    // channels a ChannelMember row only carries a mute preference.)
    const customMemberOf = await this.customMembershipSet(
      userId,
      channels.filter((c) => c.kind === 'CUSTOM').map((c) => c.id),
    )

    const youth = isYouthTeam(ageGroup)
    const visible = channels.filter((c) => {
      if (c.kind === 'CUSTOM') {
        // Club-level CUSTOM groups (teamId null) are listed by the inbox, not
        // per team; team-scoped CUSTOM groups belong to this team.
        return c.teamId === teamId && customMemberOf.has(c.id)
      }
      if (c.kind === 'PARENTS' && c.teamId && !youth && (c.messages?.length ?? 0) === 0) {
        return false
      }
      return this.userMayRead(c.visibility as ChannelVisibility, { ...access, teamScoped: Boolean(c.teamId) })
    })

    return this.decorate(userId, visible, (c) =>
      c.kind === 'CUSTOM'
        ? customMemberOf.has(c.id)
        : this.userMayWrite(c, { ...access, teamScoped: Boolean(c.teamId) }),
    )
  }

  /**
   * Every channel the caller can read across all their teams in the club,
   * plus club-level channels and the CUSTOM groups they belong to. Used by the
   * chat inbox. Club-level ANNOUNCEMENTS is omitted while empty (the team
   * announcements channel and club news already cover it).
   *
   * Chat revamp (H4): one pass over the club instead of a full access check +
   * provisioning + decorate per team. Access is derived from the rows loaded
   * up front (club membership, active TeamAccess, guardian links); provisioning
   * is cached per process; the result is decorated with one unread query.
   */
  async listInboxChannels(userId: string, clubId: string): Promise<DecoratedChannel[]> {
    const [membership, teamRows, guardianRows] = await Promise.all([
      this.prisma.membership.findFirst({ where: { userId, clubId }, select: { role: true } }),
      this.prisma.teamAccess.findMany({
        where: { userId, clubId, ...activeTeamAccessWhere() },
        select: { teamId: true, role: true, phase: true },
      }),
      LAUNCH_FEATURES.youthParticipation ? this.prisma.guardianRelationship.findMany({
        where: { parentUserId: userId, clubId, teamId: { not: null } },
        select: { teamId: true, playerUserId: true },
      }) : Promise.resolve([] as Array<{ teamId: string | null; playerUserId: string | null }>),
    ])
    if (!membership) throw new ForbiddenException('Not a club member')

    // A guardian reads the team while the linked child is actually on it
    // (mirrors TeamsService.assertReadableAccess).
    const linkedPlayerIds = Array.from(
      new Set((guardianRows ?? []).map((r) => r.playerUserId).filter((id): id is string => !!id)),
    )
    const childAccess =
      linkedPlayerIds.length > 0
        ? await this.prisma.teamAccess.findMany({
            where: { userId: { in: linkedPlayerIds }, clubId, ...activeTeamAccessWhere() },
            select: { userId: true, teamId: true },
          })
        : []
    const childOnTeam = new Set((childAccess ?? []).map((r) => `${r.userId}:${r.teamId}`))
    const guardianTeamIds = (guardianRows ?? [])
      .filter(
        (r) => !!r.teamId && (!r.playerUserId || childOnTeam.has(`${r.playerUserId}:${r.teamId}`)),
      )
      .map((r) => r.teamId as string)

    const accessByTeam = new Map<string, Array<{ role: string; phase?: string | null }>>()
    for (const row of teamRows ?? []) {
      const list = accessByTeam.get(row.teamId) ?? []
      list.push({ role: row.role as string, phase: row.phase as string })
      accessByTeam.set(row.teamId, list)
    }
    const teamIds = Array.from(new Set([...accessByTeam.keys(), ...guardianTeamIds]))
    const clubManager = ['OWNER', 'ADMIN'].includes(membership.role as string)
    const readableTeam = (teamId: string) => teamIds.includes(teamId) || clubManager

    const teams =
      teamIds.length > 0
        ? await this.prisma.team.findMany({
            where: { id: { in: teamIds }, clubId },
            select: { id: true, ageGroup: true },
          })
        : []
    for (const team of teams ?? []) {
      await this.ensureTeamChannels(clubId, team.id, team.ageGroup ?? null)
    }
    await this.ensureClubChannels(clubId)
    const youthByTeam = new Map((teams ?? []).map((t) => [t.id, isYouthTeam(t.ageGroup)]))

    const channels = (await this.prisma.channel.findMany({
      where: {
        clubId,
        OR: [
          ...(teamIds.length > 0
            ? [{ teamId: { in: teamIds }, kind: { not: 'CUSTOM' as const } }]
            : []),
          { teamId: null, kind: { not: 'CUSTOM' as const } },
          { kind: 'CUSTOM' as const, members: { some: { userId } } },
        ],
      },
      include: CHANNEL_ROW_INCLUDE,
      orderBy: [{ teamId: 'desc' }, { kind: 'asc' }],
    })) as ChannelRow[]

    const clubAccess: AccessCtx = { membership, activeTeamAccess: teamRows ?? [] }
    const teamAccess = (teamId: string): AccessCtx => ({
      membership,
      activeTeamAccess: accessByTeam.get(teamId) ?? [],
      teamScoped: true,
    })
    const writable = new Map<string, boolean>()
    const visible: ChannelRow[] = []
    for (const c of channels ?? []) {
      if (c.kind === 'CUSTOM') {
        // H3: group membership alone is not enough; the caller must still
        // read the group's team (legacy club-wide groups: club membership).
        if (c.teamId && !readableTeam(c.teamId)) continue
        visible.push(c)
        writable.set(c.id, true)
        continue
      }
      if (c.teamId) {
        const access = teamAccess(c.teamId)
        if (c.kind === 'PARENTS' && !youthByTeam.get(c.teamId) && (c.messages?.length ?? 0) === 0) {
          continue
        }
        if (!this.userMayRead(c.visibility as ChannelVisibility, access)) continue
        visible.push(c)
        writable.set(c.id, this.userMayWrite(c, access))
        continue
      }
      if (c.kind === 'ANNOUNCEMENTS' && (c.messages?.length ?? 0) === 0) continue
      if (!this.userMayRead(c.visibility as ChannelVisibility, clubAccess)) continue
      visible.push(c)
      writable.set(c.id, this.userMayWrite(c, clubAccess))
    }

    return this.decorate(userId, visible, (c) => writable.get(c.id) ?? false)
  }

  private async customMembershipSet(userId: string, channelIds: string[]): Promise<Set<string>> {
    if (channelIds.length === 0) return new Set()
    const rows = await this.prisma.channelMember.findMany({
      where: { userId, channelId: { in: channelIds } },
      select: { channelId: true },
    })
    return new Set(rows.map((r) => r.channelId))
  }

  /**
   * Attach unread count, last message and the caller's mute state. Unread =
   * messages in the channel without a receipt for the caller, not sent by
   * them, and posted after the caller joined (M2): a new member does not
   * inherit a channel's whole history as unread.
   */
  private async decorate(
    userId: string,
    channels: ChannelRow[],
    canWriteFor: (channel: ChannelRow) => boolean,
  ): Promise<DecoratedChannel[]> {
    const channelIds = channels.map((c) => c.id)
    const unreadByChannel = new Map<string, number>()
    const muteByChannel = new Map<string, { muted: boolean; mutedUntil: Date | null }>()
    if (channelIds.length > 0) {
      const joinedAt = await this.joinedAtByChannel(userId, channels)
      const sinceRows = channels.map(
        (c) => Prisma.sql`(${c.id}::text, ${(joinedAt.get(c.id) ?? EPOCH).toISOString()}::timestamp)`,
      )
      const [counts, muteRows] = await Promise.all([
        this.prisma.$queryRaw<Array<{ channelId: string; count: number }>>`
          SELECT m."channelId", COUNT(*)::int AS count
           FROM "Message" m
           JOIN (VALUES ${Prisma.join(sinceRows)}) AS s("channelId", "since")
             ON s."channelId" = m."channelId"
           LEFT JOIN "MessageReadReceipt" r
             ON r."messageId" = m."id" AND r."userId" = ${userId}
           WHERE m."deletedAt" IS NULL
             AND m."createdAt" > s."since"
             AND (m."senderId" IS NULL OR m."senderId" <> ${userId})
             AND r."id" IS NULL
           GROUP BY m."channelId"
        `,
        this.prisma.channelMember.findMany({
          where: { userId, channelId: { in: channelIds } },
          select: { channelId: true, muted: true, mutedUntil: true },
        }),
      ])
      for (const row of counts ?? []) unreadByChannel.set(row.channelId, Number(row.count))
      for (const row of muteRows ?? []) {
        muteByChannel.set(row.channelId, {
          muted: !!row.muted,
          mutedUntil: row.mutedUntil ?? null,
        })
      }
    }

    const now = new Date()
    return channels.map((c) => {
      const last = c.messages?.[0]
      const mute = muteByChannel.get(c.id)
      const muted = isMuteActive(mute ?? null, now)
      return {
        id: c.id,
        clubId: c.clubId,
        teamId: c.teamId,
        slug: c.slug,
        kind: c.kind as ChannelKind,
        name: c.name,
        description: c.description,
        visibility: c.visibility as ChannelVisibility,
        canWrite: canWriteFor(c),
        unreadCount: unreadByChannel.get(c.id) ?? 0,
        lastMessage: last
          ? {
              id: last.id,
              senderName: last.sender?.name ?? null,
              contentPreview: previewFor(last.content, last.messageType),
              messageType: last.messageType as MessageType,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        teamName: c.team ? c.team.displayName || c.team.name : null,
        muted,
        mutedUntil: muted && mute?.mutedUntil ? mute.mutedUntil.toISOString() : null,
        lastMessageRaw: last
          ? {
              senderId: last.senderId ?? null,
              senderName: last.sender?.name ?? null,
              content: last.content ?? '',
              type: last.messageType as MessageType,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
      } as DecoratedChannel
    })
  }

  /**
   * When the caller joined each channel's audience (M2):
   *  - CUSTOM group: their ChannelMember row.
   *  - team channel: their earliest active TeamAccess or guardian link on the
   *    team, else (club managers reading every team) their club membership.
   *  - club channel: their club membership.
   * The read-receipt join still applies on top (lastRead watermark).
   */
  private async joinedAtByChannel(
    userId: string,
    channels: Array<{ id: string; clubId: string; teamId: string | null; kind: string }>,
  ): Promise<Map<string, Date>> {
    const clubIds = Array.from(new Set(channels.map((c) => c.clubId)))
    const teamIds = Array.from(
      new Set(channels.map((c) => c.teamId).filter((id): id is string => !!id)),
    )
    const customIds = channels.filter((c) => c.kind === 'CUSTOM').map((c) => c.id)
    const [memberships, accessRows, guardianRows, memberRows] = await Promise.all([
      this.prisma.membership.findMany({
        where: { userId, clubId: { in: clubIds } },
        select: { clubId: true, createdAt: true },
      }),
      teamIds.length > 0
        ? this.prisma.teamAccess.findMany({
            where: { userId, teamId: { in: teamIds }, ...activeTeamAccessWhere() },
            select: { teamId: true, createdAt: true },
          })
        : Promise.resolve([] as Array<{ teamId: string; createdAt: Date }>),
      teamIds.length > 0 && LAUNCH_FEATURES.youthParticipation
        ? this.prisma.guardianRelationship.findMany({
            where: { parentUserId: userId, teamId: { in: teamIds } },
            select: { teamId: true, createdAt: true },
          })
        : Promise.resolve([] as Array<{ teamId: string | null; createdAt: Date }>),
      customIds.length > 0
        ? this.prisma.channelMember.findMany({
            where: { userId, channelId: { in: customIds } },
            select: { channelId: true, createdAt: true },
          })
        : Promise.resolve([] as Array<{ channelId: string; createdAt: Date }>),
    ])
    const clubJoined = new Map((memberships ?? []).map((m) => [m.clubId, m.createdAt]))
    const teamJoined = new Map<string, Date>()
    for (const row of [...(accessRows ?? []), ...(guardianRows ?? [])]) {
      if (!row.teamId || !row.createdAt) continue
      const current = teamJoined.get(row.teamId)
      if (!current || row.createdAt < current) teamJoined.set(row.teamId, row.createdAt)
    }
    const memberJoined = new Map((memberRows ?? []).map((m) => [m.channelId, m.createdAt]))

    const out = new Map<string, Date>()
    for (const c of channels) {
      const joined =
        (c.kind === 'CUSTOM' ? memberJoined.get(c.id) : undefined) ??
        (c.teamId ? teamJoined.get(c.teamId) : undefined) ??
        clubJoined.get(c.clubId)
      if (joined) out.set(c.id, joined)
    }
    return out
  }

  /**
   * Create a custom group ("Neue Gruppe") with its members in one go.
   *
   * The group lives on a team. The creator must be staff of that team (club
   * OWNER/ADMIN or its head/assistant coach; a club-level COACH role alone is
   * not enough). Members must belong to that team (active TeamAccess or a
   * guardian link) or be club OWNER/ADMIN. The group must pass the
   * safeguarding rule (B1, see group-safeguarding.ts). Channel + ChannelMember
   * rows are written in one transaction so a partial write can't orphan an
   * invisible group.
   */
  async createCustomChannel(
    userId: string,
    input: {
      clubId: string
      name: string
      description?: string
      teamId?: string
      memberIds?: string[]
    },
  ): Promise<SharedChannel> {
    if (!input.teamId) {
      throw new BadRequestException('A group needs a team')
    }
    const team = await this.prisma.team.findUnique({
      where: { id: input.teamId },
      select: { clubId: true },
    })
    // Validate that the supplied teamId actually belongs to this club so a
    // caller with OWNER role in club A can't attach a channel to team B.
    if (!team || team.clubId !== input.clubId) {
      throw new ForbiddenException('Team does not belong to this club')
    }

    const [membership, callerTeamAccess] = await Promise.all([
      this.prisma.membership.findFirst({
        where: { userId, clubId: input.clubId },
        select: { role: true },
      }),
      this.prisma.teamAccess.findMany({
        where: { userId, teamId: input.teamId, ...activeTeamAccessWhere() },
        select: { role: true, phase: true },
      }),
    ])
    if (!membership) {
      throw new ForbiddenException('Not a club member')
    }
    if (!this.isTeamStaff({ membership, activeTeamAccess: callerTeamAccess ?? [] })) {
      throw new ForbiddenException('Only club admins or coaches of this team can create groups')
    }

    const memberIds = Array.from(
      new Set([userId, ...(input.memberIds ?? []).filter((id) => id && id !== userId)]),
    )
    if (memberIds.length < 2) {
      throw new BadRequestException('A group needs at least one other member')
    }
    await this.assertEligibleGroupMembers(
      input.clubId,
      input.teamId,
      memberIds.filter((id) => id !== userId),
    )
    await this.assertGroupSafeguarding(input.clubId, input.teamId, memberIds)

    const slug = slugify(input.name)
    const teamId = input.teamId
    const channel = await this.prisma.$transaction(async (tx) => {
      const created = await tx.channel.create({
        data: {
          clubId: input.clubId,
          teamId,
          slug: `group-${slug}-${Date.now().toString(36)}`,
          kind: 'CUSTOM',
          name: input.name.trim(),
          description: input.description?.trim() || null,
          visibility: 'MEMBERS',
        },
      })
      await tx.channelMember.createMany({
        data: memberIds.map((memberId) => ({ channelId: created.id, userId: memberId })),
        skipDuplicates: true,
      })
      return created
    })

    // Live-subscribe every member's open sockets so the group appears and
    // receives messages without a reconnect.
    for (const memberId of memberIds) {
      this.eventEmitter.emit('channel.member.added', {
        userId: memberId,
        teamId: channel.teamId,
        channelId: channel.id,
      })
    }

    return {
      id: channel.id,
      clubId: channel.clubId,
      teamId: channel.teamId,
      slug: channel.slug,
      kind: channel.kind as ChannelKind,
      name: channel.name,
      description: channel.description,
      visibility: channel.visibility as ChannelVisibility,
      canWrite: true,
      unreadCount: 0,
      lastMessage: null,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString(),
    }
  }

  /**
   * Group members must be reachable through the channel's team: an active
   * TeamAccess on it, a guardian link to it, or a club OWNER/ADMIN
   * membership. A club-level COACH is only eligible for teams they are on.
   */
  private async assertEligibleGroupMembers(
    clubId: string,
    teamId: string,
    userIds: string[],
  ): Promise<void> {
    if (userIds.length === 0) return
    const [memberships, teamRows, guardianRows] = await Promise.all([
      this.prisma.membership.findMany({
        where: { clubId, userId: { in: userIds }, user: launchClubParticipantWhere(clubId) },
        select: { userId: true, role: true },
      }),
      this.prisma.teamAccess.findMany({
        where: { teamId, userId: { in: userIds }, ...activeTeamAccessWhere() },
        select: { userId: true },
      }),
      LAUNCH_FEATURES.youthParticipation ? this.prisma.guardianRelationship.findMany({
        where: { clubId, teamId, parentUserId: { in: userIds } },
        select: { parentUserId: true },
      }) : Promise.resolve([]),
    ])
    const membershipRole = new Map(
      (memberships ?? []).map((m) => [m.userId, m.role as string]),
    )
    const onTeam = new Set([
      ...(teamRows ?? []).map((r) => r.userId),
      ...(guardianRows ?? []).map((r) => r.parentUserId),
    ])
    for (const id of userIds) {
      const role = membershipRole.get(id)
      if (!role) throw new BadRequestException('User is not a member of this club')
      const isClubAdmin = role === 'OWNER' || role === 'ADMIN'
      if (!isClubAdmin && !onTeam.has(id)) {
        throw new BadRequestException('User is not on this team')
      }
    }
  }

  /**
   * B1: load what the safeguarding rule needs for `memberIds` (the complete
   * resulting member set) and throw its code when the group would not be safe.
   * Staff of the team = club OWNER/ADMIN, the team's head/assistant coaches,
   * and Betreuer (club SUPPORT_STAFF / TEAM_COORDINATOR who are on the team).
   */
  private async assertGroupSafeguarding(
    clubId: string,
    teamId: string | null,
    memberIds: string[],
    failureCode?: string,
  ): Promise<void> {
    const ids = Array.from(new Set(memberIds))
    if (ids.length < 2) return
    const [users, memberships, teamRows, guardianLinks, consents] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids }, ...launchClubParticipantWhere(clubId) },
        select: { id: true, dateOfBirth: true, managedById: true, adultConfirmedAt: true },
      }),
      this.prisma.membership.findMany({
        where: { clubId, userId: { in: ids } },
        select: { userId: true, role: true, operationalRoles: true },
      }),
      teamId
        ? this.prisma.teamAccess.findMany({
            where: {
              teamId,
              userId: { in: ids },
              ...activeTeamAccessWhere(),
              phase: 'FULL',
            },
            select: { userId: true, role: true },
          })
        : Promise.resolve([] as Array<{ userId: string; role: string }>),
      this.prisma.guardianRelationship.findMany({
        where: { clubId, parentUserId: { in: ids }, playerUserId: { in: ids } },
        select: { parentUserId: true, playerUserId: true },
      }),
      this.prisma.parentalConsent.findMany({
        where: {
          clubId,
          status: 'APPROVED',
          guardianUserId: { in: ids },
          playerUserId: { in: ids },
        },
        select: { guardianUserId: true, playerUserId: true },
      }),
    ])
    const teamRolesByUser = new Map<string, string[]>()
    for (const row of teamRows ?? []) {
      teamRolesByUser.set(row.userId, [...(teamRolesByUser.get(row.userId) ?? []), row.role])
    }
    const staffIds = new Set<string>()
    for (const m of memberships ?? []) {
      const teamRoles = teamRolesByUser.get(m.userId) ?? []
      const operational = (m.operationalRoles ?? []) as string[]
      const isBetreuer =
        teamRoles.length > 0 &&
        (operational.includes('SUPPORT_STAFF') || operational.includes('TEAM_COORDINATOR'))
      if (
        m.role === 'OWNER' ||
        m.role === 'ADMIN' ||
        teamRoles.some((r) => r === 'HEAD_COACH' || r === 'ASSISTANT_COACH') ||
        isBetreuer
      ) {
        staffIds.add(m.userId)
      }
    }
    const guardianPairs = new Set<string>()
    for (const g of guardianLinks ?? []) {
      if (g.playerUserId) guardianPairs.add(`${g.parentUserId}:${g.playerUserId}`)
    }
    for (const c of consents ?? []) {
      if (c.guardianUserId) guardianPairs.add(`${c.guardianUserId}:${c.playerUserId}`)
    }
    const decision = evaluateGroupSafeguarding(ids, {
      users: users ?? [],
      staffIds,
      guardianPairs,
    })
    if (!decision.ok) throw new BadRequestException(failureCode ?? decision.code)
  }

  /** Under-16 or unverified age (the safeguarding rule treats both as minors). */
  private async isMinorOrUnknown(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, dateOfBirth: true, managedById: true, adultConfirmedAt: true },
    })
    return !isKnownAdult(user ?? undefined)
  }

  /**
   * Single authorization decision for a channel, independent of whatever
   * team the client happens to have selected:
   *  - CUSTOM: an explicit ChannelMember row plus club membership.
   *  - team channel: readable team access + channel visibility.
   *  - club channel: club membership + visibility over all the caller's teams.
   * A ChannelMember row on a non-CUSTOM channel is only a mute preference and
   * never grants access.
   */
  async getChannelAccess(userId: string, channelId: string): Promise<ChannelAccessResult> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } })
    if (!channel) throw new NotFoundException('Channel not found')
    const base: ChannelAccessResult = {
      channel: channel as unknown as ChannelAccessResult['channel'],
      canRead: false,
      canWrite: false,
      access: { membership: null, activeTeamAccess: [] },
      isManager: false,
    }

    if (channel.kind === 'CUSTOM') {
      const [member, membership] = await Promise.all([
        this.prisma.channelMember.findUnique({
          where: { channelId_userId: { channelId, userId } },
          select: { id: true },
        }),
        this.prisma.membership.findFirst({
          where: { userId, clubId: channel.clubId },
          select: { role: true },
        }),
      ])
      if (!member || !membership) return base
      // H3: a group on a team is only readable while the caller can still
      // read that team (TeamAccess ended → the group closes too, even before
      // the stale ChannelMember row is purged).
      let access: AccessCtx = { membership, activeTeamAccess: [] }
      if (channel.teamId) {
        try {
          const teamAccess = await this.teamsService.assertReadableAccess(userId, channel.teamId)
          access = { membership, activeTeamAccess: teamAccess.activeTeamAccess ?? [], teamScoped: true }
        } catch {
          return base
        }
      }
      return {
        ...base,
        access,
        canRead: true,
        canWrite: true,
        isManager: this.isTeamStaff(access),
      }
    }

    if (channel.teamId) {
      let access: AccessCtx
      try {
        access = { ...(await this.teamsService.assertReadableAccess(userId, channel.teamId)), teamScoped: true }
      } catch {
        return base
      }
      const canRead = this.userMayRead(channel.visibility as ChannelVisibility, access)
      return {
        ...base,
        access,
        canRead,
        canWrite:
          canRead &&
          this.userMayWrite(channel, access),
        isManager: this.isCoach(access) || this.isAdmin(access),
      }
    }

    const [membership, activeTeamAccess] = await Promise.all([
      this.prisma.membership.findFirst({
        where: { userId, clubId: channel.clubId },
        select: { role: true },
      }),
      this.prisma.teamAccess.findMany({
        where: { userId, clubId: channel.clubId, ...activeTeamAccessWhere() },
        select: { role: true, phase: true },
      }),
    ])
    if (!membership) return base
    const access: AccessCtx = { membership, activeTeamAccess: activeTeamAccess ?? [] }
    const canRead = this.userMayRead(channel.visibility as ChannelVisibility, access)
    return {
      ...base,
      access,
      canRead,
      canWrite:
        canRead &&
        this.userMayWrite(channel, access),
      isManager: this.isAdmin(access),
    }
  }

  /**
   * Transaction-bound authorization for the private-upload v2 internals.
   * This is intentionally not exposed by a controller. The caller owns `tx`
   * so the access decision and the eventual upload/message mutation commit as
   * one unit.
   *
   * Lock order is shared with account erasure and club-member removal:
   * user lifecycle -> club owner/membership -> concrete scope rows. Holding
   * the channel, membership, team-access and CUSTOM-member rows prevents an
   * access revocation from committing between this decision and the caller's
   * mutation. Every scope is re-read after the locks; the optimistic lookup
   * is used only to choose the deterministic lock keys.
   */
  async authorizePrivateUpload(
    userId: string,
    clubId: string,
    teamId: string,
    channelId: string,
    mode: 'read' | 'write',
    tx: Prisma.TransactionClient,
  ): Promise<AuthorizedPrivateChannelTarget> {
    const initial = await tx.channel.findUnique({
      where: { id: channelId },
      select: { id: true, clubId: true, teamId: true },
    })
    if (!initial || initial.clubId !== clubId || (initial.teamId && initial.teamId !== teamId)) {
      throw new ForbiddenException('Channel does not belong to this club and team')
    }
    const initialTeam = await tx.team.findFirst({
      where: { id: teamId, clubId },
      select: { id: true },
    })
    if (!initialTeam) throw new ForbiddenException('Team does not belong to this club')

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
    await assertLaunchParticipant(tx, userId)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner:${clubId}`}))`
    await tx.$queryRaw`SELECT "id" FROM "Channel" WHERE "id" = ${channelId} FOR SHARE`
    const lockedChannel = await tx.channel.findUnique({
      where: { id: channelId },
      select: { id: true, clubId: true, teamId: true, kind: true },
    })
    if (!lockedChannel || lockedChannel.clubId !== clubId
      || (lockedChannel.teamId && lockedChannel.teamId !== teamId)) {
      throw new ForbiddenException('Channel access is no longer available')
    }
    await tx.$queryRaw`SELECT "id" FROM "Team" WHERE "id" = ${teamId} AND "clubId" = ${clubId} FOR SHARE`
    // Team-access decisions such as accepting pending coaches update the
    // assignment before membership. Match that order to avoid a row-lock
    // cycle when an authorization races the decision.
    if (lockedChannel.teamId) {
      await tx.$queryRaw`SELECT "id" FROM "TeamAccess" WHERE "userId" = ${userId} AND "clubId" = ${clubId} AND "teamId" = ${teamId} FOR SHARE`
    } else {
      // Club-level COACHES_ONLY policy depends on staff access across the
      // club, so every row participating in that decision is locked.
      await tx.$queryRaw`SELECT "id" FROM "TeamAccess" WHERE "userId" = ${userId} AND "clubId" = ${clubId} FOR SHARE`
    }
    await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "userId" = ${userId} AND "clubId" = ${clubId} FOR SHARE`
    if (lockedChannel.kind === 'CUSTOM') {
      await tx.$queryRaw`SELECT "id" FROM "ChannelMember" WHERE "channelId" = ${channelId} AND "userId" = ${userId} FOR SHARE`
    }

    const [user, channel, team, membership, activeTeamAccess, channelMember] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { deletedAt: true } }),
      tx.channel.findUnique({ where: { id: channelId } }),
      tx.team.findFirst({ where: { id: teamId, clubId }, select: { id: true } }),
      tx.membership.findUnique({
        where: { userId_clubId: { userId, clubId } },
        select: { role: true },
      }),
      tx.teamAccess.findMany({
        where: { userId, clubId, ...activeTeamAccessWhere() },
        select: { teamId: true, role: true, phase: true },
      }),
      tx.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
        select: { id: true },
      }),
    ])
    if (!user || user.deletedAt || !team || !membership || !channel
      || channel.clubId !== clubId || (channel.teamId && channel.teamId !== teamId)) {
      throw new ForbiddenException('Channel access is no longer available')
    }

    const teamAccess = activeTeamAccess.filter((entry) => entry.teamId === teamId)
    const isAdmin = membership.role === 'OWNER' || membership.role === 'ADMIN'
    const hasFullTeamAccess = teamAccess.some((entry) => entry.phase !== 'TRIAL')
    // Legacy join-code trials belong to the club and keep the same readable
    // team surface as the existing channel policy. Marketplace trials have no
    // club membership and are rejected above.
    let hasReadableTeamAccess = isAdmin || hasFullTeamAccess
    if (!hasReadableTeamAccess && teamAccess.length > 0) {
      const trial = await resolveTrialSessionScope(tx as never, userId, teamId)
      hasReadableTeamAccess = !trial.wechsel
    }
    // Channel messages always carry a concrete teamId. A club-level channel
    // may be read by every matching club member, but a new upload must not be
    // anchored to a team the sender cannot otherwise read.
    if ((channel.teamId || mode === 'write') && !hasReadableTeamAccess) {
      throw new ForbiddenException('You cannot view this channel')
    }
    if (channel.kind === 'CUSTOM' && !channelMember) {
      throw new ForbiddenException('You cannot view this channel')
    }

    const access: AccessCtx = {
      membership,
      activeTeamAccess: channel.teamId ? teamAccess : activeTeamAccess,
      teamScoped: Boolean(channel.teamId),
    }
    const canRead = this.userMayRead(channel.visibility as ChannelVisibility, access)
    const allowed = mode === 'read' ? canRead : canRead && this.userMayWrite(channel, access)
    if (!allowed) {
      throw new ForbiddenException(
        mode === 'read' ? 'You cannot view this channel' : 'You cannot post to this channel',
      )
    }

    return { userId, clubId, teamId, targetType: 'CHANNEL', targetId: channelId }
  }

  async assertReadableChannel(userId: string, channelId: string): Promise<ChannelAccessResult> {
    const result = await this.getChannelAccess(userId, channelId)
    if (!result.canRead) throw new ForbiddenException('You cannot view this channel')
    return result
  }

  private async assertClubChannel(userId: string, clubId: string, channelId: string) {
    const result = await this.assertReadableChannel(userId, channelId)
    if (result.channel.clubId !== clubId) throw new NotFoundException('Channel not found')
    return result
  }

  /** Channel header / info screen. */
  async getChannelDetail(
    userId: string,
    clubId: string,
    channelId: string,
  ): Promise<ChatChannelDetail> {
    const result = await this.assertClubChannel(userId, clubId, channelId)
    const row = (await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: CHANNEL_ROW_INCLUDE,
    })) as ChannelRow | null
    if (!row) throw new NotFoundException('Channel not found')
    const [decorated] = await this.decorate(userId, [row], () => result.canWrite)
    const memberCount =
      row.kind === 'CUSTOM'
        ? await this.prisma.channelMember.count({ where: { channelId } })
        : (await this.listReadersForChannel(channelId)).length
    const { lastMessageRaw: _raw, ...rest } = decorated
    void _raw
    return {
      ...rest,
      memberCount,
      canManageMembers: row.kind === 'CUSTOM' && result.isManager,
    }
  }

  /** Mark every message in a readable channel read for the caller. */
  async markChannelReadForUser(
    userId: string,
    clubId: string,
    channelId: string,
  ): Promise<{ marked: number }> {
    await this.assertClubChannel(userId, clubId, channelId)
    return this.markChannelRead(userId, channelId)
  }

  /**
   * Seed a read receipt for every message in the channel the user didn't
   * send and hasn't read — exactly inverting the unread count in decorate().
   * Scoped by channelId only (club-level channel messages carry the posting
   * user's teamId). Caller MUST authorize channel read access first.
   */
  async markChannelRead(userId: string, channelId: string): Promise<{ marked: number }> {
    const inserted = await this.prisma.$executeRaw`
      INSERT INTO "MessageReadReceipt" ("id", "messageId", "userId", "readAt")
      SELECT gen_random_uuid()::text, m."id", ${userId}, NOW()
       FROM "Message" m
       LEFT JOIN "MessageReadReceipt" r
         ON r."messageId" = m."id" AND r."userId" = ${userId}
       WHERE m."channelId" = ${channelId}
         AND m."deletedAt" IS NULL
         AND (m."senderId" IS NULL OR m."senderId" <> ${userId})
         AND r."id" IS NULL
       ON CONFLICT ("messageId", "userId") DO NOTHING
    `
    return { marked: typeof inserted === 'number' ? inserted : 0 }
  }

  /**
   * Mute / unmute a channel for the caller. For default channels the
   * ChannelMember row is created as a pure preference carrier (it grants
   * nothing); for CUSTOM groups the caller's existing membership row is
   * updated — never created, so muting can't be used to join a group.
   */
  async setChannelMute(
    userId: string,
    clubId: string,
    channelId: string,
    input: { muted: boolean; mutedUntil?: string | null },
  ): Promise<{ muted: boolean; mutedUntil: string | null }> {
    const result = await this.assertClubChannel(userId, clubId, channelId)
    const mutedUntil = input.muted && input.mutedUntil ? new Date(input.mutedUntil) : null
    const data = { muted: input.muted, mutedUntil }
    if (result.channel.kind === 'CUSTOM') {
      await this.prisma.channelMember.update({
        where: { channelId_userId: { channelId, userId } },
        data,
      })
    } else {
      await this.prisma.channelMember.upsert({
        where: { channelId_userId: { channelId, userId } },
        create: { channelId, userId, ...data },
        update: data,
      })
    }
    return { muted: input.muted, mutedUntil: mutedUntil ? mutedUntil.toISOString() : null }
  }

  /**
   * Channel-scoped member list (works for club-level channels too).
   * CUSTOM: the actual members; managers also get the channel team's
   * candidate roster (isMember=false) for the add picker. Default channels:
   * the role-derived audience. Emails only for managers.
   */
  async listChannelMembers(
    userId: string,
    clubId: string,
    channelId: string,
  ): Promise<ChatChannelMember[]> {
    const result = await this.assertClubChannel(userId, clubId, channelId)
    const { channel, isManager } = result

    if (channel.kind === 'CUSTOM') {
      const rows = await this.prisma.channelMember.findMany({
        where: { channelId, user: launchClubParticipantWhere(clubId) },
        select: {
          userId: true,
          user: { select: { name: true, email: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
      const memberIds = new Set(rows.map((r) => r.userId))
      const roleByUser = await this.roleLabels(channel.clubId, channel.teamId, [...memberIds])
      const members: ChatChannelMember[] = rows.map((r) => ({
        userId: r.userId,
        name: r.user?.name ?? 'Unknown',
        email: isManager ? r.user?.email ?? null : null,
        avatarUrl: r.user?.avatarUrl ?? null,
        role: roleByUser.get(r.userId) ?? 'PLAYER',
        isMember: true,
      }))
      if (!isManager || !channel.teamId) return members
      const roster = await this.teamRoster(channel.teamId, channel.clubId)
      for (const candidate of roster) {
        if (memberIds.has(candidate.userId)) continue
        members.push({
          userId: candidate.userId,
          name: candidate.name,
          email: candidate.email,
          avatarUrl: candidate.avatarUrl,
          role: candidate.role,
          isMember: false,
        })
      }
      return members
    }

    const readerIds = await this.listReadersForChannel(channelId)
    if (readerIds.length === 0) return []
    const [users, roleByUser] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: readerIds }, ...launchClubParticipantWhere(clubId) },
        select: { id: true, name: true, email: true, avatarUrl: true },
        orderBy: { name: 'asc' },
      }),
      this.roleLabels(channel.clubId, channel.teamId, readerIds),
    ])
    return users.map((u) => ({
      userId: u.id,
      name: u.name ?? 'Unknown',
      email: isManager ? u.email ?? null : null,
      avatarUrl: u.avatarUrl ?? null,
      role: roleByUser.get(u.id) ?? 'PLAYER',
      isMember: true,
    }))
  }

  /** Prefer the team role (HEAD_COACH, PARENT…); fall back to club role. */
  private async roleLabels(
    clubId: string,
    teamId: string | null,
    userIds: string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    if (userIds.length === 0) return out
    const [memberships, teamRows] = await Promise.all([
      this.prisma.membership.findMany({
        where: { clubId, userId: { in: userIds } },
        select: { userId: true, role: true },
      }),
      teamId
        ? this.prisma.teamAccess.findMany({
            where: { teamId, userId: { in: userIds }, ...activeTeamAccessWhere() },
            select: { userId: true, role: true },
          })
        : Promise.resolve([] as Array<{ userId: string; role: string }>),
    ])
    for (const m of memberships ?? []) out.set(m.userId, m.role as string)
    for (const r of teamRows ?? []) out.set(r.userId, r.role as string)
    return out
  }

  async addChannelMembers(
    userId: string,
    clubId: string,
    channelId: string,
    userIds: string[],
  ): Promise<{ added: number }> {
    const result = await this.assertClubChannel(userId, clubId, channelId)
    if (result.channel.kind !== 'CUSTOM') {
      throw new BadRequestException('Members are auto-managed for this channel')
    }
    if (!result.isManager) throw new ForbiddenException('Only managers can add members')
    const teamId = result.channel.teamId
    if (!teamId) {
      throw new BadRequestException('Legacy club-wide groups cannot take new members')
    }
    const targets = Array.from(new Set(userIds.filter(Boolean)))
    await this.assertEligibleGroupMembers(clubId, teamId, targets)
    // B1: the group as it would be after the add must still be safe.
    const current = await this.prisma.channelMember.findMany({
      where: { channelId },
      select: { userId: true },
    })
    await this.assertGroupSafeguarding(clubId, teamId, [
      ...(current ?? []).map((m) => m.userId),
      ...targets,
    ])
    const created = await this.prisma.channelMember.createMany({
      data: targets.map((id) => ({ channelId, userId: id })),
      skipDuplicates: true,
    })
    for (const id of targets) {
      this.eventEmitter.emit('channel.member.added', { userId: id, teamId, channelId })
    }
    return { added: created?.count ?? targets.length }
  }

  async removeChannelMember(
    userId: string,
    clubId: string,
    channelId: string,
    targetUserId: string,
  ): Promise<{ removed: boolean }> {
    const result = await this.assertClubChannel(userId, clubId, channelId)
    if (result.channel.kind !== 'CUSTOM') {
      // Default channels are role-derived: nobody can leave or be removed.
      throw new BadRequestException('Members are auto-managed for this channel')
    }
    if (userId !== targetUserId && !result.isManager) {
      throw new ForbiddenException('Only managers can remove members')
    }
    // B1: removing a minor never weakens safeguarding; removing anyone else
    // must leave a group that still passes the rule (e.g. the second staff
    // adult cannot leave a group with an under-16 in it).
    if (!(await this.isMinorOrUnknown(targetUserId))) {
      const current = await this.prisma.channelMember.findMany({
        where: { channelId },
        select: { userId: true },
      })
      const remaining = (current ?? []).map((m) => m.userId).filter((id) => id !== targetUserId)
      await this.assertGroupSafeguarding(
        clubId,
        result.channel.teamId,
        remaining,
        'GROUP_REMOVE_BREAKS_SAFEGUARD',
      )
    }
    await this.prisma.channelMember.deleteMany({ where: { channelId, userId: targetUserId } })
    this.eventEmitter.emit('realtime.access.changed', { userId: targetUserId })
    return { removed: true }
  }

  /**
   * H3: when a user's access changes (club removal, TeamAccess ended, loan
   * expired, consent withdrawn), drop their CUSTOM group memberships on teams
   * they can no longer read. getChannelAccess already refuses them; this
   * keeps member lists and push fan-out honest.
   */
  @OnEvent('realtime.access.changed')
  async purgeStaleGroupMemberships(payload: { userId: string }): Promise<number> {
    try {
      const rows = await this.prisma.channelMember.findMany({
        where: { userId: payload.userId, channel: { kind: 'CUSTOM' } },
        select: { id: true, channel: { select: { clubId: true, teamId: true } } },
      })
      if (!rows || rows.length === 0) return 0
      const readable = new Map<string, boolean>()
      const stale: string[] = []
      for (const row of rows) {
        const key = row.channel.teamId ?? `club:${row.channel.clubId}`
        if (!readable.has(key)) {
          let ok = false
          if (row.channel.teamId) {
            try {
              await this.teamsService.assertReadableAccess(payload.userId, row.channel.teamId)
              ok = true
            } catch {
              ok = false
            }
          } else {
            ok = !!(await this.prisma.membership.findFirst({
              where: { userId: payload.userId, clubId: row.channel.clubId },
              select: { id: true },
            }))
          }
          readable.set(key, ok)
        }
        if (!readable.get(key)) stale.push(row.id)
      }
      if (stale.length === 0) return 0
      const deleted = await this.prisma.channelMember.deleteMany({ where: { id: { in: stale } } })
      return deleted?.count ?? stale.length
    } catch (error) {
      this.logger.warn(`group membership purge failed for ${payload.userId}: ${String(error)}`)
      return 0
    }
  }

  /**
   * Info screen media grid for a channel (Medien / Dateien / Links).
   */
  async listChannelMedia(
    userId: string,
    clubId: string,
    channelId: string,
    tab: ChatMediaTab,
  ): Promise<ChatMediaItem[]> {
    await this.assertClubChannel(userId, clubId, channelId)
    const rows = await this.prisma.message.findMany({
      where: { channelId, deletedAt: null, ...(chatMediaWhere(tab) as Prisma.MessageWhereInput) },
      select: {
        id: true,
        messageType: true,
        attachmentUrl: true,
        attachmentMeta: true,
        content: true,
        createdAt: true,
        sender: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: CHAT_MEDIA_PAGE,
    })
    return toChatMediaItems(rows ?? [], tab)
  }

  /**
   * REST path for posting a message to a channel. Used by home-screen
   * components (e.g. AnnounceSheet) that don't hold a Socket.io connection.
   * Socket clients in the Chat tab will see the message on their next poll /
   * history reload — the live socket emit path still handles real-time chat.
   */
  async postMessage(
    clubId: string,
    channelId: string,
    content: string,
    userId: string,
  ): Promise<{ id: string }> {
    const trimmed = content?.trim()
    if (!trimmed || trimmed.length > 4000) {
      throw new ForbiddenException('Invalid message content')
    }

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    })
    if (!channel || channel.clubId !== clubId) {
      throw new NotFoundException('Channel not found')
    }

    // Reuse existing write-auth logic (checks membership + channel visibility)
    await this.assertWritable(userId, channelId)

    // teamId is required on Message; club-level channels have teamId null —
    // for club-level channels look up any team in the club as the anchor,
    // or use a sentinel. Prisma schema requires teamId so we must provide one
    // from the channel row.
    if (!channel.teamId) {
      // Club-level channel: only club members can post (validated by assertWritable).
      // We need a teamId — use a placeholder from the club's first team.
      const firstTeam = await this.prisma.team.findFirst({
        where: { clubId },
        select: { id: true },
      })
      if (!firstTeam) throw new NotFoundException('No team found in club')
      const message = await this.prisma.message.create({
        data: {
          teamId: firstTeam.id,
          clubId,
          channelId,
          senderId: userId,
          content: trimmed,
          // H1: only an ANNOUNCEMENTS channel produces an announcement (and
          // its club-wide push); a club-news post is a normal message.
          isAnnouncement: channel.kind === 'ANNOUNCEMENTS',
        },
      })
      this.eventEmitter.emit('channel.message.created', {
        message,
        channelId,
        clubId,
        teamId: null,
      })
      return { id: message.id }
    }

    const message = await this.prisma.message.create({
      data: {
        teamId: channel.teamId,
        clubId,
        channelId,
        senderId: userId,
        content: trimmed,
        isAnnouncement: channel.kind === 'ANNOUNCEMENTS',
      },
    })
    this.eventEmitter.emit('channel.message.created', {
      message,
      channelId,
      clubId,
      teamId: channel.teamId,
    })
    return { id: message.id }
  }

  /**
   * Posts a SYSTEM message to a team's ANNOUNCEMENTS channel.
   * Used for automated events like member join notifications.
   * Skips permission checks — callers are trusted internal services.
   */
  async postSystemMessage(clubId: string, teamId: string, content: string): Promise<void> {
    await this.ensureTeamChannels(clubId, teamId)

    const channel = await this.prisma.channel.findFirst({
      where: { clubId, teamId, kind: 'ANNOUNCEMENTS' },
    })
    if (!channel) return

    const message = await this.prisma.message.create({
      data: {
        clubId,
        teamId,
        channelId: channel.id,
        senderId: null,
        content: content.trim().slice(0, 200),
        messageType: 'SYSTEM',
        isAnnouncement: false,
      },
    })

    this.eventEmitter.emit('channel.message.created', {
      message,
      channelId: channel.id,
      clubId,
      teamId,
    })
  }

  /**
   * Channel info → members. Returns the channel's eligible team audience
   * (the candidate roster) each tagged `isMember`. Caller must be able to
   * READ the channel.
   *
   * For CUSTOM channels `isMember` = has a ChannelMember row (the explicit,
   * manager-managed set). For default channels every user in the visible
   * audience is a member (role-derived, auto-managed).
   */
  async listMembers(
    userId: string,
    teamId: string,
    channelId: string,
  ): Promise<
    Array<{
      userId: string
      name: string
      email: string | null
      avatarUrl: string | null
      role: string
      isMember: boolean
    }>
  > {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, teamId },
      select: { id: true, kind: true, visibility: true, clubId: true },
    })
    if (!channel) throw new NotFoundException('Channel not found')

    // Caller must be able to read the channel.
    const access = { ...(await this.teamsService.assertReadableAccess(userId, teamId)), teamScoped: true }
    if (channel.kind === 'CUSTOM') {
      const callerMember = await this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
        select: { id: true },
      })
      if (!callerMember) {
        throw new ForbiddenException('You cannot view this channel')
      }
    } else if (!this.userMayRead(channel.visibility as ChannelVisibility, access)) {
      throw new ForbiddenException('You cannot view this channel')
    }

    const roster = await this.teamRoster(teamId, channel.clubId)
    const isManager = this.isCoach(access) || this.isAdmin(access)

    if (channel.kind === 'CUSTOM') {
      const memberRows = await this.prisma.channelMember.findMany({
        where: { channelId },
        select: { userId: true },
      })
      const memberSet = new Set(memberRows.map((m) => m.userId))
      const withFlags = roster.map((r) => ({
        userId: r.userId,
        name: r.name,
        email: r.email,
        avatarUrl: r.avatarUrl,
        role: r.role,
        membershipRole: r.membershipRole,
        isMember: memberSet.has(r.userId),
      }))
      // Managers get the full candidate roster (for the add-member picker).
      // Regular members of a private group only see the actual members, and
      // never the team's email addresses (PII — a private subset must not let
      // a rank-and-file member enumerate every teammate's email).
      if (isManager) return withFlags
      return withFlags.filter((r) => r.isMember).map((r) => ({ ...r, email: null }))
    }

    // Default channels: membership is role-derived. Every user in the
    // visible audience is a member. Non-managers don't get email addresses.
    return roster.map((r) => ({
      userId: r.userId,
      name: r.name,
      avatarUrl: r.avatarUrl,
      role: r.role,
      membershipRole: r.membershipRole,
      email: isManager ? r.email : null,
      isMember: this.userMayRead(channel.visibility as ChannelVisibility, {
        membership: r.membershipRole ? { role: r.membershipRole } : null,
        activeTeamAccess: [{ role: r.role, phase: r.phase }],
      }),
    }))
  }

  /**
   * The candidate roster for a team: every active team member with their
   * user profile and club membership role. Source shared by member listing.
   */
  private async teamRoster(
    teamId: string,
    clubId: string,
  ): Promise<
    Array<{
      userId: string
      name: string
      email: string | null
      avatarUrl: string | null
      role: string
      phase: string
      membershipRole: string | null
    }>
  > {
    const teamMembers = await this.prisma.teamAccess.findMany({
      where: { teamId, ...activeTeamAccessWhere(), user: launchClubParticipantWhere(clubId) },
      select: {
        userId: true,
        role: true,
        phase: true,
        user: { select: { name: true, email: true, avatarUrl: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
    })
    const userIds = Array.from(new Set(teamMembers.map((m) => m.userId)))
    const memberships =
      userIds.length > 0
        ? await this.prisma.membership.findMany({
            where: { userId: { in: userIds }, clubId },
            select: { userId: true, role: true },
          })
        : []
    const membershipByUser = new Map(memberships.map((m) => [m.userId, m.role]))

    // Dedupe by user — a user can hold multiple TeamAccess rows.
    const seen = new Set<string>()
    const roster: Array<{
      userId: string
      name: string
      email: string | null
      avatarUrl: string | null
      role: string
      phase: string
      membershipRole: string | null
    }> = []
    for (const m of teamMembers) {
      if (seen.has(m.userId)) continue
      seen.add(m.userId)
      roster.push({
        userId: m.userId,
        name: m.user?.name ?? 'Unknown',
        email: m.user?.email ?? null,
        avatarUrl: m.user?.avatarUrl ?? null,
        role: m.role,
        phase: m.phase,
        membershipRole: membershipByUser.get(m.userId) ?? null,
      })
    }
    return roster
  }

  async assertWritable(userId: string, channelId: string): Promise<void> {
    const result = await this.getChannelAccess(userId, channelId)
    if (!result.canWrite) throw new ForbiddenException('You cannot post to this channel')
  }

  /**
   * Resolve the userIds of every team member who is allowed to read
   * `channelId`. Used by chat fan-out (REST media post, push) so a
   * Coaches-only message doesn't push-notify parents/players.
   *
   * For MEMBERS-visibility channels this is every team member; for
   * COACHES_ONLY/PARENTS_ONLY/ADMINS_ONLY it filters by Membership role
   * and TeamAccess. With `excludeMuted`, readers with an active channel mute
   * are dropped (push fan-out); inbox updates use the full set.
   */
  async listChannelReaderIds(
    teamId: string,
    channelId: string,
    opts: { excludeMuted?: boolean } = {},
  ): Promise<string[]> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { clubId: true },
    })
    if (!team) return []
    const channel = await this.prisma.channel.findFirst({
      where: {
        id: channelId,
        OR: [{ teamId }, { teamId: null, clubId: team.clubId }],
      },
      select: { id: true, visibility: true, kind: true, teamId: true, clubId: true },
    })
    if (!channel) return []
    const readers = await this.readersFor(channel)
    return opts.excludeMuted ? this.withoutMuted(channel.id, readers) : readers
  }

  /** Same as listChannelReaderIds, keyed by the channel alone. */
  async listReadersForChannel(
    channelId: string,
    opts: { excludeMuted?: boolean } = {},
  ): Promise<string[]> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, visibility: true, kind: true, teamId: true, clubId: true },
    })
    if (!channel) return []
    const readers = await this.readersFor(channel)
    return opts.excludeMuted ? this.withoutMuted(channel.id, readers) : readers
  }

  /** Drop users with an active mute on this channel. */
  async withoutMuted(channelId: string, userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return userIds
    const rows = await this.prisma.channelMember.findMany({
      where: { channelId, userId: { in: userIds }, muted: true },
      select: { userId: true, muted: true, mutedUntil: true },
    })
    const now = new Date()
    const muted = new Set(
      (rows ?? []).filter((r) => isMuteActive(r, now)).map((r) => r.userId),
    )
    return userIds.filter((id) => !muted.has(id))
  }

  private async readersFor(channel: {
    id: string
    visibility: string
    kind: string
    teamId: string | null
    clubId: string
  }): Promise<string[]> {
    // CUSTOM channels: readers are exactly the explicit ChannelMember set,
    // independent of team role. Fan-out (push) must not leak to the audience.
    if ((channel.kind as ChannelKind) === 'CUSTOM') {
      const members = await this.prisma.channelMember.findMany({
        where: { channelId: channel.id },
        select: { userId: true },
      })
      return Array.from(new Set(members.map((m) => m.userId)))
    }

    const visibility = channel.visibility as ChannelVisibility

    const teamMembers = await this.prisma.teamAccess.findMany({
      where: channel.teamId
        ? { teamId: channel.teamId, ...activeTeamAccessWhere() }
        : { clubId: channel.clubId, ...activeTeamAccessWhere() },
      select: { userId: true, role: true, phase: true, clubId: true },
    })

    const clubMemberships = channel.teamId
      ? await this.prisma.membership.findMany({
          where: {
            userId: { in: Array.from(new Set(teamMembers.map((m) => m.userId))) },
            clubId: channel.clubId,
          },
          select: { userId: true, role: true },
        })
      : await this.prisma.membership.findMany({
          where: { clubId: channel.clubId },
          select: { userId: true, role: true },
        })
    const userIds = Array.from(
      new Set([
        ...teamMembers.map((member) => member.userId),
        ...clubMemberships.map((m) => m.userId),
      ]),
    )
    if (userIds.length === 0) return []

    if (visibility === 'MEMBERS') {
      return userIds
    }

    const membershipByUser = new Map(clubMemberships.map((m) => [m.userId, m.role]))
    const accessByUser = new Map<string, Array<{ role: string; phase?: string | null }>>()
    for (const m of teamMembers) {
      const list = accessByUser.get(m.userId) ?? []
      list.push({ role: m.role, phase: m.phase })
      accessByUser.set(m.userId, list)
    }

    return userIds.filter((userId) => {
      const access = {
        membership: membershipByUser.has(userId) ? { role: membershipByUser.get(userId)! } : null,
        activeTeamAccess: accessByUser.get(userId) ?? [],
        teamScoped: Boolean(channel.teamId),
      }
      return this.userMayRead(visibility, access)
    })
  }

  /** Coach/admin of the team or a club manager — may announce. */
  isManagerAccess(access: AccessCtx): boolean {
    return this.isCoach(access) || this.isAdmin(access)
  }

  private userMayRead(visibility: ChannelVisibility, access: AccessCtx): boolean {
    if (visibility === 'MEMBERS') return true
    if (visibility === 'COACHES_ONLY') return this.isCoach(access)
    // Eltern channel: the parents plus the team's coaches/club managers, so
    // the Trainerteam can actually answer the parents.
    if (visibility === 'PARENTS_ONLY') return LAUNCH_FEATURES.youthParticipation && (this.isParent(access) || this.isCoach(access))
    if (visibility === 'ADMINS_ONLY') return this.isAdmin(access)
    return false
  }

  /**
   * Write rule per channel. Visibility gates read first. Then:
   *  - CLUB_NEWS: club OWNER/ADMIN only (H1: it was writable by everyone).
   *  - club-level ANNOUNCEMENTS: club OWNER/ADMIN only (M4).
   *  - team ANNOUNCEMENTS: that team's head/assistant coaches or club admins
   *    (a club-level COACH role is not staff of every team).
   */
  private userMayWrite(
    channel: { kind: string; visibility: string; teamId: string | null },
    access: AccessCtx,
  ): boolean {
    if (!this.userMayRead(channel.visibility as ChannelVisibility, access)) return false
    const kind = channel.kind as ChannelKind
    if (kind === 'CLUB_NEWS') return this.isAdmin(access)
    if (kind === 'ANNOUNCEMENTS') {
      return channel.teamId ? this.isTeamStaff(access) : this.isAdmin(access)
    }
    return true
  }

  /**
   * Staff of the team whose (team-scoped) access context this is: club
   * OWNER/ADMIN or a FULL active head/assistant coach of that team. A
   * club-level COACH role or TRIAL assignment alone does not count.
   */
  private isTeamStaff(access: AccessCtx): boolean {
    if (this.isAdmin(access)) return true
    return access.activeTeamAccess.some(
      (entry) =>
        entry.phase === 'FULL' &&
        (entry.role === 'HEAD_COACH' || entry.role === 'ASSISTANT_COACH'),
    )
  }

  private isCoach(access: {
    membership?: { role: string } | null
    activeTeamAccess: Array<{ role: string; phase?: string | null }>
    teamScoped?: boolean
  }): boolean {
    if (access.membership?.role === 'OWNER' || access.membership?.role === 'ADMIN') {
      return true
    }
    return access.activeTeamAccess.some(
      (entry) =>
        entry.phase === 'FULL' &&
        (entry.role === 'HEAD_COACH' || entry.role === 'ASSISTANT_COACH'),
    )
  }

  private isParent(access: {
    membership?: { role: string } | null
    activeTeamAccess: Array<{ role: string }>
  }): boolean {
    return (
      access.membership?.role === 'PARENT' ||
      access.activeTeamAccess.some((entry) => entry.role === 'PARENT')
    )
  }

  private isAdmin(access: { membership?: { role: string } | null }): boolean {
    return access.membership?.role === 'OWNER' || access.membership?.role === 'ADMIN'
  }
}

const EPOCH = new Date(0)

function previewFor(content: string, type: string): string {
  if (type === 'VOICE') return 'Voice note'
  if (type === 'IMAGE') return 'Photo'
  if (type === 'VIDEO') return 'Video'
  if (type === 'FILE') return 'File'
  if (type === 'POLL') return 'Poll'
  if (type === 'RSVP_POLL') return 'RSVP poll'
  if (type === 'LINEUP') return 'Lineup'
  return content.slice(0, 80)
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'group'
  )
}

const CHANNEL_ROW_INCLUDE = {
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: { sender: { select: { name: true } } },
  },
  team: { select: { displayName: true, name: true, ageGroup: true } },
}

type ChannelRow = {
  id: string
  clubId: string
  teamId: string | null
  slug: string
  kind: string
  name: string
  description: string | null
  visibility: string
  createdAt: Date
  updatedAt: Date
  messages?: Array<{
    id: string
    senderId: string | null
    content: string
    messageType: string
    createdAt: Date
    sender?: { name: string | null } | null
  }>
  team?: { displayName: string | null; name: string; ageGroup: string | null } | null
}

function stripDecoration(channel: DecoratedChannel): SharedChannel {
  const {
    teamName: _teamName,
    muted: _muted,
    mutedUntil: _mutedUntil,
    lastMessageRaw: _raw,
    ...rest
  } = channel
  void _teamName
  void _muted
  void _mutedUntil
  void _raw
  return rest
}
