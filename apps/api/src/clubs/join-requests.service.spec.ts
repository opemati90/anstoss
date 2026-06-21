import { ConflictException } from '@nestjs/common'
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
