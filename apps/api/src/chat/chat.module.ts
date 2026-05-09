import { Module } from '@nestjs/common'
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

@Module({
  imports: [
    PrismaModule,
    PushModule,
    TeamsModule,
    DmModule,
    TranslationModule,
    ChannelsModule,
    BillingModule,
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
