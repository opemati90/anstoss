import { ConflictException, NotFoundException } from '@nestjs/common'
import { JoinRequestStatus } from '@anstoss/shared'
import { JoinRequestsService } from './join-requests.service'

describe('JoinRequestsService.create', () => {
  function makeService() {
    const prisma = {
      joinRequest: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      club: {
        findUnique: jest.fn().mockResolvedValue({ id: 'club-1', name: 'FC Test' }),
      },
      membership: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'admin-1' }]),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Mara' }),
      },
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
      audit,
      push,
    }
  }

  it('creates one pending player request and notifies club staff', async () => {
    const { service, prisma, audit, push } = makeService()
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
    expect(audit.log).toHaveBeenCalledTimes(1)
    expect(push.sendToUserLocalized).toHaveBeenCalledTimes(1)
  })

  it('maps a concurrent unique-create loser to 409 without side effects', async () => {
    const { service, prisma, audit, push } = makeService()
    prisma.joinRequest.create.mockRejectedValue({ code: 'P2002' })

    await expect(
      service.create('user-1', 'club-1', { role: 'PLAYER', message: 'Again' }),
    ).rejects.toBeInstanceOf(ConflictException)

    expect(audit.log).not.toHaveBeenCalled()
    expect(prisma.membership.findMany).not.toHaveBeenCalled()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(push.sendToUserLocalized).not.toHaveBeenCalled()
  })

  it('does not emit side effects when a reviewed request reopen loses a race', async () => {
    const { service, prisma, audit, push } = makeService()
    prisma.joinRequest.findUnique.mockResolvedValue({
      id: 'jr-1',
      status: JoinRequestStatus.REJECTED,
    })
    prisma.joinRequest.updateMany.mockResolvedValue({ count: 0 })

    await expect(
      service.create('user-1', 'club-1', { role: 'PLAYER', message: 'Reopen' }),
    ).rejects.toBeInstanceOf(ConflictException)

    expect(prisma.joinRequest.findUniqueOrThrow).not.toHaveBeenCalled()
    expect(audit.log).not.toHaveBeenCalled()
    expect(push.sendToUserLocalized).not.toHaveBeenCalled()
  })
})

describe('JoinRequestsService.approve', () => {
  function makeService() {
    const tx = {
      membership: { upsert: jest.fn().mockResolvedValue(undefined) },
      teamAccess: { upsert: jest.fn().mockResolvedValue(undefined) },
      teamMember: { upsert: jest.fn().mockResolvedValue(undefined) },
      joinRequest: { update: jest.fn().mockResolvedValue(undefined) },
    }
    const prisma = {
      joinRequest: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
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
    }
  }

  it('grants club membership and marks the request approved', async () => {
    const { service, prisma, tx, audit } = makeService()
    prisma.joinRequest.findFirst.mockResolvedValue({
      id: 'jr-1',
      clubId: 'club-1',
      userId: 'user-1',
      role: 'PLAYER',
      teamId: null,
      status: JoinRequestStatus.PENDING,
    })

    await expect(
      service.approve('club-1', 'jr-1', 'reviewer-1', {}),
    ).resolves.toEqual({ status: 'APPROVED' })

    expect(tx.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_clubId: { userId: 'user-1', clubId: 'club-1' } },
        create: { userId: 'user-1', clubId: 'club-1', role: 'PLAYER' },
      }),
    )
    // No team specified -> no team-scoped access granted
    expect(tx.teamAccess.upsert).not.toHaveBeenCalled()
    expect(tx.teamMember.upsert).not.toHaveBeenCalled()
    expect(tx.joinRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'jr-1' },
        data: expect.objectContaining({
          status: 'APPROVED',
          reviewedBy: 'reviewer-1',
        }),
      }),
    )
    expect(audit.log).toHaveBeenCalledTimes(1)
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

    await service.approve('club-1', 'jr-2', 'reviewer-1', {})

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

  it('rejects an already-decided request without granting access', async () => {
    const { service, prisma, tx, audit } = makeService()
    // findFirst is scoped to status PENDING -> a decided request is not found
    prisma.joinRequest.findFirst.mockResolvedValue(null)

    await expect(
      service.approve('club-1', 'jr-1', 'reviewer-1', {}),
    ).rejects.toBeInstanceOf(NotFoundException)

    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(tx.membership.upsert).not.toHaveBeenCalled()
    expect(audit.log).not.toHaveBeenCalled()
  })

  it('does not grant access for a request belonging to another club', async () => {
    const { service, prisma, tx } = makeService()
    // Wrong-club actor: clubId filter on findFirst excludes the row
    prisma.joinRequest.findFirst.mockResolvedValue(null)

    await expect(
      service.approve('other-club', 'jr-1', 'reviewer-1', {}),
    ).rejects.toBeInstanceOf(NotFoundException)

    expect(prisma.joinRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'jr-1', clubId: 'other-club', status: 'PENDING' },
    })
    expect(tx.membership.upsert).not.toHaveBeenCalled()
  })
})

describe('JoinRequestsService.reject', () => {
  function makeService() {
    const prisma = {
      joinRequest: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
      membership: { upsert: jest.fn() },
      teamAccess: { upsert: jest.fn() },
      teamMember: { upsert: jest.fn() },
      $transaction: jest.fn(),
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
      audit,
    }
  }

  it('marks the request rejected and creates no membership', async () => {
    const { service, prisma, audit } = makeService()
    prisma.joinRequest.findFirst.mockResolvedValue({
      id: 'jr-1',
      clubId: 'club-1',
      userId: 'user-1',
      role: 'PLAYER',
      teamId: null,
      status: JoinRequestStatus.PENDING,
    })

    await expect(
      service.reject('club-1', 'jr-1', 'reviewer-1', { reason: 'Not eligible' }),
    ).resolves.toEqual({ status: 'REJECTED' })

    expect(prisma.joinRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'jr-1' },
        data: expect.objectContaining({
          status: 'REJECTED',
          reviewedBy: 'reviewer-1',
        }),
      }),
    )
    expect(prisma.membership.upsert).not.toHaveBeenCalled()
    expect(prisma.teamAccess.upsert).not.toHaveBeenCalled()
    expect(prisma.teamMember.upsert).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(audit.log).toHaveBeenCalledTimes(1)
  })

  it('404s an already-decided or wrong-club request and writes nothing', async () => {
    const { service, prisma, audit } = makeService()
    prisma.joinRequest.findFirst.mockResolvedValue(null)

    await expect(
      service.reject('club-1', 'jr-1', 'reviewer-1', {}),
    ).rejects.toBeInstanceOf(NotFoundException)

    expect(prisma.joinRequest.update).not.toHaveBeenCalled()
    expect(audit.log).not.toHaveBeenCalled()
  })
})
