import { Injectable } from '@nestjs/common'
import type { ClubSearchQuery, ClubSearchResponse, ClubSearchResult } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'

const MAX_SEARCH_WINDOW = 500

@Injectable()
export class ClubsSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: ClubSearchQuery): Promise<ClubSearchResponse> {
    const { q, limit, cursor } = query
    const normalizedQueries = normalizeSearchVariants(q)
    const normalizedTokens = normalizeSearchTokens(normalizedQueries)
    const parsedCursor = parseSearchCursor(cursor)
    const fetchLimit = parsedCursor.offset + limit + 1
    const activeTokenSearch =
      normalizedTokens.length > 1
        ? [{
            AND: normalizedTokens.map((value) => ({
              searchText: { contains: value, mode: 'insensitive' as const },
            })),
          }]
        : []
    const directoryTokenSearch =
      normalizedTokens.length > 1
        ? [{
            AND: normalizedTokens.map((value) => ({
              normalizedName: { contains: value, mode: 'insensitive' as const },
            })),
          }]
        : []
    const activeDirectorySearch = [
      {
        directoryEntry: {
          is: {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { city: { contains: q, mode: 'insensitive' as const } },
              { association: { contains: q, mode: 'insensitive' as const } },
              ...normalizedQueries.map((value) => ({
                normalizedName: { contains: value, mode: 'insensitive' as const },
              })),
              ...directoryTokenSearch,
            ],
          },
        },
      },
    ]

    const [clubs, directoryEntries] = await Promise.all([
      this.prisma.club.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { city: { contains: q, mode: 'insensitive' } },
            ...normalizedQueries.map((value) => ({
              searchText: { contains: value, mode: 'insensitive' as const },
            })),
            ...activeTokenSearch,
            ...activeDirectorySearch,
          ],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          badgeUrl: true,
          primaryColor: true,
          city: true,
          searchText: true,
          directoryEntry: {
            select: {
              id: true,
              name: true,
              normalizedName: true,
              city: true,
              state: true,
              association: true,
              source: true,
            },
          },
          _count: { select: { memberships: true } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: fetchLimit,
      }),
      this.prisma.clubDirectoryEntry.findMany({
        where: {
          activeClubId: null,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            ...normalizedQueries.map((value) => ({
              normalizedName: { contains: value, mode: 'insensitive' as const },
            })),
            ...directoryTokenSearch,
            { city: { contains: q, mode: 'insensitive' } },
            { association: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          source: true,
          name: true,
          normalizedName: true,
          slug: true,
          badgeUrl: true,
          primaryColor: true,
          city: true,
          state: true,
          association: true,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: fetchLimit,
      }),
    ])

    const merged: RankedClubSearchResult[] = [
      ...clubs.map((r) => ({
        id: r.id,
        activeClubId: r.id,
        directoryEntryId: r.directoryEntry?.id ?? null,
        name: r.name,
        slug: r.slug,
        badgeUrl: r.badgeUrl,
        primaryColor: r.primaryColor,
        city: r.city,
        state: r.directoryEntry?.state ?? null,
        association: r.directoryEntry?.association ?? null,
        source: 'ANSTOSS' as const,
        isActive: true as const,
        memberCount: r._count.memberships,
        _score: scoreSearchResult(
          normalizedQueries,
          normalizedTokens,
          r.name,
          r.city,
          buildActiveSearchText(r.searchText, r.directoryEntry),
          true,
        ),
      })),
      ...directoryEntries.map((r) => ({
        id: r.id,
        activeClubId: null,
        directoryEntryId: r.id,
        name: r.name,
        slug: r.slug,
        badgeUrl: r.badgeUrl,
        primaryColor: r.primaryColor,
        city: r.city,
        state: r.state,
        association: r.association,
        source: r.source,
        isActive: false as const,
        memberCount: 0,
        _score: scoreSearchResult(
          normalizedQueries,
          normalizedTokens,
          r.name,
          r.city,
          r.normalizedName,
          false,
        ),
      })),
    ]

    merged.sort((a, b) => {
      const scoreDelta = a._score - b._score
      if (scoreDelta !== 0) return scoreDelta
      return a.name.localeCompare(b.name, 'de')
    })

    const sliced = merged.slice(parsedCursor.offset, parsedCursor.offset + limit)
    const hasMore = merged.length > parsedCursor.offset + limit
    const nextCursor = hasMore
      ? JSON.stringify({ offset: parsedCursor.offset + limit })
      : null

    return {
      results: sliced.map(({ _score, ...result }) => result),
      nextCursor,
    }
  }
}

type RankedClubSearchResult = ClubSearchResult & { _score: number }

type SearchCursor = { offset: number }

function parseSearchCursor(cursor?: string): SearchCursor {
  if (!cursor) return { offset: 0 }

  try {
    const parsed = JSON.parse(cursor) as { offset?: unknown }
    return {
      offset:
        typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) && parsed.offset > 0
          ? Math.min(parsed.offset, MAX_SEARCH_WINDOW)
          : 0,
    }
  } catch {
    return { offset: 0 }
  }
}

function scoreSearchResult(
  normalizedQueries: string[],
  normalizedTokens: string[],
  name: string,
  city: string | null,
  searchText: string | null,
  isActive: boolean,
) {
  const normalizedName = normalizeSearchText(name)
  const normalizedCity = city ? normalizeSearchText(city) : ''
  const haystack = searchText ?? `${normalizedName} ${normalizedCity}`.trim()

  let score = isActive ? 0 : 20

  if (normalizedQueries.some((query) => normalizedName === query)) return score
  if (normalizedQueries.some((query) => normalizedName.startsWith(query))) score += 2
  else if (normalizedQueries.some((query) => haystack.includes(query))) score += 6
  else if (normalizedTokens.length > 1 && normalizedTokens.every((token) => haystack.includes(token))) {
    score += 8
  }
  else score += 12

  if (normalizedQueries.some((query) => normalizedCity.startsWith(query))) score += 1

  return score
}

function normalizeSearchVariants(value: string) {
  const german = normalizeSearchText(value)
  const folded = foldAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  return Array.from(new Set([german, folded].filter(Boolean)))
}

function normalizeSearchTokens(values: string[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => value.split(/\s+/))
        .map((value) => value.trim())
        .filter((value) => value.length >= 2),
    ),
  )
}

function buildActiveSearchText(
  searchText: string | null,
  directoryEntry: {
    name: string
    normalizedName: string
    city: string | null
    association: string | null
  } | null,
) {
  if (!directoryEntry) return searchText

  return [
    searchText,
    directoryEntry.normalizedName,
    normalizeSearchText(
      [directoryEntry.name, directoryEntry.city, directoryEntry.association]
        .filter(Boolean)
        .join(' '),
    ),
  ]
    .filter(Boolean)
    .join(' ')
}

function normalizeSearchText(value: string) {
  return value
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'ae')
    .replace(/Ö/g, 'oe')
    .replace(/Ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function foldAccents(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
