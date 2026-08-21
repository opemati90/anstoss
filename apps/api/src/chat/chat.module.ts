import { Module, forwardRef } from '@nestjs/common'
import { ChatGateway } from './chat.gateway'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'
import { PrismaModule } from '../prisma/prisma.module'
import { PushModule } from '../push/push.module'
import { TeamsModule } from '../teams/teams.module'
import { DmModule } from '../dm/dm.module'
import { TranslationModule } from '../translation/translation.module'
import { ChannelsModule } from '../channels/channels.module'
import { BillingModule } from '../billing/billing.module'
import { ModerationModule } from '../moderation/moderation.module'
import { AssetsModule } from '../assets/assets.module'

@Module({
  imports: [
    PrismaModule,
    PushModule,
    TeamsModule,
    DmModule,
    TranslationModule,
    ChannelsModule,
    BillingModule,
    AssetsModule,
    forwardRef(() => ModerationModule),
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
