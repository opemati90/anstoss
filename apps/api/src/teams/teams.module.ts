import { Module } from '@nestjs/common'
import { TeamsController, TeamLookupController } from './teams.controller'
import { TeamsService } from './teams.service'
import { RosterSlotsController } from './roster-slots.controller'
import { RosterSlotsService } from './roster-slots.service'

@Module({
  controllers: [TeamsController, TeamLookupController, RosterSlotsController],
  providers: [TeamsService, RosterSlotsService],
  exports: [TeamsService, RosterSlotsService],
})
export class TeamsModule {}
