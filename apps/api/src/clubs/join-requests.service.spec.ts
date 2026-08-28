import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { JoinRequestStatus, MembershipRole, TeamRole } from '@anstoss/shared'
import { JoinRequestsService } from './join-requests.service'

describe('JoinRequestsService.create', () => {
  function makeService() {
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      joinRequest: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      club: {
        findUnique: jest.fn().mockResolvedValue({ id: 'club-1', name: 'FC Test' }),
      },
      team: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      membership: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'admin-1' }]),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Mara' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      $transaction: jest.fn(),
    }
    prisma.$transaction.mockImplementation(async (callback: (client: typeof prisma) => unknown) =>
      callback(prisma),
    )
    const audit = { log: jest.fn().mockResolvedValue(undefined) }
    const push = { sendToUserLocalized: jest.fn().mockResolvedValue(undefined) }
    const cache = { get: jest.fn(), set: jest.fn() }
    const entitlements = { assertCanActivatePlayer: jest.fn().mockResolvedValue(undefined) }

    return {
      service: new JoinRequestsService(
        prisma as never,
        audit as never,
        push as never,
        cache as never,
        entitlements as never,
      ),
      prisma,
      audit,
      push,
    }
  }

  it('creates one pending player request and notifies club staff', async () => {
    const { service, prisma, push } = makeService()
    const request = {
      id: 'jr-1',
      clubId: 'club-1',
      userId: 'user-1',
      status: JoinRequestStatus.PENDING,
    }
    prisma.joinRequest.create.mockResolvedValue(request)

    await expect(
      service.create('user-1', 'club-1', { role: 'PLAYER', message: 'I want to join' }),
    ).resolves.toBe(request)

    expect(prisma.joinRequest.create).toHaveBeenCalledWith({
      data: {
        clubId: 'club-1',
        userId: 'user-1',
        role: 'PLAYER',
        teamId: null,
        message: 'I want to join',
        status: JoinRequestStatus.PENDING,
        reviewedBy: null,
        reviewedAt: null,
      },
    })
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
    expect(push.sendToUserLocalized).toHaveBeenCalledTimes(1)
  })

  it('does not create a request for an account deleted before the lifecycle lock', async () => {
    const { service, prisma } = makeService()
    prisma.user.findFirst.mockResolvedValue(null)

    await expect(
      service.create('user-1', 'club-1', { role: 'PLAYER' }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.joinRequest.create).not.toHaveBeenCalled()
  })

  it('accepts a team request only when the team belongs to the target club', async () => {
    const { service, prisma } = makeService()
    const request = {
      id: 'jr-1',
      clubId: 'club-1',
      userId: 'user-1',
      teamId: 'team-1',
      status: JoinRequestStatus.PENDING,
    }
    prisma.team.findFirst.mockResolvedValue({ id: 'team-1' })
    prisma.joinRequest.create.mockResolvedValue(request)

    await expect(
      service.create('user-1', 'club-1', { role: 'PLAYER', teamId: 'team-1' }),
    ).resolves.toBe(request)

    expect(prisma.team.findFirst).toHaveBeenCalledWith({
      where: { id: 'team-1', clubId: 'club-1' },
      select: { id: true },
    })
    expect(prisma.joinRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clubId: 'club-1',
        userId: 'user-1',
        teamId: 'team-1',
      }),
    })
  })

  it('rejects a team request when the team does not belong to the target club', async () => {
    const { service, prisma, push } = makeService()
    prisma.team.findFirst.mockResolvedValue(null)

    await expect(
      service.create('user-1', 'club-1', { role: 'PLAYER', teamId: 'other-team' }),
    ).rejects.toBeInstanceOf(BadRequestException)

    expect(prisma.joinRequest.create).not.toHaveBeenCalled()
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
    expect(push.sendToUserLocalized).not.toHaveBeenCalled()
  })

  it('maps a concurrent unique-create loser to 409 without side effects', async () => {
    const { service, prisma, push } = makeService()
    prisma.joinRequest.create.mockRejectedValue({ code: 'P2002' })

    await expect(
      service.create('user-1', 'club-1', { role: 'PLAYER', message: 'Again' }),
    ).rejects.toBeInstanceOf(ConflictException)

    expect(prisma.auditLog.create).not.toHaveBeenCalled()
    expect(prisma.membership.findMany).not.toHaveBeenCalled()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(push.sendToUserLocalized).not.toHaveBeenCalled()
  })

  it('increments the attempt revision when a withdrawn request is resubmitted', async () => {
    const { service, prisma } = makeService()
    prisma.joinRequest.findUnique.mockResolvedValue({
      id: 'jr-1',
      status: JoinRequestStatus.WITHDRAWN,
      revision: 2,
    })
    prisma.joinRequest.update.mockResolvedValue({
      id: 'jr-1',
      status: JoinRequestStatus.PENDING,
      revision: 3,
    })

    await service.create('user-1', 'club-1', { role: 'PLAYER', message: 'Try again' })

    expect(prisma.joinRequest.update).toHaveBeenCalledWith({
      where: { id: 'jr-1' },
      data: expect.objectContaining({ revision: { increment: 1 }, status: 'PENDING' }),
    })
  })

  it('rejects a request that is pending when re-read under the lifecycle lock', async () => {
    const { service, prisma, push } = makeService()
    prisma.joinRequest.findUnique.mockResolvedValue({
      id: 'jr-1',
      status: JoinRequestStatus.PENDING,
    })

    await expect(
      service.create('user-1', 'club-1', { role: 'PLAYER', message: 'Reopen' }),
    ).rejects.toBeInstanceOf(ConflictException)

    expect(prisma.joinRequest.updateMany).not.toHaveBeenCalled()
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
    expect(push.sendToUserLocalized).not.toHaveBeenCalled()
  })
})

describe('JoinRequestsService.sendReminder', () => {
  function makeReminderService() {
    const prisma = {
      joinRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'jr-1',
          club: { name: 'FC Test' },
        }),
      },
      membership: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'admin-1' }]),
      },
    }
    const audit = { log: jest.fn().mockResolvedValue(undefined) }
    const push = { sendToUserLocalized: jest.fn().mockResolvedValue(undefined) }
    const cache = {
      reserve: jest.fn().mockResolvedValue(true),
    }
    return {
      service: new JoinRequestsService(
        prisma as never,
        audit as never,
        push as never,
        cache as never,
      ),
      audit,
      push,
      cache,
    }
  }

  it('atomically reserves the cooldown so a concurrent reminder cannot duplicate delivery', async () => {
    const { service, cache, push } = makeReminderService()
    cache.reserve.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await service.sendReminder('user-1', 'club-1', 'jr-1')
    await expect(
      service.sendReminder('user-1', 'club-1', 'jr-1'),
    ).rejects.toBeInstanceOf(BadRequestException)

    expect(push.sendToUserLocalized).toHaveBeenCalledTimes(1)
  })

  it('keeps the reservation when fanout partially fails so retries cannot duplicate delivery', async () => {
    const { service, cache, push, audit } = makeReminderService()
    push.sendToUserLocalized.mockRejectedValueOnce(new Error('push offline'))

    await expect(
      service.sendReminder('user-1', 'club-1', 'jr-1'),
    ).rejects.toThrow('push offline')

    expect(cache.reserve).toHaveBeenCalledTimes(1)
    expect(audit.log).not.toHaveBeenCalled()
  })
})

describe('JoinRequestsService.withdraw', () => {
  function makeWithdrawalService(overrides?: { request?: { id: string } | null; count?: number }) {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ userId: 'reviewer-1', role: MembershipRole.ADMIN }]),
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      joinRequest: {
        findFirst: jest.fn().mockResolvedValue(overrides?.request === undefined ? { id: 'jr-1' } : overrides.request),
        updateMany: jest.fn().mockResolvedValue({ count: overrides?.count ?? 1 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    }
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    }
    return {
      tx,
      service: new JoinRequestsService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      ),
    }
  }

  it('lets only the requester atomically withdraw a pending request and audits it', async () => {
    const { service, tx } = makeWithdrawalService()

    await expect(service.withdraw('user-1', 'club-1', 'jr-1')).resolves.toEqual({
      withdrawn: true,
    })
    expect(tx.joinRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'jr-1', clubId: 'club-1', userId: 'user-1', status: 'PENDING' },
      select: { id: true },
    })
    expect(tx.joinRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'WITHDRAWN' }) }),
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'join_request.withdrawn' }) }),
    )
  })

  it('rejects a different requester, wrong club, or non-pending row without auditing', async () => {
    const { service, tx } = makeWithdrawalService({ request: null })
    await expect(service.withdraw('intruder', 'other-club', 'jr-1')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(tx.joinRequest.updateMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('does not audit when the row changes after the locked read', async () => {
    const { service, tx } = makeWithdrawalService({ count: 0 })
    await expect(service.withdraw('user-1', 'club-1', 'jr-1')).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
})

describe('JoinRequestsService.approve', () => {
  function makeService() {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ userId: 'reviewer-1', role: MembershipRole.ADMIN }]),
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      membership: { upsert: jest.fn().mockResolvedValue(undefined) },
      team: { findFirst: jest.fn().mockResolvedValue({ id: 'team-9' }) },
      teamAccess: { upsert: jest.fn().mockResolvedValue(undefined) },
      teamMember: { upsert: jest.fn().mockResolvedValue(undefined) },
      joinRequest: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    }
    const prisma = {
      joinRequest: tx.joinRequest,
      club: {
        findUnique: jest.fn().mockResolvedValue({ name: 'FC Test' }),
      },
      $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    }
    const audit = { log: jest.fn().mockResolvedValue(undefined) }
    const push = { sendToUserLocalized: jest.fn().mockResolvedValue(undefined) }
    const cache = { get: jest.fn(), set: jest.fn() }
    const entitlements = { assertCanActivatePlayer: jest.fn().mockResolvedValue(undefined) }

    return {
      service: new JoinRequestsService(
        prisma as never,
        audit as never,
        push as never,
        cache as never,
        entitlements as never,
      ),
      prisma,
      tx,
      audit,
      push,
    }
  }

  it('grants club membership and marks the request approved', async () => {
    const { service, prisma, tx } = makeService()
    prisma.joinRequest.findFirst.mockResolvedValue({
      id: 'jr-1',
      clubId: 'club-1',
      userId: 'user-1',
      role: 'PLAYER',
      teamId: null,
      status: JoinRequestStatus.PENDING,
    })

    await expect(service.approve('club-1', 'jr-1', 'reviewer-1', { revision: 1 })).resolves.toEqual({
      status: 'APPROVED',
    })

    expect(tx.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_clubId: { userId: 'user-1', clubId: 'club-1' } },
        create: { userId: 'user-1', clubId: 'club-1', role: 'PLAYER' },
      }),
    )
    // No team specified -> no team-scoped access granted
    expect(tx.teamAccess.upsert).not.toHaveBeenCalled()
    expect(tx.teamMember.upsert).not.toHaveBeenCalled()
    expect(tx.joinRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'jr-1', clubId: 'club-1', status: 'PENDING', revision: 1 },
        data: expect.objectContaining({
          status: 'APPROVED',
          reviewedBy: 'reviewer-1',
        }),
      }),
    )
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('does not activate a request after the requester deleted their account', async () => {
    const { service, prisma, tx } = makeService()
    prisma.joinRequest.findFirst.mockResolvedValue({
      id: 'jr-1',
      clubId: 'club-1',
      userId: 'user-1',
      role: 'PLAYER',
      teamId: null,
      status: JoinRequestStatus.PENDING,
    })
    tx.user.findFirst.mockResolvedValue(null)

    await expect(
      service.approve('club-1', 'jr-1', 'reviewer-1', { revision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.membership.upsert).not.toHaveBeenCalled()
    expect(tx.joinRequest.updateMany).not.toHaveBeenCalled()
  })

  it('sends a JOIN_APPROVED push to the approved user', async () => {
    const { service, prisma, push } = makeService()
    prisma.joinRequest.findFirst.mockResolvedValue({
      id: 'jr-1',
      clubId: 'club-1',
      userId: 'user-1',
      role: 'PLAYER',
      teamId: null,
      status: JoinRequestStatus.PENDING,
    })

    await service.approve('club-1', 'jr-1', 'reviewer-1', { revision: 1 })
    // sendToUserLocalized is fire-and-forget — flush the microtask queue
    await new Promise((resolve) => setImmediate(resolve))

    expect(push.sendToUserLocalized).toHaveBeenCalledTimes(1)
    const call = push.sendToUserLocalized.mock.calls[0]
    expect(call[0]).toBe('user-1') // approved user
    expect(call[1]).toBe('JOIN_APPROVED')
    expect(call[2]).toEqual({ clubName: 'FC Test' })
    expect(call[4]).toEqual({ clubId: 'club-1' })
  })

  it('also grants team access and membership when a team was requested', async () => {
    const { service, prisma, tx } = makeService()
    prisma.joinRequest.findFirst.mockResolvedValue({
      id: 'jr-2',
      clubId: 'club-1',
      userId: 'user-2',
      role: 'PLAYER',
      teamId: 'team-9',
      status: JoinRequestStatus.PENDING,
    })

    await service.approve('club-1', 'jr-2', 'reviewer-1', { revision: 1 })

    expect(tx.teamAccess.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          teamId: 'team-9',
          userId: 'user-2',
          role: 'PLAYER',
        }),
      }),
    )
    expect(tx.teamMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId_userId: { teamId: 'team-9', userId: 'user-2' } },
      }),
    )
  })

  it('rejects a stored request whose team no longer belongs to the club', async () => {
    const { service, prisma, tx, push } = makeService()
    prisma.joinRequest.findFirst.mockResolvedValue({
      id: 'jr-2',
      clubId: 'club-1',
      userId: 'user-2',
      role: 'PLAYER',
      teamId: 'other-club-team',
      status: JoinRequestStatus.PENDING,
    })
    tx.team.findFirst.mockResolvedValue(null)

    await expect(service.approve('club-1', 'jr-2', 'reviewer-1', { revision: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    )

    expect(tx.teamAccess.upsert).not.toHaveBeenCalled()
    expect(tx.teamMember.upsert).not.toHaveBeenCalled()
    expect(tx.joinRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'jr-2', clubId: 'club-1', status: 'PENDING', revision: 1 },
      }),
    )
    expect(tx.auditLog.create).not.toHaveBeenCalled()
    expect(push.sendToUserLocalized).not.toHaveBeenCalled()
  })

  it('does not grant access when another reviewer already claimed the request', async () => {
    const { service, prisma, tx, push } = makeService()
    prisma.joinRequest.findFirst.mockResolvedValue({
      id: 'jr-3',
      clubId: 'club-1',
      userId: 'user-3',
      role: 'PLAYER',
      teamId: null,
      status: JoinRequestStatus.PENDING,
    })
    tx.joinRequest.updateMany.mockResolvedValue({ count: 0 })

    await expect(service.approve('club-1', 'jr-3', 'reviewer-1', { revision: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    )

    expect(tx.membership.upsert).not.toHaveBeenCalled()
    expect(tx.teamAccess.upsert).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
    expect(push.sendToUserLocalized).not.toHaveBeenCalled()
  })

  it('rejects an already-decided request without granting access', async () => {
    const { service, prisma, tx } = makeService()
    // findFirst is scoped to status PENDING -> a decided request is not found
    prisma.joinRequest.findFirst.mockResolvedValue(null)

    await expect(service.approve('club-1', 'jr-1', 'reviewer-1', { revision: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    )

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.membership.upsert).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('does not grant access for a request belonging to another club', async () => {
    const { service, prisma, tx } = makeService()
    // Wrong-club actor: clubId filter on findFirst excludes the row
    prisma.joinRequest.findFirst.mockResolvedValue(null)

    await expect(service.approve('other-club', 'jr-1', 'reviewer-1', { revision: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    )

    expect(prisma.joinRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'jr-1', clubId: 'other-club', status: 'PENDING', revision: 1 },
    })
    expect(tx.membership.upsert).not.toHaveBeenCalled()
  })

  it('fails closed when the reviewer was demoted before the locked decision', async () => {
    const { service, tx } = makeService()
    tx.joinRequest.findFirst.mockResolvedValueOnce({
      id: 'jr-1',
      userId: 'target-1',
      role: TeamRole.PLAYER,
      teamId: null,
    })
    tx.$queryRaw.mockResolvedValueOnce([{ userId: 'reviewer-1', role: MembershipRole.PLAYER }])

    await expect(
      service.approve('club-1', 'jr-1', 'reviewer-1', { revision: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException)

    expect(tx.joinRequest.findFirst).toHaveBeenCalled()
    expect(tx.joinRequest.updateMany).not.toHaveBeenCalled()
    expect(tx.membership.upsert).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('binds an approval to the request revision the reviewer saw', async () => {
    const { service, tx } = makeService()
    tx.joinRequest.findFirst.mockResolvedValueOnce(null)

    await expect(
      service.approve('club-1', 'jr-1', 'reviewer-1', { revision: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException)

    expect(tx.joinRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'jr-1', clubId: 'club-1', status: 'PENDING', revision: 1 },
    })
    expect(tx.membership.upsert).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
})

describe('JoinRequestsService.reject', () => {
  function makeService() {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ userId: 'reviewer-1', role: MembershipRole.ADMIN }]),
      joinRequest: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    }
    const prisma = {
      joinRequest: tx.joinRequest,
      club: {
        findUnique: jest.fn().mockResolvedValue({ name: 'FC Test' }),
      },
      membership: { upsert: jest.fn() },
      teamAccess: { upsert: jest.fn() },
      teamMember: { upsert: jest.fn() },
      $transaction: jest.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)),
    }
    const audit = { log: jest.fn().mockResolvedValue(undefined) }
    const push = { sendToUserLocalized: jest.fn().mockResolvedValue(undefined) }
    const cache = { get: jest.fn(), set: jest.fn() }

    return {
      service: new JoinRequestsService(
        prisma as never,
        audit as never,
        push as never,
        cache as never,
      ),
      prisma,
      tx,
      audit,
      push,
    }
  }

  it('marks the request rejected and creates no membership', async () => {
    const { service, prisma, tx } = makeService()
    prisma.joinRequest.findFirst.mockResolvedValue({
      id: 'jr-1',
      clubId: 'club-1',
      userId: 'user-1',
      role: 'PLAYER',
      teamId: null,
      status: JoinRequestStatus.PENDING,
    })

    await expect(
      service.reject('club-1', 'jr-1', 'reviewer-1', { revision: 1, reason: 'Not eligible' }),
    ).resolves.toEqual({ status: 'REJECTED' })

    expect(tx.joinRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'jr-1', clubId: 'club-1', status: 'PENDING', revision: 1 },
        data: expect.objectContaining({
          status: 'REJECTED',
          reviewedBy: 'reviewer-1',
        }),
      }),
    )
    expect(prisma.membership.upsert).not.toHaveBeenCalled()
    expect(prisma.teamAccess.upsert).not.toHaveBeenCalled()
    expect(prisma.teamMember.upsert).not.toHaveBeenCalled()
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('sends a JOIN_REJECTED push to the requester', async () => {
    const { service, prisma, push } = makeService()
    prisma.joinRequest.findFirst.mockResolvedValue({
      id: 'jr-1',
      clubId: 'club-1',
      userId: 'user-1',
      role: 'PLAYER',
      teamId: null,
      status: JoinRequestStatus.PENDING,
    })

    await service.reject('club-1', 'jr-1', 'reviewer-1', { revision: 1 })

    // sendToUserLocalized is fire-and-forget — flush the microtask queue.
    await Promise.resolve()
    await Promise.resolve()

    expect(push.sendToUserLocalized).toHaveBeenCalledTimes(1)
    const call = push.sendToUserLocalized.mock.calls[0]
    expect(call[0]).toBe('user-1')
    expect(call[1]).toBe('JOIN_REJECTED')
    expect(call[2]).toEqual({ clubName: 'FC Test' })
    expect(call[3]).toEqual({ type: 'join_rejected', clubId: 'club-1' })
  })

  it('404s an already-decided or wrong-club request and writes nothing', async () => {
    const { service, prisma, tx } = makeService()
    prisma.joinRequest.findFirst.mockResolvedValue(null)

    await expect(service.reject('club-1', 'jr-1', 'reviewer-1', { revision: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    )

    expect(tx.joinRequest.updateMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('does not emit rejection side effects when the locked request is already decided', async () => {
    const { service, prisma, tx, push } = makeService()
    prisma.joinRequest.findFirst.mockResolvedValue(null)

    await expect(service.reject('club-1', 'jr-1', 'reviewer-1', { revision: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    )

    expect(tx.auditLog.create).not.toHaveBeenCalled()
    expect(push.sendToUserLocalized).not.toHaveBeenCalled()
  })
})
