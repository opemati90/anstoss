import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { BillingController } from './billing.controller'
import { BillingService } from './billing.service'
import { StripeProvider } from './stripe.provider'
import { EntitlementGuard } from './entitlement.guard'
import { ClubEntitlementsService } from './club-entitlements.service'
import { PlatformEntitlementsController } from './platform-entitlements.controller'

@Module({
  imports: [AuditModule],
  controllers: [BillingController, PlatformEntitlementsController],
  providers: [StripeProvider, BillingService, EntitlementGuard, ClubEntitlementsService],
  exports: [BillingService, EntitlementGuard, ClubEntitlementsService],
})
export class BillingModule {}
