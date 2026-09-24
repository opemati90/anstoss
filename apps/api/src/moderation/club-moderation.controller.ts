import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { MembershipRole, resolveModerationReportSchema } from '@anstoss/shared'
import { z } from 'zod'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { RequireRole, RolesGuard } from '../auth/roles.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { ClubModerationService } from './club-moderation.service'

const listQuery = z.object({
  status: z.enum(['open', 'resolved', 'all']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

/**
 * UGC moderation queue for club OWNER/ADMIN (first-line moderators).
 * Process: docs/compliance/UGC_MODERATION.md.
 */
@Controller('clubs/:clubId/moderation')
@UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
@RequireRole(MembershipRole.ADMIN)
export class ClubModerationController {
  constructor(private readonly moderation: ClubModerationService) {}

  @Get('reports')
  listReports(
    @Param('clubId') clubId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const query = listQuery.parse({ status, limit })
    return this.moderation.listReports(clubId, query)
  }

  @Post('reports/:reportId/resolve')
  @RateLimit('write')
  resolveReport(
    @Param('clubId') clubId: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const input = resolveModerationReportSchema.parse(body)
    return this.moderation.resolveReport(clubId, reportId, user.id, input)
  }
}
