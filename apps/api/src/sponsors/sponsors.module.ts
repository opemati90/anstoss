import { Module } from '@nestjs/common'
import { BillingModule } from '../billing/billing.module'
import { SponsorsController } from './sponsors.controller'
import { SponsorsService } from './sponsors.service'

@Module({
  imports: [BillingModule],
  controllers: [SponsorsController],
  providers: [SponsorsService],
  exports: [SponsorsService],
})
export class SponsorsModule {}
