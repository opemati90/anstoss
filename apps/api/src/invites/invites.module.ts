import { Module } from '@nestjs/common'
import { InvitesController } from './invites.controller'
import { InvitesService } from './invites.service'
import { TeamsModule } from '../teams/teams.module'
import { ChannelsModule } from '../channels/channels.module'

@Module({
  imports: [TeamsModule, ChannelsModule],
  controllers: [InvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
