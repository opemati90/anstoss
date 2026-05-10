import { Module } from '@nestjs/common'
import { ModerationController } from './moderation.controller'
import { ModerationService } from './moderation.service'
import { TeamsModule } from '../teams/teams.module'
import { ChannelsModule } from '../channels/channels.module'

@Module({
  imports: [TeamsModule, ChannelsModule],
  controllers: [ModerationController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
