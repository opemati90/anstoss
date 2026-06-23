import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
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
  { slug: 'announcements', kind: 'ANNOUNCEMENTS', name: 'Announcements', visibility: 'MEMBERS' },
]

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly eventEmitter: EventEmitter2,
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

  /**
   * Manager-gated provisioning entrypoint for the team-creation flow.
   * Verifies the caller is a club manager (OWNER/ADMIN/COACH) of the
   * team's club before seeding channels — without this, any authenticated
   * user could provision channels for an arbitrary teamId.
   */
  async provisionTeamChannels(
    userId: string,
    teamId: string,
  ): Promise<{ provisioned: number }> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { clubId: true },
    })
    if (!team) return { provisioned: 0 }

    const membership = await this.prisma.membership.findFirst({
      where: { userId, clubId: team.clubId },
      select: { role: true },
    })
    if (
      !membership ||
      (membership.role !== 'OWNER' &&
        membership.role !== 'ADMIN' &&
        membership.role !== 'COACH')
    ) {
      throw new ForbiddenException(
        'Only club admins or coaches can provision channels',
      )
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
    const membership = await this.prisma.membership.findFirst({
      where: { userId, clubId },
      select: { role: true },
    })
    if (!membership) throw new ForbiddenException('Not a club member')

    await this.ensureClubChannels(clubId)

    const channels = await this.prisma.channel.findMany({
      where: { clubId, teamId: null },
      orderBy: { kind: 'asc' },
    })

    return channels.map((c) => ({
      id: c.id,
      clubId: c.clubId,
      teamId: c.teamId,
      slug: c.slug,
      kind: c.kind as ChannelKind,
      name: c.name,
      description: c.description,
      visibility: c.visibility as ChannelVisibility,
      canWrite:
        membership.role === 'OWNER' ||
        membership.role === 'ADMIN' ||
        membership.role === 'COACH',
      unreadCount: 0,
      lastMessage: null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }))
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

    // CUSTOM channels are scoped to their explicit ChannelMember set — load
    // this user's memberships so a CUSTOM channel only appears for its members,
    // not for anyone in the team's role-derived audience.
    const customChannelIds = channels
      .filter((c: any) => (c.kind as ChannelKind) === 'CUSTOM')
      .map((c: any) => c.id as string)
    let customMemberOf = new Set<string>()
    if (customChannelIds.length > 0) {
      const rows = await this.prisma.channelMember.findMany({
        where: { userId, channelId: { in: customChannelIds } },
        select: { channelId: true },
      })
      customMemberOf = new Set(rows.map((r) => r.channelId))
    }

    const visible = channels.filter((c: any) => {
      if ((c.kind as ChannelKind) === 'CUSTOM') {
        return customMemberOf.has(c.id as string)
      }
      return this.userMayRead(c.visibility as ChannelVisibility, access)
    })

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
           AND (m."senderId" IS NULL OR m."senderId" <> $1)
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
        canWrite:
          (c.kind as ChannelKind) === 'CUSTOM'
            ? customMemberOf.has(c.id as string)
            : this.userMayWrite(
                c.kind as ChannelKind,
                c.visibility as ChannelVisibility,
                access,
              ),
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

    // Validate that the supplied teamId actually belongs to this club so a
    // caller with OWNER role in club A can't attach a channel to team B.
    if (input.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: input.teamId },
        select: { clubId: true },
      })
      if (!team || team.clubId !== input.clubId) {
        throw new ForbiddenException('Team does not belong to this club')
      }
    }

    const slug = slugify(input.name)
    // Create the channel and seed the creator's membership atomically. A CUSTOM
    // channel with no ChannelMember rows is invisible to everyone (listForUser
    // filters CUSTOM by membership), so a partial write here would orphan the
    // group — the exact "I created it but can't find it" failure. The
    // transaction guarantees either both rows land or neither does.
    const channel = await this.prisma.$transaction(async (tx) => {
      const created = await tx.channel.create({
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
      await tx.channelMember.create({
        data: { channelId: created.id, userId },
      })
      return created
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
          isAnnouncement: true,
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
    const access = await this.teamsService.assertReadableAccess(userId, teamId)
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
        ...r,
        isMember: memberSet.has(r.userId),
      }))
      // Managers get the full candidate roster (for the add-member picker).
      // Regular members of a private group only see the actual members, and
      // never the team's email addresses (PII — a private subset must not let
      // a rank-and-file member enumerate every teammate's email).
      if (isManager) return withFlags
      return withFlags
        .filter((r) => r.isMember)
        .map((r) => ({ ...r, email: null }))
    }

    // Default channels: membership is role-derived. Every user in the
    // visible audience is a member. Non-managers don't get email addresses.
    return roster.map((r) => ({
      ...r,
      email: isManager ? r.email : null,
      isMember: this.userMayRead(channel.visibility as ChannelVisibility, {
        membership: r.membershipRole ? { role: r.membershipRole } : null,
        activeTeamAccess: [{ role: r.role }],
      }),
    }))
  }

  /**
   * Add a user to a CUSTOM channel. Manager-only (coach/admin). Default
   * channels are auto-managed and reject add. Target must belong to the
   * club/team.
   */
  async addMember(
    userId: string,
    teamId: string,
    channelId: string,
    targetUserId: string,
  ): Promise<{ added: boolean }> {
    const channel = await this.requireCustomChannel(teamId, channelId)
    const access = await this.teamsService.assertReadableAccess(userId, teamId)
    if (!this.isCoach(access) && !this.isAdmin(access)) {
      throw new ForbiddenException('Only managers can add members')
    }

    // Target must be a member of this team (or its club).
    const targetAccess = await this.prisma.teamAccess.findFirst({
      where: { teamId, userId: targetUserId, status: 'ACTIVE' },
      select: { id: true },
    })
    const targetMembership = targetAccess
      ? true
      : await this.prisma.membership.findFirst({
          where: { userId: targetUserId, clubId: channel.clubId },
          select: { id: true },
        })
    if (!targetAccess && !targetMembership) {
      throw new BadRequestException('User is not a member of this club')
    }

    await this.prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId: targetUserId } },
      create: { channelId, userId: targetUserId },
      update: {},
    })
    return { added: true }
  }

  /**
   * Remove a user from a CUSTOM channel. Allowed if caller is a manager OR
   * is removing themselves (self-leave).
   */
  async removeMember(
    userId: string,
    teamId: string,
    channelId: string,
    targetUserId: string,
  ): Promise<{ removed: boolean }> {
    await this.requireCustomChannel(teamId, channelId)
    if (userId !== targetUserId) {
      const access = await this.teamsService.assertReadableAccess(userId, teamId)
      if (!this.isCoach(access) && !this.isAdmin(access)) {
        throw new ForbiddenException('Only managers can remove members')
      }
    }

    await this.prisma.channelMember.deleteMany({
      where: { channelId, userId: targetUserId },
    })
    return { removed: true }
  }

  private async requireCustomChannel(teamId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, teamId },
      select: { id: true, kind: true, clubId: true },
    })
    if (!channel) throw new NotFoundException('Channel not found')
    if (channel.kind !== 'CUSTOM') {
      throw new BadRequestException(
        'Members are auto-managed for this channel',
      )
    }
    return channel
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
      membershipRole: string | null
    }>
  > {
    const teamMembers = await this.prisma.teamAccess.findMany({
      where: { teamId, status: 'ACTIVE' },
      select: {
        userId: true,
        role: true,
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
        membershipRole: membershipByUser.get(m.userId) ?? null,
      })
    }
    return roster
  }

  async assertWritable(userId: string, channelId: string): Promise<void> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } })
    if (!channel) throw new NotFoundException('Channel not found')
    // CUSTOM channels (team- or club-scoped) are gated solely by the
    // ChannelMember set — bypass the role-derived visibility logic.
    if (channel.kind === 'CUSTOM') {
      const member = await this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
        select: { id: true },
      })
      if (!member) throw new ForbiddenException('You cannot post to this channel')
      return
    }
    if (!channel.teamId) {
      // Club-level channel: only owner/admin can write
      const membership = await this.prisma.membership.findFirst({
        where: { userId, clubId: channel.clubId },
      })
      if (!membership) throw new ForbiddenException('Not a club member')
      const isManager =
        membership.role === 'OWNER' ||
        membership.role === 'ADMIN' ||
        membership.role === 'COACH'
      if (
        (channel.kind === 'CLUB_NEWS' || channel.kind === 'ANNOUNCEMENTS') &&
        !isManager
      ) {
        throw new ForbiddenException('Only club managers post to this channel')
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

  /**
   * Resolve the userIds of every team member who is allowed to read
   * `channelId`. Used by chat fan-out (REST media post, push) so a
   * Coaches-only message doesn't push-notify parents/players.
   *
   * For MEMBERS-visibility channels this is every team member; for
   * COACHES_ONLY/PARENTS_ONLY/ADMINS_ONLY it filters by Membership role
   * and TeamAccess. Returns the userIds in unspecified order.
   */
  async listChannelReaderIds(
    teamId: string,
    channelId: string,
  ): Promise<string[]> {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, teamId },
      select: { visibility: true, kind: true },
    })
    if (!channel) return []

    // CUSTOM channels: readers are exactly the explicit ChannelMember set,
    // independent of team role. Fan-out (push) must not leak to the audience.
    if ((channel.kind as ChannelKind) === 'CUSTOM') {
      const members = await this.prisma.channelMember.findMany({
        where: { channelId },
        select: { userId: true },
      })
      return Array.from(new Set(members.map((m) => m.userId)))
    }

    const visibility = channel.visibility as ChannelVisibility

    const teamMembers = await this.prisma.teamAccess.findMany({
      where: { teamId, status: 'ACTIVE' },
      select: { userId: true, role: true, clubId: true },
    })
    if (teamMembers.length === 0) return []

    if (visibility === 'MEMBERS') {
      return Array.from(new Set(teamMembers.map((m) => m.userId)))
    }

    const userIds = Array.from(new Set(teamMembers.map((m) => m.userId)))
    const memberships = await this.prisma.membership.findMany({
      where: {
        userId: { in: userIds },
        clubId: { in: Array.from(new Set(teamMembers.map((m) => m.clubId))) },
      },
      select: { userId: true, role: true },
    })
    const membershipByUser = new Map(memberships.map((m) => [m.userId, m.role]))
    const accessByUser = new Map<string, Array<{ role: string }>>()
    for (const m of teamMembers) {
      const list = accessByUser.get(m.userId) ?? []
      list.push({ role: m.role })
      accessByUser.set(m.userId, list)
    }

    return userIds.filter((userId) => {
      const access = {
        membership: membershipByUser.has(userId)
          ? { role: membershipByUser.get(userId)! }
          : null,
        activeTeamAccess: accessByUser.get(userId) ?? [],
      }
      return this.userMayRead(visibility, access)
    })
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

