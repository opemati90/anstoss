import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PushModule } from '../push/push.module'
import { TeamsModule } from '../teams/teams.module'
import { LiveModule } from '../live/live.module'
import { FussballController } from './fussball.controller'
import { FussballProviderService } from './fussball.provider'
import { FussballScraperClient } from './fussball-scraper.client'
import { FussballService } from './fussball.service'

@Module({
  imports: [AuthModule, TeamsModule, PushModule, LiveModule],
  controllers: [FussballController],
  providers: [FussballProviderService, FussballScraperClient, FussballService],
  exports: [FussballService, FussballScraperClient],
})
export class IntegrationsModule {}
