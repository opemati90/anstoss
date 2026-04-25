import { Module } from '@nestjs/common'
import { TeamsController, TeamLookupController } from './teams.controller'
import { TeamsService } from './teams.service'

@Module({
  controllers: [TeamsController, TeamLookupController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
