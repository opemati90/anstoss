import { Module } from '@nestjs/common'
import { ChannelsController } from './channels.controller'
import { ChannelsService } from './channels.service'
import { PrismaModule } from '../prisma/prisma.module'
import { TeamsModule } from '../teams/teams.module'

@Module({
  imports: [PrismaModule, TeamsModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
