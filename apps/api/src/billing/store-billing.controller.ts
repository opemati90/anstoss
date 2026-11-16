import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common'
import {
  MembershipRole, appleNotificationSchema, googleNotificationDataSchema,
  googleNotificationSchema, storeBillingRequestSchema, storeCheckoutRequestSchema, storePlatformSchema,
} from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { RequireRole, RolesGuard } from '../auth/roles.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { StoreBillingService } from './store-billing.service'
import { StoreBillingProvider } from './store-billing.provider'
import { ANSTOSS_BUNDLE_ID, InvalidStorePurchaseException } from './store-purchase'

@Controller('clubs/:clubId/plan/store')
@UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
@RequireRole(MembershipRole.PARENT)
export class StoreBillingController {
  constructor(private readonly billing: StoreBillingService) {}

  @Get()
  @RateLimit('read')
  status(@Param('clubId') clubId: string, @CurrentUser() user: { id: string }, @Query('store') store: unknown) {
    return this.billing.status(clubId, user.id, storePlatformSchema.parse(store))
  }

  @Post('prepare')
  @RateLimit('write')
  prepare(@Param('clubId') clubId: string, @CurrentUser() user: { id: string }, @Body() body: unknown) {
    const parsed = storeCheckoutRequestSchema.parse(body)
    return this.billing.prepare(clubId, user.id, parsed.store, parsed.productId)
  }

  @Post('verify')
  @RateLimit('write')
  verify(@Param('clubId') clubId: string, @CurrentUser() user: { id: string }, @Body() body: unknown) {
    return this.billing.verifyForUser(clubId, user.id, storeBillingRequestSchema.parse(body))
  }
}

@Controller('billing/webhooks')
export class StoreBillingWebhookController {
  constructor(private readonly billing: StoreBillingService, private readonly provider: StoreBillingProvider) {}

  @Post('apple')
  @HttpCode(200)
  async apple(@Body() body: unknown) {
    const input = await this.provider.appleNotification(appleNotificationSchema.parse(body).signedPayload)
    if (input) await this.billing.reconcile(input)
    return { received: true }
  }

  @Post('google')
  @HttpCode(200)
  async google(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    await this.provider.verifyGoogleNotification(authorization)
    const envelope = googleNotificationSchema.parse(body)
    let decoded: unknown
    try { decoded = JSON.parse(Buffer.from(envelope.message.data, 'base64').toString('utf8')) }
    catch { throw new InvalidStorePurchaseException() }
    const data = googleNotificationDataSchema.parse(decoded)
    if (data.packageName !== ANSTOSS_BUNDLE_ID) throw new InvalidStorePurchaseException()
    if (data.subscriptionNotification) {
      // Google RTDN omits the test flag; read it from the authenticated API.
      const reference = data.subscriptionNotification.purchaseToken
      const verified = await this.provider.verifyGoogleReference(reference)
      await this.billing.reconcile({ store: 'GOOGLE', reference, environment: verified.environment })
    }
    return { received: true }
  }
}
