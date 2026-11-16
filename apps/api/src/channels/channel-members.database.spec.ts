import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { ChannelsService } from './channels.service'
import { InvitesService } from '../invites/invites.service'
import { PrismaService } from '../prisma/prisma.service'
import { createTenantMiddleware } from '../prisma/tenant.middleware'
import { tenantContext, getClubId } from '../prisma/tenant.context'
import { JoinRequestsService } from '../clubs/join-requests.service'

// Reuse the explicitly isolated local QA database. Never accept a remote URL.
const url = process.env.BILLING_TEST_DATABASE_URL
if (url) {
  const parsed = new URL(url)
  if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/anstoss_billing_test' || parsed.search) {
    throw new Error('Membership race tests require the dedicated localhost anstoss_billing_test database')
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

;(url ? describe : describe.skip)('private-room and invite serialization (real PostgreSQL)', () => {
  let db: PrismaClient
  let clubId: string
  let teamId: string
  let channelId: string
  let userIds: string[]
  let pauseCampaign: string | null = null
  let currentRead = deferred()
  let releaseRedemption = deferred()

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: url! } } })
    db.$use(createTenantMiddleware(getClubId) as Prisma.Middleware)
    db.$use(async (params, next) => {
      const result = await next(params)
      if (pauseCampaign && params.model === 'InviteCampaign' && params.action === 'findUnique' &&
        params.args.where.id === pauseCampaign) {
        pauseCampaign = null
        currentRead.resolve()
        await releaseRedemption.promise
      }
      return result
    })
    await db.$connect()
  })

  beforeEach(async () => {
    clubId = `membership-race-${randomUUID()}`
    userIds = ['owner', 'admin-a', 'admin-b', 'minor', 'entrant'].map((name) => `${clubId}-${name}`)
    await tenantContext.run({ clubId, userId: userIds[0] }, async () => {
      await db.user.createMany({ data: userIds.map((id, index) => ({
        id, email: `${id}@example.invalid`, name: id,
        dateOfBirth: new Date(index === 3 ? '2020-01-01' : '1990-01-01'),
      })) })
      await db.club.create({ data: { id: clubId, slug: clubId, name: 'Local membership race' } })
      const group = await db.teamGroup.create({ data: { clubId, type: 'YOUTH', displayName: 'Youth' } })
      const team = await db.team.create({ data: { clubId, groupId: group.id, name: 'U13', displayName: 'U13' } })
      teamId = team.id
      await db.membership.createMany({ data: userIds.slice(0, 4).map((userId, index) => ({
        userId, clubId, role: index === 0 ? 'OWNER' : index < 3 ? 'ADMIN' : 'PLAYER',
      })) })
      await db.teamAccess.createMany({ data: userIds.slice(0, 4).map((userId) => ({
        userId, clubId, teamId, role: 'PLAYER', status: 'ACTIVE',
      })) })
      const channel = await db.channel.create({ data: { clubId, teamId, kind: 'CUSTOM', name: 'Private', slug: 'private' } })
      channelId = channel.id
      await db.channelMember.createMany({ data: userIds.slice(0, 4).map((userId) => ({ channelId, userId })) })
    })
  })

  afterEach(async () => {
    pauseCampaign = null
    releaseRedemption.resolve()
    if (clubId) await db.club.deleteMany({ where: { id: clubId } })
    if (userIds?.length) await db.user.deleteMany({ where: { id: { in: userIds } } })
  })
  afterAll(async () => { await db?.$disconnect() })

  function channels() {
    // Team access is read from the real database; no fake membership state.
    const teams = { assertReadableAccess: async (userId: string, requestedTeamId: string) => {
      const membership = await db.membership.findUnique({ where: { userId_clubId: { userId, clubId } } })
      const activeTeamAccess = await db.teamAccess.findMany({ where: { userId, teamId: requestedTeamId, status: 'ACTIVE' } })
      if (!membership || !activeTeamAccess.length) throw new Error('No team access')
      return { membership, activeTeamAccess }
    } }
    return new ChannelsService(db as PrismaService, teams as never, { emit: jest.fn() } as never)
  }

  it.each(['remove', 'moderate', 'suspend'])('serializes concurrent supervisor remove / %s mutations', async (action) => tenantContext.run({ clubId, userId: userIds[0] }, async () => {
    const service = channels()
    const second = () => action === 'remove'
      ? service.removeChannelMember(userIds[0], clubId, channelId, userIds[2])
      : service.moderateChannelMember(userIds[0], clubId, channelId, userIds[2], action === 'suspend' ? 'suspend' : 'remove')
    const results = await Promise.allSettled([
      service.removeChannelMember(userIds[0], clubId, channelId, userIds[1]), second(),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason.message).toBe('GROUP_REMOVE_BREAKS_SAFEGUARD')
    const supervisors = await db.channelMember.count({ where: {
      channelId, userId: { in: userIds.slice(0, 3) }, removed: false, postingSuspended: false,
    } })
    expect(supervisors).toBe(2)
    expect(await db.channelMember.count({ where: { channelId, userId: userIds[3], removed: false } })).toBe(1)
  }))

  it('cannot reactivate a campaign when revocation overlaps redemption', async () => tenantContext.run({ clubId, userId: userIds[0] }, async () => {
    const campaign = await db.inviteCampaign.create({ data: {
      clubId, teamId, createdById: userIds[0], type: 'APPROVAL_REQUIRED', role: 'PLAYER',
      code: randomUUID(), maxUses: 10, expiresAt: new Date(Date.now() + 60_000),
    } })
    const service = new InvitesService(db as PrismaService, {} as never, {} as never)
    currentRead = deferred()
    releaseRedemption = deferred()
    pauseCampaign = campaign.id
    const redeem = service.redeemCampaign(campaign.code, userIds[4])
    await currentRead.promise
    let revokeFinished = false
    const revoke = service.revokeCampaign(clubId, campaign.id, userIds[0]).then((value) => {
      revokeFinished = true
      return value
    })
    try {
      // The redemption is deliberately paused after its status read while it
      // holds the actual PostgreSQL lock. Revocation must wait, not overwrite.
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(revokeFinished).toBe(false)
    } finally {
      releaseRedemption.resolve()
      await Promise.all([redeem, revoke])
    }
    expect(await db.inviteCampaign.findUnique({ where: { id: campaign.id } })).toMatchObject({
      status: 'REVOKED', useCount: 1,
    })
    await expect(service.redeemCampaign(campaign.code, userIds[1])).rejects.toThrow('Invite link is invalid or expired')
    expect(await db.inviteRedemption.count({ where: { campaignId: campaign.id } })).toBe(1)
  }))

  it('joins through a coach campaign with optional profile fields empty, only after admin approval', async () => tenantContext.run({ clubId, userId: userIds[0] }, async () => {
    const campaign = await db.inviteCampaign.create({ data: {
      clubId, teamId, createdById: userIds[0], type: 'APPROVAL_REQUIRED', role: 'ASSISTANT_COACH',
      code: randomUUID(), maxUses: 10, expiresAt: new Date(Date.now() + 60_000),
    } })
    const invites = new InvitesService(db as PrismaService, {} as never, {} as never)
    await expect(invites.redeemCampaign(campaign.code, userIds[4])).resolves.toEqual({
      status: 'PENDING', clubId, teamId,
    })
    expect(await db.membership.count({ where: { clubId, userId: userIds[4] } })).toBe(0)
    expect(await db.teamAccess.count({ where: { clubId, userId: userIds[4] } })).toBe(0)
    const request = await db.joinRequest.findUniqueOrThrow({ where: { clubId_userId: { clubId, userId: userIds[4] } } })
    expect(request).toMatchObject({
      status: 'PENDING', role: 'ASSISTANT_COACH', phone: null, street: null,
      postalCode: null, city: null, nationality: null, previousClubName: null,
    })
    const push = { sendToUserLocalized: jest.fn().mockResolvedValue(undefined) }
    const joins = new JoinRequestsService(db as PrismaService, {} as never, push as never, {} as never)
    await expect(joins.approve(clubId, request.id, userIds[0], { revision: request.revision })).resolves.toEqual({ status: 'APPROVED' })
    expect(await db.membership.findUnique({ where: { userId_clubId: { userId: userIds[4], clubId } } })).toMatchObject({ role: 'COACH' })
    expect(await db.teamAccess.findMany({ where: { clubId, userId: userIds[4] } })).toEqual([
      expect.objectContaining({ teamId, role: 'ASSISTANT_COACH', phase: 'FULL', status: 'ACTIVE' }),
    ])
    expect(await db.teamMember.count({ where: { teamId, userId: userIds[4] } })).toBe(0)
  }))

  it('orders closing with in-flight writes, then hides the group and rejects new writes', async () => tenantContext.run({ clubId, userId: userIds[0] }, async () => {
    const service = channels()
    const writing = deferred()
    const releaseWrite = deferred()
    const post = service.withOpenChannel(channelId, async (tx) => {
      writing.resolve()
      await releaseWrite.promise
      return tx.message.create({ data: {
        clubId, teamId, channelId, senderId: userIds[0], content: 'Before close',
      } })
    }, { userId: userIds[0] })
    await writing.promise
    let closed = false
    const close = service.closeChannel(userIds[0], clubId, channelId).then((result) => {
      closed = true
      return result
    })
    try {
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(closed).toBe(false)
    } finally {
      releaseWrite.resolve()
      await Promise.all([post, close])
    }
    const write = jest.fn()
    await expect(service.withOpenChannel(channelId, write, { userId: userIds[0] })).rejects.toThrow('This group is closed')
    expect(write).not.toHaveBeenCalled()
    expect(await db.message.count({ where: { channelId } })).toBe(1)
    for (const userId of userIds.slice(0, 4)) {
      expect(await service.getChannelAccess(userId, channelId)).toMatchObject({ canRead: false, canWrite: false, isManager: false })
      expect((await service.listInboxChannels(userId, clubId)).find((channel) => channel.id === channelId)).toBeUndefined()
      await expect(service.listMembers(userId, teamId, channelId)).rejects.toThrow('You cannot view this channel')
    }
    expect(await service.listReadersForChannel(channelId)).toEqual([])
  }))
})
