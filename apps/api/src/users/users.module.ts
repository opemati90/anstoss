import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { TeamsModule } from '../teams/teams.module'
import { AssetsModule } from '../assets/assets.module'
import { ClubsModule } from '../clubs/clubs.module'
import { InvitesModule } from '../invites/invites.module'
import { MarketplaceModule } from '../marketplace/marketplace.module'

@Module({
  imports: [
    TeamsModule,
    AssetsModule,
    ClubsModule,
    InvitesModule,
    MarketplaceModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
