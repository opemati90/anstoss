import { Module } from '@nestjs/common'
import { MotmController } from './motm.controller'
import { MotmService } from './motm.service'
import { PrismaModule } from '../prisma/prisma.module'
import { TeamsModule } from '../teams/teams.module'
import { BillingModule } from '../billing/billing.module'

@Module({
  imports: [PrismaModule, TeamsModule, BillingModule],
  controllers: [MotmController],
  providers: [MotmService],
})
export class MotmModule {}
