import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  RawBody,
  UseGuards,
} from '@nestjs/common'
import { MembershipRole } from '@anstoss/shared'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RequireRole, RolesGuard } from '../auth/roles.guard'
import { RateLimit } from '../rate-limit/rate-limit.guard'
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

  /**
   * POST /clubs/:clubId/billing/subscribe — create an Anstoss software subscription.
   *
   * This is a backend/admin-web lifecycle endpoint. Store-submitted mobile
   * builds do not expose external digital checkout links, and club member
   * contributions are paid directly to the club bank account.
   */
  @Post('clubs/:clubId/billing/subscribe')
  @UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
  @RequireRole(MembershipRole.OWNER)
  @RateLimit('write')
  async createSubscription(
    @Param('clubId') clubId: string,
    @Body() body: { priceId: string },
  ) {
    // Returns a Stripe-hosted Checkout URL for the club's Anstoss software
    // subscription. This route is intentionally not wired to store-submitted
    // mobile paywall flows.
    return this.billingService.createCheckoutSession(clubId, body.priceId)
  }

  /**
   * POST /clubs/:clubId/billing/cancel — cancel subscription at period end.
   */
  @Post('clubs/:clubId/billing/cancel')
  @UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
  @RequireRole(MembershipRole.OWNER)
  @RateLimit('write')
  async cancelSubscription(@Param('clubId') clubId: string) {
    await this.billingService.cancelSubscription(clubId)
    return { cancelled: true }
  }

  /**
   * POST /billing/webhooks/stripe — Stripe webhook receiver.
   * Raw body required for signature verification.
   */
  @Post('billing/webhooks/stripe')
  async handleStripeWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.billingService.handleWebhook(rawBody, signature)
  }
}
