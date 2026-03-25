import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { MembershipRole } from '@anstoss/shared'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RequireRole, RolesGuard } from '../auth/roles.guard'
import { AuditService } from './audit.service'

@Controller('clubs/:clubId/audit')
@UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('feed')
  @RequireRole(MembershipRole.ADMIN)
  getClubFeed(@Param('clubId') clubId: string) {
    return this.auditService.getClubFeed(clubId)
  }
}
