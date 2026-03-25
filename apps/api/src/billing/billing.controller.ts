import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { MembershipRole } from '@anstoss/shared'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RequireRole, RolesGuard } from '../auth/roles.guard'
import { BillingService } from './billing.service'

@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('clubs/:clubId/billing/status')
  @UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  getStatus(@Param('clubId') clubId: string) {
    return this.billingService.getStatus(clubId)
  }

  @Get('clubs/:clubId/billing/entitlements')
  @UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  getEntitlements(@Param('clubId') clubId: string) {
    return this.billingService.getEntitlements(clubId)
  }

  @Post('billing/webhooks/stripe')
  acknowledgeStripeWebhook() {
    return this.billingService.acknowledgeStripeWebhook()
  }
}
