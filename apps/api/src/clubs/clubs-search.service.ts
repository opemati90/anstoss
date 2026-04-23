import { Injectable } from '@nestjs/common'
import type { ClubSearchQuery, ClubSearchResponse } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ClubsSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: ClubSearchQuery): Promise<ClubSearchResponse> {
    const { q, limit, cursor } = query

    const rows = await this.prisma.club.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        badgeUrl: true,
        primaryColor: true,
        city: true,
        _count: { select: { memberships: true } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = rows.length > limit
    const sliced = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? sliced[sliced.length - 1].id : null

    return {
      results: sliced.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        badgeUrl: r.badgeUrl,
        primaryColor: r.primaryColor,
        city: r.city,
        memberCount: r._count.memberships,
      })),
      nextCursor,
    }
  }
}
