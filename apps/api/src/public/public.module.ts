import { Module } from '@nestjs/common'
import { IntegrationsModule } from '../integrations/integrations.module'
import { InvitesModule } from '../invites/invites.module'
import { PublicController } from './public.controller'
import { PublicService } from './public.service'

@Module({
  imports: [InvitesModule, IntegrationsModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
