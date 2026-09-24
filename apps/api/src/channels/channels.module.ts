import { Module } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ChannelsController } from './channels.controller'
import { ChannelsService } from './channels.service'
import { ChatInboxService } from './chat-inbox.service'
import { PrismaModule } from '../prisma/prisma.module'
import { TeamsModule } from '../teams/teams.module'
import { DmModule } from '../dm/dm.module'

@Module({
  imports: [PrismaModule, TeamsModule, EventEmitterModule, DmModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, ChatInboxService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
