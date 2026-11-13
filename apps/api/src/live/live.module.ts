import { Module } from '@nestjs/common'
import { LiveGateway } from './live.gateway'
import { PrismaModule } from '../prisma/prisma.module'
import { TeamsModule } from '../teams/teams.module'
import { PushModule } from '../push/push.module'
import { MatchLiveController } from './match-live.controller'
import { MatchLiveService } from './match-live.service'

@Module({
  imports: [PrismaModule, TeamsModule, PushModule],
  controllers: [MatchLiveController],
  providers: [LiveGateway, MatchLiveService],
  exports: [LiveGateway, MatchLiveService],
})
export class LiveModule {}
