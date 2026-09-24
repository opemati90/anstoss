import { Module } from '@nestjs/common'
import { AssetsModule } from '../assets/assets.module'
import { PushModule } from '../push/push.module'
import { MarketplaceController } from './marketplace.controller'
import { MarketplaceService } from './marketplace.service'
import { PlayerSearchService } from './player-search.service'
import { BillingModule } from '../billing/billing.module'
import { WechselRetentionWorker } from './wechsel-retention.worker'

@Module({
  imports: [PushModule, AssetsModule, BillingModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceService, PlayerSearchService, WechselRetentionWorker],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
