import { ClubsSearchService } from './clubs-search.service'

describe('ClubsSearchService.search', () => {
  function mockPrisma(rows: Array<Record<string, unknown>>) {
    return {
      club: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
    }
  }

  it('returns results with memberCount flattened', async () => {
    const prisma = mockPrisma([
      {
        id: 'c1',
        name: 'FC Bayern',
        slug: 'fc-bayern',
        badgeUrl: 'https://cdn/b.png',
        primaryColor: '#D50000',
        city: 'Munich',
        _count: { memberships: 42 },
      },
    ])
    const svc = new ClubsSearchService(prisma as never)

    const res = await svc.search({ q: 'bayern', limit: 20 })

    expect(res.results).toHaveLength(1)
    expect(res.results[0]).toEqual({
      id: 'c1',
      name: 'FC Bayern',
      slug: 'fc-bayern',
      badgeUrl: 'https://cdn/b.png',
      primaryColor: '#D50000',
      city: 'Munich',
      memberCount: 42,
    })
    expect(res.nextCursor).toBeNull()
  })

  it('queries name OR city case-insensitively', async () => {
    const prisma = mockPrisma([])
    const svc = new ClubsSearchService(prisma as never)

    await svc.search({ q: 'Berlin', limit: 20 })

    expect(prisma.club.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: 'Berlin', mode: 'insensitive' } },
            { city: { contains: 'Berlin', mode: 'insensitive' } },
          ],
        },
        take: 21,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    )
  })

  it('sets nextCursor to last id when rows overflow limit', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `c${i}`,
      name: `Club ${i}`,
      slug: `club-${i}`,
      badgeUrl: null,
      primaryColor: '#000000',
      city: null,
      _count: { memberships: 0 },
    }))
    const prisma = mockPrisma(rows)
    const svc = new ClubsSearchService(prisma as never)

    const res = await svc.search({ q: 'club', limit: 20 })

    expect(res.results).toHaveLength(20)
    expect(res.nextCursor).toBe('c19')
  })

  it('applies cursor via skip:1 + cursor', async () => {
    const prisma = mockPrisma([])
    const svc = new ClubsSearchService(prisma as never)

    await svc.search({ q: 'FC', limit: 20, cursor: 'c19' })

    expect(prisma.club.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 'c19' },
        skip: 1,
      }),
    )
  })
})
