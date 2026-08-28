import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { BillingController } from './billing.controller'
import { BillingService } from './billing.service'
import { StripeProvider } from './stripe.provider'
import { EntitlementGuard } from './entitlement.guard'
import { ClubEntitlementsService } from './club-entitlements.service'
import { PlatformEntitlementsController } from './platform-entitlements.controller'
import { EntitlementComplianceWorker } from './entitlement-compliance.worker'

@Module({
  imports: [AuditModule],
  controllers: [BillingController, PlatformEntitlementsController],
  providers: [
    StripeProvider,
    BillingService,
    EntitlementGuard,
    ClubEntitlementsService,
    EntitlementComplianceWorker,
  ],
  exports: [BillingService, EntitlementGuard, ClubEntitlementsService],
})
export class BillingModule {}
