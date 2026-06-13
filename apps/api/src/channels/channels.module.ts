import { Module } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ChannelsController } from './channels.controller'
import { ChannelsService } from './channels.service'
import { PrismaModule } from '../prisma/prisma.module'
import { TeamsModule } from '../teams/teams.module'

@Module({
  imports: [PrismaModule, TeamsModule, EventEmitterModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
