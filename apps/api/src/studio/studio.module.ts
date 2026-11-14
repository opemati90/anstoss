import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { BillingModule } from '../billing/billing.module'
import { StudioController } from './studio.controller'
import { StudioService } from './studio.service'

@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [StudioController],
  providers: [StudioService],
})
export class StudioModule {}
