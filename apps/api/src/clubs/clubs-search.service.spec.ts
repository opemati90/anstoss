import { ClubsSearchService } from './clubs-search.service'

describe('ClubsSearchService.search', () => {
  function mockPrisma(
    clubRows: Array<Record<string, unknown>>,
    directoryRows: Array<Record<string, unknown>> = [],
  ) {
    return {
      club: {
        findMany: jest.fn().mockResolvedValue(clubRows),
      },
      clubDirectoryEntry: {
        findMany: jest.fn().mockResolvedValue(directoryRows),
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
        searchText: 'fc bayern munich',
        directoryEntry: null,
        _count: { memberships: 42 },
      },
    ])
    const svc = new ClubsSearchService(prisma as never)

    const res = await svc.search({ q: 'bayern', limit: 20 })

    expect(res.results).toHaveLength(1)
    expect(res.results[0]).toEqual({
      id: 'c1',
      activeClubId: 'c1',
      directoryEntryId: null,
      name: 'FC Bayern',
      slug: 'fc-bayern',
      badgeUrl: 'https://cdn/b.png',
      primaryColor: '#D50000',
      city: 'Munich',
      state: null,
      association: null,
      source: 'ANSTOSS',
      isActive: true,
      memberCount: 42,
    })
    expect(res.nextCursor).toBeNull()
  })

  it('queries active clubs and directory entries case-insensitively', async () => {
    const prisma = mockPrisma([])
    const svc = new ClubsSearchService(prisma as never)

    await svc.search({ q: 'München', limit: 20 })

    expect(prisma.club.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { name: { contains: 'München', mode: 'insensitive' } },
            { city: { contains: 'München', mode: 'insensitive' } },
            { searchText: { contains: 'muenchen', mode: 'insensitive' } },
            { searchText: { contains: 'munchen', mode: 'insensitive' } },
          ]),
        }),
        take: 21,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    )
    expect(prisma.clubDirectoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          activeClubId: null,
          OR: expect.arrayContaining([
            { name: { contains: 'München', mode: 'insensitive' } },
            { normalizedName: { contains: 'muenchen', mode: 'insensitive' } },
            { normalizedName: { contains: 'munchen', mode: 'insensitive' } },
            { city: { contains: 'München', mode: 'insensitive' } },
            { association: { contains: 'München', mode: 'insensitive' } },
          ]),
        }),
        take: 21,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    )
  })

  it('adds tokenized search clauses for multi-word queries in any order', async () => {
    const prisma = mockPrisma([])
    const svc = new ClubsSearchService(prisma as never)

    await svc.search({ q: 'Berlin SV', limit: 20 })

    expect(prisma.club.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              AND: [
                { searchText: { contains: 'berlin', mode: 'insensitive' } },
                { searchText: { contains: 'sv', mode: 'insensitive' } },
              ],
            },
          ]),
        }),
      }),
    )
    expect(prisma.clubDirectoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              AND: [
                { normalizedName: { contains: 'berlin', mode: 'insensitive' } },
                { normalizedName: { contains: 'sv', mode: 'insensitive' } },
              ],
            },
          ]),
        }),
      }),
    )
  })

  it('searches linked active clubs through their original directory metadata', async () => {
    const prisma = mockPrisma([
      {
        id: 'c1',
        name: 'TuS Musterstadt',
        slug: 'turn-und-sportverein-musterstadt-1899',
        badgeUrl: null,
        primaryColor: '#111111',
        city: 'Musterstadt',
        searchText: 'tus musterstadt',
        directoryEntry: {
          id: 'dir1',
          name: 'Turn- und Sportverein Musterstadt 1899',
          normalizedName: 'turn und sportverein musterstadt 1899',
          city: 'Musterstadt',
          state: 'BE',
          association: 'Berliner FV',
          source: 'FUSSBALL_DE',
        },
        _count: { memberships: 2 },
      },
    ])
    const svc = new ClubsSearchService(prisma as never)

    const res = await svc.search({ q: 'Turn Sportverein', limit: 20 })

    expect(prisma.club.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              directoryEntry: {
                is: {
                  OR: expect.arrayContaining([
                    { name: { contains: 'Turn Sportverein', mode: 'insensitive' } },
                    {
                      normalizedName: {
                        contains: 'turn sportverein',
                        mode: 'insensitive',
                      },
                    },
                  ]),
                },
              },
            },
          ]),
        }),
      }),
    )
    expect(res.results[0]).toEqual(
      expect.objectContaining({
        id: 'c1',
        activeClubId: 'c1',
        directoryEntryId: 'dir1',
        isActive: true,
      }),
    )
  })

  it('sets an offset cursor when merged rows overflow limit', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `c${i}`,
      name: `Club ${String(i).padStart(2, '0')}`,
      slug: `club-${i}`,
      badgeUrl: null,
      primaryColor: '#000000',
      city: null,
      searchText: `club ${String(i).padStart(2, '0')}`,
      directoryEntry: null,
      _count: { memberships: 0 },
    }))
    const prisma = mockPrisma(rows)
    const svc = new ClubsSearchService(prisma as never)

    const res = await svc.search({ q: 'club', limit: 20 })

    expect(res.results).toHaveLength(20)
    expect(res.nextCursor).toBe(JSON.stringify({ offset: 20 }))
  })

  it('uses offset cursors to fetch a larger stable source window', async () => {
    const prisma = mockPrisma([])
    const svc = new ClubsSearchService(prisma as never)

    await svc.search({ q: 'FC', limit: 20, cursor: JSON.stringify({ offset: 20 }) })

    expect(prisma.club.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 41,
      }),
    )
    expect(prisma.clubDirectoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 41,
      }),
    )
  })

  it('does not hide overflow when neither source exceeds limit alone', async () => {
    const clubs = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      name: `SV Active ${String(i).padStart(2, '0')}`,
      slug: `sv-active-${i}`,
      badgeUrl: null,
      primaryColor: '#111111',
      city: 'Berlin',
      searchText: `sv active ${String(i).padStart(2, '0')} berlin`,
      directoryEntry: null,
      _count: { memberships: 1 },
    }))
    const directoryRows = Array.from({ length: 10 }, (_, i) => ({
      id: `dir${i}`,
      source: 'FUSSBALL_DE',
      name: `SV Directory ${String(i).padStart(2, '0')}`,
      normalizedName: `sv directory ${String(i).padStart(2, '0')} berlin`,
      slug: `sv-directory-${i}`,
      badgeUrl: null,
      primaryColor: '#1A1A18',
      city: 'Berlin',
      state: 'BE',
      association: 'Berliner FV',
    }))
    const prisma = mockPrisma(clubs, directoryRows)
    const svc = new ClubsSearchService(prisma as never)

    const firstPage = await svc.search({ q: 'SV', limit: 15 })
    const secondPage = await svc.search({
      q: 'SV',
      limit: 15,
      cursor: firstPage.nextCursor ?? undefined,
    })

    expect(firstPage.results).toHaveLength(15)
    expect(firstPage.nextCursor).toBe(JSON.stringify({ offset: 15 }))
    expect(secondPage.results).toHaveLength(5)
    expect(new Set([...firstPage.results, ...secondPage.results].map((r) => r.id)).size).toBe(20)
  })

  it('matches German umlaut, ue, and accent-folded search variants', async () => {
    const prisma = mockPrisma([])
    const svc = new ClubsSearchService(prisma as never)

    await svc.search({ q: 'Muenchen', limit: 20 })

    expect(prisma.club.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { searchText: { contains: 'muenchen', mode: 'insensitive' } },
          ]),
        }),
      }),
    )
  })

  it('merges unclaimed directory clubs after active clubs', async () => {
    const prisma = mockPrisma(
      [
        {
          id: 'c1',
          name: 'SV Active',
          slug: 'sv-active',
          badgeUrl: null,
          primaryColor: '#111111',
          city: 'Berlin',
          searchText: 'sv active berlin',
          directoryEntry: null,
          _count: { memberships: 3 },
        },
      ],
      [
        {
          id: 'dir1',
          source: 'FUSSBALL_DE',
          name: 'SV Directory',
          normalizedName: 'sv directory berlin',
          slug: 'sv-directory',
          badgeUrl: null,
          primaryColor: '#1A1A18',
          city: 'Berlin',
          state: 'BE',
          association: 'Berliner FV',
        },
      ],
    )
    const svc = new ClubsSearchService(prisma as never)

    const res = await svc.search({ q: 'SV', limit: 20 })

    expect(res.results.map((r) => r.name)).toEqual(['SV Active', 'SV Directory'])
    expect(res.results[1]).toEqual(
      expect.objectContaining({
        id: 'dir1',
        activeClubId: null,
        directoryEntryId: 'dir1',
        source: 'FUSSBALL_DE',
        isActive: false,
        memberCount: 0,
      }),
    )
  })
})
