import { Injectable, NotFoundException } from '@nestjs/common'
import { TeamAccessDeniedError, type BulkRosterSlotsInput } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'

const MANAGER_ROLES = new Set(['OWNER', 'ADMIN'])

@Injectable()
export class RosterSlotsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertManager(userId: string, clubId: string) {
    const m = await this.prisma.membership.findFirst({ where: { userId, clubId } })
    if (!m || !MANAGER_ROLES.has(m.role)) {
      throw new TeamAccessDeniedError('You do not have access to manage roster slots.')
    }
  }

  async bulkUpsert(clubId: string, teamId: string, userId: string, body: BulkRosterSlotsInput) {
    await this.assertManager(userId, clubId)
    const team = await this.prisma.team.findFirst({ where: { id: teamId, clubId } })
    if (!team) throw new NotFoundException('Team not found in this club')
    return this.prisma.$transaction(
      body.slots.map((s) =>
        this.prisma.rosterSlot.create({
          data: {
            teamId,
            fullName: s.fullName,
            dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth) : null,
            position: s.position ?? null,
            jerseyNumber: s.jerseyNumber ?? null,
          },
        }),
      ),
    )
  }

  async list(clubId: string, teamId: string, userId: string) {
    const m = await this.prisma.membership.findFirst({ where: { userId, clubId } })
    if (!m) throw new TeamAccessDeniedError('You do not have access to view roster slots.')
    return this.prisma.rosterSlot.findMany({
      where: { teamId, team: { clubId } },
      orderBy: [{ jerseyNumber: 'asc' }, { fullName: 'asc' }],
    })
  }
}
