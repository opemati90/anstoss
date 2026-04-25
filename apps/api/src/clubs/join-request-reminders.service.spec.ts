import { BadRequestException, NotFoundException } from '@nestjs/common'
import { JoinRequestsService } from './join-requests.service'

describe('JoinRequestsService.sendReminder', () => {
  function makeService(
    overrides: {
      findJoinRequest?: jest.Mock
      findAdminUserIds?: jest.Mock
      cacheGet?: jest.Mock
      cacheSet?: jest.Mock
      pushSend?: jest.Mock
    } = {},
  ) {
    const prisma = {
      joinRequest: {
        findFirst:
          overrides.findJoinRequest ??
          jest.fn().mockResolvedValue({
            id: 'jr1',
            userId: 'u1',
            clubId: 'c1',
            status: 'PENDING',
            club: { name: 'FC Bayern' },
          }),
      },
      membership: {
        findMany:
          overrides.findAdminUserIds ??
          jest.fn().mockResolvedValue([
            { userId: 'admin1' },
            { userId: 'admin2' },
          ]),
      },
    }

    const cache = {
      get: overrides.cacheGet ?? jest.fn().mockResolvedValue(null),
      set: overrides.cacheSet ?? jest.fn().mockResolvedValue('OK'),
    }

    const push = {
      sendToUser: overrides.pushSend ?? jest.fn().mockResolvedValue(undefined),
    }

    const audit = { log: jest.fn().mockResolvedValue(undefined) }

    return {
      service: new JoinRequestsService(
        prisma as never,
        audit as never,
        push as never,
        cache as never,
      ),
      prisma,
      cache,
      push,
    }
  }

  it('sends a push to all club ADMIN/OWNER users when no cooldown', async () => {
    const { service, push, cache } = makeService()

    await service.sendReminder('u1', 'c1', 'jr1')

    expect(push.sendToUser).toHaveBeenCalledTimes(2)
    expect(push.sendToUser).toHaveBeenCalledWith(
      'admin1',
      expect.any(String),
      expect.stringContaining('FC Bayern'),
      expect.objectContaining({ type: 'JOIN_REQUEST_REMINDER', clubId: 'c1', requestId: 'jr1' }),
      expect.objectContaining({ clubId: 'c1' }),
    )
    expect(push.sendToUser).toHaveBeenCalledWith(
      'admin2',
      expect.any(String),
      expect.stringContaining('FC Bayern'),
      expect.objectContaining({ type: 'JOIN_REQUEST_REMINDER' }),
      expect.objectContaining({ clubId: 'c1' }),
    )
    expect(cache.set).toHaveBeenCalledWith(
      'join-request-reminder:jr1',
      '1',
      'EX',
      5 * 60,
    )
  })

  it('throws BadRequest when cooldown still active', async () => {
    const { service } = makeService({
      cacheGet: jest.fn().mockResolvedValue('1'),
    })

    await expect(service.sendReminder('u1', 'c1', 'jr1')).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('throws NotFound when request does not belong to user', async () => {
    const { service } = makeService({
      findJoinRequest: jest.fn().mockResolvedValue(null),
    })

    await expect(service.sendReminder('u1', 'c1', 'jr1')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
