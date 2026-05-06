import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  Channel as SharedChannel,
  ChannelKind,
  ChannelVisibility,
  MessageType,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { TeamsService } from '../teams/teams.service'

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
]

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
  ) {}

  /**
   * Idempotent provisioning. Safe to call from team / club bootstrap or
   * on first access — uses Channel's (clubId, teamId, slug) unique key.
   */
  async ensureTeamChannels(clubId: string, teamId: string): Promise<void> {
    for (const seed of TEAM_CHANNEL_SEEDS) {
      // Overwrite kind + visibility on every call so corrections to the
      // seed table (e.g. tightening Coaches from MEMBERS to COACHES_ONLY)
      // actually propagate into pre-existing rows.
      await this.prisma.channel.upsert({
        where: {
          clubId_teamId_slug: { clubId, teamId, slug: seed.slug },
        },
        create: {
          clubId,
          teamId,
          slug: seed.slug,
          kind: seed.kind,
          name: seed.name,
          visibility: seed.visibility,
        },
        update: {
          kind: seed.kind,
          visibility: seed.visibility,
        },
      })
    }
  }

  async ensureClubChannels(clubId: string): Promise<void> {
    for (const seed of CLUB_CHANNEL_SEEDS) {
      await this.prisma.channel.upsert({
        where: {
          clubId_teamId_slug: { clubId, teamId: null as any, slug: seed.slug },
        },
        create: {
          clubId,
          teamId: null,
          slug: seed.slug,
          kind: seed.kind,
          name: seed.name,
          visibility: seed.visibility,
        },
        update: {},
      })
    }
  }

  async listForUser(userId: string, teamId: string): Promise<SharedChannel[]> {
    const access = await this.teamsService.assertReadableAccess(userId, teamId)
    await this.ensureTeamChannels(access.team.clubId, teamId)
    await this.ensureClubChannels(access.team.clubId)

    const channels = await this.prisma.channel.findMany({
      where: {
        OR: [
          { teamId },
          { clubId: access.team.clubId, teamId: null },
        ],
      },
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { name: true } } },
        },
      },
      orderBy: [{ teamId: 'desc' }, { kind: 'asc' }],
    })

    const visible = channels.filter((c: any) =>
      this.userMayRead(c.visibility as ChannelVisibility, access),
    )

    // Read receipts to compute unread.
    const channelIds = visible.map((c: any) => c.id as string)
    let readMessageIdsByChannel = new Map<string, Set<string>>()
    if (channelIds.length > 0) {
      const reads = await this.prisma.messageReadReceipt.findMany({
        where: {
          userId,
          message: { channelId: { in: channelIds } },
        },
        select: { messageId: true, message: { select: { channelId: true } } },
      })
      readMessageIdsByChannel = reads.reduce((acc: Map<string, Set<string>>, r: any) => {
        const cid = r.message.channelId as string
        const set = acc.get(cid) || new Set<string>()
        set.add(r.messageId)
        acc.set(cid, set)
        return acc
      }, new Map())
    }

    // Unread: count messages newer than the user's earliest unread receipt is
    // expensive; for v1 we count messages in channel where user has no
    // receipt and sender is not user.
    const unreadByChannel = new Map<string, number>()
    if (channelIds.length > 0) {
      const counts = await this.prisma.$queryRawUnsafe<
        Array<{ channelId: string; count: number }>
      >(
        `SELECT m."channelId", COUNT(*)::int AS count
         FROM "Message" m
         LEFT JOIN "MessageReadReceipt" r
           ON r."messageId" = m."id" AND r."userId" = $1
         WHERE m."channelId" = ANY($2)
           AND m."deletedAt" IS NULL
           AND m."senderId" <> $1
           AND r."id" IS NULL
         GROUP BY m."channelId"`,
        userId,
        channelIds,
      )
      for (const row of counts) unreadByChannel.set(row.channelId, row.count)
    }

    return visible.map((c: any) => {
      const last = c.messages?.[0]
      void readMessageIdsByChannel // suppress unused
      return {
        id: c.id,
        clubId: c.clubId,
        teamId: c.teamId,
        slug: c.slug,
        kind: c.kind as ChannelKind,
        name: c.name,
        description: c.description,
        visibility: c.visibility as ChannelVisibility,
        canWrite: this.userMayWrite(
          c.kind as ChannelKind,
          c.visibility as ChannelVisibility,
          access,
        ),
        unreadCount: unreadByChannel.get(c.id) ?? 0,
        lastMessage: last
          ? {
              id: last.id,
              senderName: last.sender.name,
              contentPreview: previewFor(last.content, last.messageType),
              messageType: last.messageType as MessageType,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }
    })
  }

  /**
   * Create a custom group chat channel. Admins/owners only — players or
   * coaches can ask an admin to create one. Channel is club-scoped and
   * may include members from any team within the club (the ChannelMember
   * pivot is a future addition; for v1 the channel is simply visible to
   * any club member who has its slug, like WhatsApp groups by id).
   */
  async createCustomChannel(
    userId: string,
    input: { clubId: string; name: string; description?: string; teamId?: string },
  ): Promise<SharedChannel> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, clubId: input.clubId },
    })
    if (!membership) {
      throw new ForbiddenException('Not a club member')
    }
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN' && membership.role !== 'COACH') {
      throw new ForbiddenException('Only club admins or coaches can create groups')
    }

    const slug = slugify(input.name)
    const channel = await this.prisma.channel.create({
      data: {
        clubId: input.clubId,
        teamId: input.teamId ?? null,
        slug: `group-${slug}-${Date.now().toString(36)}`,
        kind: 'CUSTOM',
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        visibility: 'MEMBERS',
      },
    })

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

  async assertWritable(userId: string, channelId: string): Promise<void> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } })
    if (!channel) throw new NotFoundException('Channel not found')
    if (!channel.teamId) {
      // Club-level channel: only owner/admin can write
      const membership = await this.prisma.membership.findFirst({
        where: { userId, clubId: channel.clubId },
      })
      if (!membership) throw new ForbiddenException('Not a club member')
      if (
        channel.kind === 'CLUB_NEWS' &&
        membership.role !== 'OWNER' &&
        membership.role !== 'ADMIN'
      ) {
        throw new ForbiddenException('Only club admins post to club news')
      }
      return
    }
    const access = await this.teamsService.assertReadableAccess(userId, channel.teamId)
    if (
      !this.userMayWrite(
        channel.kind as ChannelKind,
        channel.visibility as ChannelVisibility,
        access,
      )
    ) {
      throw new ForbiddenException('You cannot post to this channel')
    }
  }

  private userMayRead(
    visibility: ChannelVisibility,
    access: { membership?: { role: string } | null; activeTeamAccess: Array<{ role: string }> },
  ): boolean {
    if (visibility === 'MEMBERS') return true
    if (visibility === 'COACHES_ONLY') return this.isCoach(access)
    if (visibility === 'PARENTS_ONLY') return this.isParent(access)
    if (visibility === 'ADMINS_ONLY') return this.isAdmin(access)
    return false
  }

  private userMayWrite(
    kind: ChannelKind,
    visibility: ChannelVisibility,
    access: { membership?: { role: string } | null; activeTeamAccess: Array<{ role: string }> },
  ): boolean {
    // Visibility gates read access — writers must be in the visible audience.
    if (!this.userMayRead(visibility, access)) return false
    // Announcements are coach/admin-only write.
    if (kind === 'ANNOUNCEMENTS') return this.isCoach(access)
    return true
  }

  private isCoach(access: {
    membership?: { role: string } | null
    activeTeamAccess: Array<{ role: string }>
  }): boolean {
    if (
      access.membership?.role === 'OWNER' ||
      access.membership?.role === 'ADMIN' ||
      access.membership?.role === 'COACH'
    ) {
      return true
    }
    return access.activeTeamAccess.some(
      (entry) => entry.role === 'HEAD_COACH' || entry.role === 'ASSISTANT_COACH',
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

  private isAdmin(access: {
    membership?: { role: string } | null
  }): boolean {
    return access.membership?.role === 'OWNER' || access.membership?.role === 'ADMIN'
  }
}

function previewFor(content: string, type: string): string {
  if (type === 'VOICE') return '🎙 Voice note'
  if (type === 'IMAGE') return '📷 Photo'
  if (type === 'VIDEO') return '🎬 Video'
  if (type === 'FILE') return '📎 File'
  if (type === 'POLL') return '📊 Poll'
  if (type === 'RSVP_POLL') return '📋 RSVP poll'
  if (type === 'LINEUP') return '🟢 Lineup'
  return content.slice(0, 80)
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "group"
}

