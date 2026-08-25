import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { EntitlementGuard } from '../billing/entitlement.guard'
import { SponsorsService } from './sponsors.service'

describe('SponsorsService', () => {
  let service: SponsorsService
  let prisma: {
    sponsor: {
      findMany: jest.Mock
      findFirst: jest.Mock
      create: jest.Mock
      update: jest.Mock
      delete: jest.Mock
    }
  }

  beforeEach(() => {
    prisma = {
      sponsor: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    }
    service = new SponsorsService(prisma as never)
  })

  it('creates a sponsor scoped to the club', async () => {
    const now = new Date('2026-05-11T00:00:00Z')
    prisma.sponsor.create.mockResolvedValue({
      id: 's1',
      clubId: 'club-1',
      name: 'Sparkasse',
      logoUrl: 'https://cdn.example/sponsor.png',
      linkUrl: 'https://sparkasse.example',
      displayOrder: 0,
      createdAt: now,
      updatedAt: now,
    })

    const result = await service.create('club-1', {
      name: 'Sparkasse',
      logoUrl: 'https://cdn.example/sponsor.png',
      linkUrl: 'https://sparkasse.example',
    })

    expect(prisma.sponsor.create).toHaveBeenCalledWith({
      data: {
        clubId: 'club-1',
        name: 'Sparkasse',
        logoUrl: 'https://cdn.example/sponsor.png',
        linkUrl: 'https://sparkasse.example',
        displayOrder: 0,
      },
    })
    expect(result).toEqual({
      id: 's1',
      clubId: 'club-1',
      name: 'Sparkasse',
      logoUrl: 'https://cdn.example/sponsor.png',
      linkUrl: 'https://sparkasse.example',
      displayOrder: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
  })

  it('lists sponsors ordered by displayOrder then createdAt', async () => {
    const a = new Date('2026-05-11T00:00:00Z')
    const b = new Date('2026-05-11T00:01:00Z')
    prisma.sponsor.findMany.mockResolvedValue([
      {
        id: 's1',
        clubId: 'club-1',
        name: 'A',
        logoUrl: 'https://cdn.example/a.png',
        linkUrl: null,
        displayOrder: 0,
        createdAt: a,
        updatedAt: a,
      },
      {
        id: 's2',
        clubId: 'club-1',
        name: 'B',
        logoUrl: 'https://cdn.example/b.png',
        linkUrl: null,
        displayOrder: 1,
        createdAt: b,
        updatedAt: b,
      },
    ])

    const rows = await service.list('club-1')

    expect(prisma.sponsor.findMany).toHaveBeenCalledWith({
      where: { clubId: 'club-1' },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]?.id).toBe('s1')
    expect(rows[1]?.id).toBe('s2')
  })

  it('refuses to update a sponsor from a different club', async () => {
    prisma.sponsor.findFirst.mockResolvedValue(null)

    await expect(service.update('club-1', 's1', { name: 'New' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(prisma.sponsor.update).not.toHaveBeenCalled()
  })

  it('deletes a sponsor scoped to the club', async () => {
    prisma.sponsor.findFirst.mockResolvedValue({
      id: 's1',
      clubId: 'club-1',
    })
    prisma.sponsor.delete.mockResolvedValue({})
    const result = await service.remove('club-1', 's1')
    expect(prisma.sponsor.delete).toHaveBeenCalledWith({ where: { id: 's1' } })
    expect(result).toEqual({ ok: true })
  })
})

describe('Sponsor entitlement gating', () => {
  function makeContext(clubId: string) {
    const request = { params: { clubId } }
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never
  }

  it('blocks sponsor writes for free clubs', async () => {
    const reflector = new Reflector()
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('sponsor_logos')

    const billingService = {
      getEntitlements: jest.fn().mockResolvedValue({
        clubId: 'club-1',
        plan: 'FOUNDATION',
        features: [],
      }),
    }

    const guard = new EntitlementGuard(reflector, billingService as never)

    await expect(guard.canActivate(makeContext('club-1'))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(billingService.getEntitlements).toHaveBeenCalledWith('club-1')
  })

  it('lets sponsor writes through for PREMIUM clubs', async () => {
    const reflector = new Reflector()
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('sponsor_logos')

    const billingService = {
      getEntitlements: jest.fn().mockResolvedValue({
        clubId: 'club-1',
        plan: 'PREMIUM',
        features: ['sponsor_logos'],
      }),
    }

    const guard = new EntitlementGuard(reflector, billingService as never)
    await expect(guard.canActivate(makeContext('club-1'))).resolves.toBe(true)
  })
})
