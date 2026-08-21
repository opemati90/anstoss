import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { R2Provider } from '../assets/r2.provider'

export type SponsorRow = {
  id: string
  clubId: string
  name: string
  logoUrl: string
  linkUrl: string | null
  displayOrder: number
  createdAt: string
  updatedAt: string
}

export type CreateSponsorInput = {
  name: string
  logoUrl: string
  linkUrl?: string | null
  displayOrder?: number
}

export type UpdateSponsorInput = {
  name?: string
  logoUrl?: string
  linkUrl?: string | null
  displayOrder?: number
}

function toSponsorRow(record: {
  id: string
  clubId: string
  name: string
  logoUrl: string
  linkUrl: string | null
  displayOrder: number
  createdAt: Date
  updatedAt: Date
}): SponsorRow {
  return {
    id: record.id,
    clubId: record.clubId,
    name: record.name,
    logoUrl: record.logoUrl,
    linkUrl: record.linkUrl,
    displayOrder: record.displayOrder,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

@Injectable()
export class SponsorsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly r2?: R2Provider,
  ) {}

  private async assertOwnedLogo(clubId: string, url: string): Promise<void> {
    if (!this.r2?.enabled) return
    const objectKey = this.r2.objectKeyFromUrl(url)
    if (!objectKey || !objectKey.startsWith(`${clubId}/sponsor_logo/`)) {
      throw new BadRequestException('Sponsor logo does not belong to this club upload')
    }
    try {
      await this.r2.assertStoredObject(objectKey, {
        maxBytes: 10 * 1024 * 1024,
        allowedContentTypes: new Set([
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/heic',
        ]),
      })
    } catch {
      throw new BadRequestException('Sponsor logo upload is invalid or incomplete')
    }
  }

  /**
   * List sponsors for a club. Reads stay open even when the plan
   * lapses — downgraded clubs can still see and delete their existing
   * sponsors. Ordering: displayOrder asc, then createdAt asc as a
   * stable secondary sort when displayOrder collides.
   */
  async list(clubId: string): Promise<SponsorRow[]> {
    const rows = await this.prisma.sponsor.findMany({
      where: { clubId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    })
    return rows.map(toSponsorRow)
  }

  async create(
    clubId: string,
    input: CreateSponsorInput,
  ): Promise<SponsorRow> {
    await this.assertOwnedLogo(clubId, input.logoUrl)
    const created = await this.prisma.sponsor.create({
      data: {
        clubId,
        name: input.name,
        logoUrl: input.logoUrl,
        linkUrl: input.linkUrl ?? null,
        displayOrder: input.displayOrder ?? 0,
      },
    })
    return toSponsorRow(created)
  }

  async update(
    clubId: string,
    id: string,
    input: UpdateSponsorInput,
  ): Promise<SponsorRow> {
    const existing = await this.prisma.sponsor.findFirst({
      where: { id, clubId },
    })
    if (!existing) {
      throw new NotFoundException('Sponsor not found')
    }
    if (input.logoUrl !== undefined) {
      await this.assertOwnedLogo(clubId, input.logoUrl)
    }
    const updated = await this.prisma.sponsor.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl } : {}),
        ...(input.displayOrder !== undefined
          ? { displayOrder: input.displayOrder }
          : {}),
      },
    })
    return toSponsorRow(updated)
  }

  async remove(clubId: string, id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.sponsor.findFirst({
      where: { id, clubId },
    })
    if (!existing) {
      throw new NotFoundException('Sponsor not found')
    }
    await this.prisma.sponsor.delete({ where: { id } })
    return { ok: true }
  }
}
