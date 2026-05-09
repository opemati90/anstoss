import { Module } from '@nestjs/common'
import { ScoutingController } from './scouting.controller'
import { ScoutingService } from './scouting.service'
import { BillingModule } from '../billing/billing.module'

@Module({
  imports: [BillingModule],
  controllers: [ScoutingController],
  providers: [ScoutingService],
})
export class ScoutingModule {}
