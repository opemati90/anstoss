import { Module } from '@nestjs/common'
import { InvitesModule } from '../invites/invites.module'
import { PublicController } from './public.controller'
import { PublicService } from './public.service'

@Module({
  imports: [InvitesModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
