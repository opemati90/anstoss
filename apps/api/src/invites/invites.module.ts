import { Module } from '@nestjs/common'
import { InvitesController } from './invites.controller'
import { InvitesService } from './invites.service'
import { TeamsModule } from '../teams/teams.module'
import { ChannelsModule } from '../channels/channels.module'
import { BillingModule } from '../billing/billing.module'

@Module({
  imports: [TeamsModule, ChannelsModule, BillingModule],
  controllers: [InvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
