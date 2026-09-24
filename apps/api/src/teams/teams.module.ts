import { Module } from '@nestjs/common'
import { TeamsController, TeamLookupController } from './teams.controller'
import { TeamsService } from './teams.service'
import { RosterSlotsController } from './roster-slots.controller'
import { RosterSlotsService } from './roster-slots.service'
import { PlayerLoanExpiryWorker } from './player-loan-expiry.worker'
import { BillingModule } from '../billing/billing.module'
// Kader fix M2: the duty rota pushes the assignee.
import { PushModule } from '../push/push.module'

@Module({
  imports: [BillingModule, PushModule],
  controllers: [TeamsController, TeamLookupController, RosterSlotsController],
  providers: [TeamsService, RosterSlotsService, PlayerLoanExpiryWorker],
  exports: [TeamsService, RosterSlotsService],
})
export class TeamsModule {}
