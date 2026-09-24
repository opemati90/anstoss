import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { TeamAccessDeniedError } from '@anstoss/shared'
import { Prisma } from '@prisma/client'
import { CarpoolService } from './carpool.service'

/** Resolves after other queued async work, so concurrent calls interleave. */
const tick = () => new Promise((resolve) => setImmediate(resolve))

type Ride = {
  id: string
  eventId: string
  driverUserId: string
  seats: number
  departFrom: string | null
  departAt: Date | null
  note: string | null
  createdAt: Date
  seatsTaken: Array<{ userId: string }>
}

/** A tiny in-memory Prisma double for rides + seats of one event. */
function setup(opts: { locks?: boolean } = {}) {
  const rides: Ride[] = []
  // Postgres lock double: $queryRaw ... FOR UPDATE / pg_advisory_xact_lock
  // queue on a key until the holding transaction ends. With `locks: false`
  // the lock statements are no-ops, which is what the service did before.
  const lockQueue = new Map<string, Promise<void>>()
  let currentTx: { release: Array<() => void> } | null = null
  const names: Record<string, string> = {
    tim: 'Tim Weber',
    lukas: 'Lukas Hoffmann',
    mia: 'Mia Weber',
    jonas: 'Jonas Becker',
  }
  const withIncludes = (ride: Ride) => ({
    ...ride,
    driver: { id: ride.driverUserId, name: names[ride.driverUserId] ?? '', avatarUrl: null },
    seatsTaken: ride.seatsTaken.map((seat) => ({
      userId: seat.userId,
      user: { name: names[seat.userId] },
    })),
  })
  async function lockDouble(strings: TemplateStringsArray, ...values: unknown[]) {
    if (opts.locks === false || !currentTx) return []
    const key = `${strings.join('?')}|${values.join('|')}`
    const previous = lockQueue.get(key) ?? Promise.resolve()
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    lockQueue.set(
      key,
      previous.then(() => held),
    )
    const tx = currentTx
    tx.release.push(release)
    await previous
    return []
  }
  let n = 0
  const prisma: any = {
    event: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.id === 'evt-1' && where.clubId === 'club-1'
          ? {
              id: 'evt-1',
              clubId: 'club-1',
              teamId: 'team-1',
              date: new Date(Date.now() + 3 * 86400000),
              cancelledAt: null,
              carpoolEnabled: true,
              title: 'SV Babelsberg 03',
              type: 'MATCH',
              opponent: 'SV Babelsberg 03',
              homeAway: 'AWAY',
              autoTitle: true,
            }
          : null,
      ),
    },
    carpoolRide: {
      findMany: jest.fn(async () => rides.map(withIncludes)),
      findFirst: jest.fn(async ({ where }: any) => {
        const ride = rides.find(
          (r) =>
            (!where.id || r.id === where.id) &&
            (!where.eventId || r.eventId === where.eventId) &&
            (!where.driverUserId || r.driverUserId === where.driverUserId),
        )
        const snapshot = ride
          ? {
              ...ride,
              driver: { name: names[ride.driverUserId] ?? '' },
              seatsTaken: ride.seatsTaken.map((s) => ({ ...s })),
            }
          : null
        // A real round trip: other requests run before the answer arrives.
        await tick()
        return snapshot
      }),
      create: jest.fn(async ({ data }: any) => {
        const ride: Ride = {
          id: `ride-${++n}`,
          eventId: data.eventId,
          driverUserId: data.driverUserId,
          seats: data.seats,
          departFrom: data.departFrom,
          departAt: data.departAt,
          note: data.note,
          createdAt: new Date(),
          seatsTaken: [],
        }
        rides.push(ride)
        return withIncludes(ride)
      }),
      delete: jest.fn(async ({ where }: any) => {
        const idx = rides.findIndex((r) => r.id === where.id)
        rides.splice(idx, 1)
      }),
    },
    carpoolSeat: {
      create: jest.fn(async ({ data }: any) => {
        await tick()
        rides.find((r) => r.id === data.rideId)!.seatsTaken.push({ userId: data.userId })
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        for (const ride of rides) {
          if (where.rideId && typeof where.rideId === 'string' && ride.id !== where.rideId) continue
          if (where.rideId?.not && ride.id === where.rideId.not) continue
          ride.seatsTaken = ride.seatsTaken.filter((s) => s.userId !== where.userId)
        }
      }),
    },
    guardianRelationship: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findMany: jest.fn(async ({ where }: any) =>
        where.id.in.map((id: string) => ({ id, preferredLanguage: id === 'lukas' ? 'en' : 'de' })),
      ),
    },
    $queryRaw: jest.fn(lockDouble),
    $executeRaw: jest.fn(lockDouble),
    $transaction: jest.fn(async (fn: any) => {
      const tx = { release: [] as Array<() => void> }
      // Each transaction gets its own view of "current transaction" for the
      // lock double; the client object itself is shared like a real pool.
      const txClient = new Proxy(prisma, {
        get(target, prop) {
          if (prop === '$queryRaw' || prop === '$executeRaw') {
            return (...args: any[]) => {
              currentTx = tx
              const result = target[prop](...args)
              currentTx = null
              return result
            }
          }
          return target[prop]
        },
      })
      try {
        return await fn(txClient)
      } finally {
        tx.release.forEach((release) => release())
      }
    }),
  }
  const teams = {
    assertReadableAccess: jest.fn().mockResolvedValue({}),
    assertEventManagementAccess: jest.fn().mockRejectedValue(new TeamAccessDeniedError('no')),
  }
  const push = { sendToUser: jest.fn().mockResolvedValue(undefined) }
  const service = new CarpoolService(prisma, teams as never, push as never)
  return { prisma, teams, push, rides, service }
}

describe('CarpoolService', () => {
  it('offers a ride and lists it with the driver', async () => {
    const { service } = setup()
    const ride = await service.offer('club-1', 'evt-1', 'tim', {
      seats: 3,
      departFrom: ' Vereinsheim ',
      note: 'Kindersitz vorhanden',
    })
    expect(ride).toMatchObject({
      seats: 3,
      departFrom: 'Vereinsheim',
      driver: { id: 'tim', name: 'Tim Weber' },
      isMine: true,
      passengers: [],
    })

    const board = await service.list('club-1', 'evt-1', 'lukas')
    expect(board.rides).toHaveLength(1)
    expect(board.rides[0].isMine).toBe(false)
  })

  it('refuses a second ride from the same driver', async () => {
    const { service } = setup()
    await service.offer('club-1', 'evt-1', 'tim', { seats: 3 })
    await expect(service.offer('club-1', 'evt-1', 'tim', { seats: 2 })).rejects.toThrow(
      ConflictException,
    )
  })

  it('refuses offers for a cancelled event', async () => {
    const { prisma, service } = setup()
    prisma.event.findFirst.mockResolvedValue({
      id: 'evt-1',
      clubId: 'club-1',
      teamId: 'team-1',
      date: new Date(Date.now() + 86400000),
      cancelledAt: new Date(),
    })
    await expect(service.offer('club-1', 'evt-1', 'tim', { seats: 3 })).rejects.toThrow(
      BadRequestException,
    )
  })

  it('takes a seat and refuses when the car is full', async () => {
    const { service } = setup()
    const ride = await service.offer('club-1', 'evt-1', 'tim', { seats: 1 })

    const board = await service.takeSeat('club-1', 'evt-1', ride.id, 'lukas')
    expect(board.rides[0].passengers).toEqual([{ userId: 'lukas', name: 'Lukas Hoffmann' }])

    await expect(service.takeSeat('club-1', 'evt-1', ride.id, 'jonas')).rejects.toThrow(
      ConflictException,
    )
  })

  it('moves a rider who switches cars (one car per person)', async () => {
    const { service } = setup()
    const first = await service.offer('club-1', 'evt-1', 'tim', { seats: 3 })
    const second = await service.offer('club-1', 'evt-1', 'jonas', { seats: 3 })

    await service.takeSeat('club-1', 'evt-1', first.id, 'lukas')
    const board = await service.takeSeat('club-1', 'evt-1', second.id, 'lukas')

    expect(board.rides.find((r) => r.id === first.id)?.passengers).toEqual([])
    expect(board.rides.find((r) => r.id === second.id)?.passengers).toEqual([
      { userId: 'lukas', name: 'Lukas Hoffmann' },
    ])
  })

  it('does not let a driver sit in their own car', async () => {
    const { service } = setup()
    const ride = await service.offer('club-1', 'evt-1', 'tim', { seats: 3 })
    await expect(service.takeSeat('club-1', 'evt-1', ride.id, 'tim')).rejects.toThrow(
      BadRequestException,
    )
  })

  it('lets a parent book a seat for a guarded child only', async () => {
    const { prisma, service } = setup()
    const ride = await service.offer('club-1', 'evt-1', 'tim', { seats: 3 })

    await expect(service.takeSeat('club-1', 'evt-1', ride.id, 'parent-1', 'mia')).rejects.toThrow(
      ForbiddenException,
    )

    prisma.guardianRelationship.findFirst.mockResolvedValue({ id: 'g-1' })
    const board = await service.takeSeat('club-1', 'evt-1', ride.id, 'parent-1', 'mia')
    expect(board.rides[0].passengers).toEqual([{ userId: 'mia', name: 'Mia Weber' }])
  })

  it('leaves a seat', async () => {
    const { service } = setup()
    const ride = await service.offer('club-1', 'evt-1', 'tim', { seats: 3 })
    await service.takeSeat('club-1', 'evt-1', ride.id, 'lukas')
    const board = await service.leaveSeat('club-1', 'evt-1', ride.id, 'lukas')
    expect(board.rides[0].passengers).toEqual([])
  })

  it('only the driver or an event manager may delete a ride', async () => {
    const { teams, service } = setup()
    const ride = await service.offer('club-1', 'evt-1', 'tim', { seats: 3 })

    await expect(service.remove('club-1', 'evt-1', ride.id, 'lukas')).rejects.toThrow(
      ForbiddenException,
    )

    teams.assertEventManagementAccess.mockResolvedValue({})
    const board = await service.remove('club-1', 'evt-1', ride.id, 'coach-1')
    expect(board.rides).toEqual([])
  })

  it('requires readable access to the team', async () => {
    const { teams, service } = setup()
    teams.assertReadableAccess.mockRejectedValue(new TeamAccessDeniedError('no'))
    await expect(service.list('club-1', 'evt-1', 'outsider')).rejects.toThrow(TeamAccessDeniedError)
  })

  describe('review fixes', () => {
    it('never overbooks the last seat when two riders tap at once (M1)', async () => {
      const { service, rides } = setup()
      const ride = await service.offer('club-1', 'evt-1', 'tim', { seats: 1 })

      const results = await Promise.allSettled([
        service.takeSeat('club-1', 'evt-1', ride.id, 'lukas'),
        service.takeSeat('club-1', 'evt-1', ride.id, 'jonas'),
      ])

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
      expect(rejected.reason).toBeInstanceOf(ConflictException)
      expect(rides[0].seatsTaken).toHaveLength(1)
    })

    it('the same double tap without the locks overbooks (proves the spec bites)', async () => {
      const { service, rides } = setup({ locks: false })
      const ride = await service.offer('club-1', 'evt-1', 'tim', { seats: 1 })
      await Promise.allSettled([
        service.takeSeat('club-1', 'evt-1', ride.id, 'lukas'),
        service.takeSeat('club-1', 'evt-1', ride.id, 'jonas'),
      ])
      expect(rides[0].seatsTaken).toHaveLength(2)
    })

    it('keeps one car per person when one rider books two cars at once (M1)', async () => {
      const { service, rides } = setup()
      const first = await service.offer('club-1', 'evt-1', 'tim', { seats: 3 })
      const second = await service.offer('club-1', 'evt-1', 'jonas', { seats: 3 })

      await Promise.allSettled([
        service.takeSeat('club-1', 'evt-1', first.id, 'lukas'),
        service.takeSeat('club-1', 'evt-1', second.id, 'lukas'),
      ])

      const seatsOfLukas = rides.flatMap((r) => r.seatsTaken).filter((s) => s.userId === 'lukas')
      expect(seatsOfLukas).toHaveLength(1)
    })

    it('locks the ride row and the rider inside the transaction (M1)', async () => {
      const { prisma, service } = setup()
      const ride = await service.offer('club-1', 'evt-1', 'tim', { seats: 2 })
      await service.takeSeat('club-1', 'evt-1', ride.id, 'lukas')
      const sql = [...prisma.$executeRaw.mock.calls, ...prisma.$queryRaw.mock.calls].map(
        (call: any[]) => call[0].join('?'),
      )
      expect(sql.some((text: string) => text.includes('pg_advisory_xact_lock'))).toBe(true)
      expect(sql.some((text: string) => text.includes('FOR UPDATE'))).toBe(true)
      const rowLock = prisma.$queryRaw.mock.calls.find((call: any[]) =>
        call[0].join('?').includes('FOR UPDATE'),
      )
      expect(rowLock.slice(1)).toEqual([ride.id, 'evt-1'])
    })

    it('scopes the event lookup to the club: a foreign club is a 404 (tenant isolation)', async () => {
      const { prisma, service } = setup()
      await expect(service.list('club-2', 'evt-1', 'tim')).rejects.toThrow(NotFoundException)
      await expect(service.offer('club-2', 'evt-1', 'tim', { seats: 2 })).rejects.toThrow(
        NotFoundException,
      )
      expect(prisma.event.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'evt-1', clubId: 'club-2' } }),
      )
    })

    it('rejects offers and seats with 409 while Fahrten are off (L1)', async () => {
      const { prisma, service } = setup()
      const ride = await service.offer('club-1', 'evt-1', 'tim', { seats: 2 })
      const base = await prisma.event.findFirst({ where: { id: 'evt-1', clubId: 'club-1' } })
      prisma.event.findFirst.mockResolvedValue({ ...base, carpoolEnabled: false })

      await expect(service.offer('club-1', 'evt-1', 'jonas', { seats: 2 })).rejects.toThrow(
        'Carpooling is turned off for this event',
      )
      await expect(service.takeSeat('club-1', 'evt-1', ride.id, 'lukas')).rejects.toThrow(
        ConflictException,
      )
    })

    it('turns a P2002 race on offering into a 409 (L4)', async () => {
      const { prisma, service } = setup()
      prisma.carpoolRide.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      )
      await expect(service.offer('club-1', 'evt-1', 'tim', { seats: 2 })).rejects.toThrow(
        ConflictException,
      )
    })

    it('tells riders and the parents of child riders when a ride is withdrawn (L3)', async () => {
      const { prisma, push, service } = setup()
      const ride = await service.offer('club-1', 'evt-1', 'tim', { seats: 3 })
      await service.takeSeat('club-1', 'evt-1', ride.id, 'lukas')
      prisma.guardianRelationship.findFirst.mockResolvedValue({ id: 'g-1' })
      await service.takeSeat('club-1', 'evt-1', ride.id, 'parent-1', 'mia')
      prisma.guardianRelationship.findMany.mockResolvedValue([
        {
          parentUserId: 'parent-1',
          playerUserId: 'mia',
          childName: null,
          player: { name: 'Mia Weber' },
        },
      ])

      await service.remove('club-1', 'evt-1', ride.id, 'tim')
      await tick()
      await tick()

      expect(prisma.guardianRelationship.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { playerUserId: { in: ['lukas', 'mia'] } } }),
      )
      const byUser = Object.fromEntries(
        push.sendToUser.mock.calls.map((call: any[]) => [
          call[0],
          { title: call[1], body: call[2] },
        ]),
      )
      expect(Object.keys(byUser).sort()).toEqual(['lukas', 'mia', 'parent-1'])
      expect(byUser.lukas.title).toBe('Lift cancelled')
      expect(byUser.lukas.body).toContain('Tim is no longer driving to Away at SV Babelsberg 03')
      expect(byUser['parent-1'].body).toContain('Mia braucht eine andere Mitfahrgelegenheit')
      expect(byUser['parent-1'].body).toContain('Auswärtsspiel bei SV Babelsberg 03')
    })
  })
})
