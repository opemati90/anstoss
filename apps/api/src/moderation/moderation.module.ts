import { Module } from '@nestjs/common'
import { ModerationController } from './moderation.controller'
import { ModerationService } from './moderation.service'
import { ClubModerationController } from './club-moderation.controller'
import { ClubModerationService } from './club-moderation.service'
import { ModerationSafetyWorker, PlatformSafetyAlerter } from './moderation-safety'
import { TeamsModule } from '../teams/teams.module'
import { ChannelsModule } from '../channels/channels.module'
import { PushModule } from '../push/push.module'
import { AssetsModule } from '../assets/assets.module'

@Module({
  imports: [TeamsModule, ChannelsModule, PushModule, AssetsModule],
  controllers: [ModerationController, ClubModerationController],
  providers: [
    ModerationService,
    ClubModerationService,
    // Safeguarding review: platform alerts, overdue sweep, evidence retention.
    PlatformSafetyAlerter,
    ModerationSafetyWorker,
  ],
  exports: [ModerationService, PlatformSafetyAlerter],
})
export class ModerationModule {}
