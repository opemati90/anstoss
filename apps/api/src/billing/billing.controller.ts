import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  RawBody,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
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
   * POST /clubs/:clubId/billing/connect — start or resume Stripe Connect onboarding.
   * Returns { url } that the mobile app loads in a WebView.
   */
  @Post('clubs/:clubId/billing/connect')
  @UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  @RateLimit('write')
  async createConnectAccount(
    @Param('clubId') clubId: string,
    @Body() body: { returnUrl?: string; refreshUrl?: string },
  ) {
    const baseUrl = process.env.APP_URL ?? 'https://api.anstoss.io'
    return this.billingService.createConnectAccount(
      clubId,
      body.returnUrl ?? `${baseUrl}/clubs/${clubId}/billing/connect/return`,
      body.refreshUrl ?? `${baseUrl}/clubs/${clubId}/billing/connect/refresh-redirect`,
    )
  }

  /**
   * POST /clubs/:clubId/billing/connect/refresh — check if Connect onboarding completed.
   */
  @Post('clubs/:clubId/billing/connect/refresh')
  @UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  refreshConnectStatus(@Param('clubId') clubId: string) {
    return this.billingService.refreshConnectStatus(clubId)
  }

  /**
   * GET /clubs/:clubId/billing/connect/return — Stripe redirects here after onboarding.
   * Redirects into the app via deep link scheme.
   */
  @Get('clubs/:clubId/billing/connect/return')
  connectReturn(@Res() res: Response) {
    res.redirect('anstoss://stripe-connect?status=complete')
  }

  /**
   * GET /clubs/:clubId/billing/connect/refresh-redirect — Stripe redirects here on refresh.
   */
  @Get('clubs/:clubId/billing/connect/refresh-redirect')
  connectRefreshRedirect(@Res() res: Response) {
    res.redirect('anstoss://stripe-connect?status=refresh')
  }

  /**
   * POST /clubs/:clubId/billing/subscribe — create a SEPA/card subscription.
   */
  @Post('clubs/:clubId/billing/subscribe')
  @UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
  @RequireRole(MembershipRole.OWNER)
  @RateLimit('write')
  async createSubscription(
    @Param('clubId') clubId: string,
    @Body() body: { priceId: string },
  ) {
    // Returns a Stripe-hosted Checkout URL — mobile PaywallSheet opens
    // it via Linking.openURL. The legacy createSubscription path
    // (default_incomplete + clientSecret) is still on the service for
    // a future PaymentSheet integration.
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
