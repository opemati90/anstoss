import { Module } from '@nestjs/common'
import { PushModule } from '../push/push.module'
import { MarketplaceController } from './marketplace.controller'
import { MarketplaceService } from './marketplace.service'

@Module({
  imports: [PushModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
