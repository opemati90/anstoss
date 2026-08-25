import { Module } from '@nestjs/common'
import { AssetsModule } from '../assets/assets.module'
import { PushModule } from '../push/push.module'
import { MarketplaceController } from './marketplace.controller'
import { MarketplaceService } from './marketplace.service'
import { BillingModule } from '../billing/billing.module'

@Module({
  imports: [PushModule, AssetsModule, BillingModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
