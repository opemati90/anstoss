import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { BillingController } from './billing.controller'
import { BillingService } from './billing.service'
import { StripeProvider } from './stripe.provider'
import { EntitlementGuard } from './entitlement.guard'
import { ClubEntitlementsService } from './club-entitlements.service'
import { PlatformEntitlementsController } from './platform-entitlements.controller'
import { EntitlementComplianceWorker } from './entitlement-compliance.worker'
import { PlanController } from './plan.controller'
import { StoreBillingController, StoreBillingWebhookController } from './store-billing.controller'
import { StoreBillingProvider } from './store-billing.provider'
import { StoreBillingService } from './store-billing.service'
import { StoreBillingWorker } from './store-billing.worker'

@Module({
  imports: [AuditModule],
  controllers: [BillingController, PlatformEntitlementsController, PlanController, StoreBillingController, StoreBillingWebhookController],
  providers: [
    StripeProvider,
    BillingService,
    EntitlementGuard,
    ClubEntitlementsService,
    EntitlementComplianceWorker,
    StoreBillingProvider,
    StoreBillingService,
    StoreBillingWorker,
  ],
  exports: [BillingService, EntitlementGuard, ClubEntitlementsService],
})
export class BillingModule {}
