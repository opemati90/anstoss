import { Module } from '@nestjs/common'
import { AssetsModule } from '../assets/assets.module'
import { PushModule } from '../push/push.module'
import { MarketplaceController } from './marketplace.controller'
import { MarketplaceService } from './marketplace.service'

@Module({
  imports: [PushModule, AssetsModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
