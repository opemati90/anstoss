import { Module } from '@nestjs/common'
import { MessagesController } from './messages.controller'
import { MessagesService } from './messages.service'
import { PrismaModule } from '../prisma/prisma.module'
import { TeamsModule } from '../teams/teams.module'
import { ChannelsModule } from '../channels/channels.module'

@Module({
  imports: [PrismaModule, TeamsModule, ChannelsModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
