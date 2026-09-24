import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import {
  COMPLIANCE_KINDS,
  MembershipRole,
  remindComplianceSchema,
  updateComplianceRecordSchema,
  upsertComplianceRecordSchema,
  type ComplianceKind,
} from '@anstoss/shared'
import { z } from 'zod'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RequireRole, RolesGuard } from '../auth/roles.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { AdminInboxService } from './admin-inbox.service'
import { ComplianceService } from './compliance.service'
import { COMPLIANCE_FEATURE_ENABLED } from './compliance-release'

const complianceKindQuery = z.enum(COMPLIANCE_KINDS).optional()

/**
 * Club-admin workspace endpoints: the "Aufgaben" inbox, compliance records
 * (Führungszeugnis & member documents) and the admin member sheet. Every
 * route requires ADMIN (OWNER passes via the role hierarchy).
 */
@Controller('clubs/:clubId')
@UseGuards(ClerkAuthGuard, RolesGuard)
@RequireRole(MembershipRole.ADMIN)
export class AdminInboxController {
  constructor(
    private readonly inbox: AdminInboxService,
    private readonly compliance: ComplianceService,
  ) {}

  @Get('admin-inbox')
  getInbox(@Param('clubId') clubId: string, @CurrentUser() user: { id: string }) {
    return this.inbox.getInbox(clubId, user.id)
  }

  @Get('members/:userId/admin-summary')
  getMemberSummary(
    @Param('clubId') clubId: string,
    @Param('userId') memberUserId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.inbox.getMemberSummary(clubId, user.id, memberUserId)
  }

  @Get('compliance')
  listCompliance(@Param('clubId') clubId: string, @Query('kind') kind?: string) {
    if (!COMPLIANCE_FEATURE_ENABLED) throw new NotFoundException('Compliance feature is unavailable')
    const parsed = complianceKindQuery.parse(kind || undefined) as ComplianceKind | undefined
    return this.compliance.list(clubId, parsed)
  }

  @Post('compliance')
  @RateLimit('write')
  upsertCompliance(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    if (!COMPLIANCE_FEATURE_ENABLED) throw new NotFoundException('Compliance feature is unavailable')
    return this.compliance.upsert(clubId, user.id, upsertComplianceRecordSchema.parse(body))
  }

  @Post('compliance/remind')
  @RateLimit('write')
  remindCompliance(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    if (!COMPLIANCE_FEATURE_ENABLED) throw new NotFoundException('Compliance feature is unavailable')
    return this.compliance.remind(clubId, user.id, remindComplianceSchema.parse(body))
  }

  @Patch('compliance/:id')
  @RateLimit('write')
  updateCompliance(
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    if (!COMPLIANCE_FEATURE_ENABLED) throw new NotFoundException('Compliance feature is unavailable')
    return this.compliance.update(clubId, id, user.id, updateComplianceRecordSchema.parse(body))
  }
}
