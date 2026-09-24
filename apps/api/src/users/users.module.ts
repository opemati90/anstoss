import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { ManagedSubProfilesService } from './managed-sub-profiles.service'
import { ParentHandoffController } from './parent-handoff.controller'
import { ParentHandoffService } from './parent-handoff.service'
import { ParentHandoffPurgeWorker } from './parent-handoff-purge.worker'
import { TeamsModule } from '../teams/teams.module'
import { AssetsModule } from '../assets/assets.module'
import { ClubsModule } from '../clubs/clubs.module'
import { InvitesModule } from '../invites/invites.module'
import { MarketplaceModule } from '../marketplace/marketplace.module'
import { AuditModule } from '../audit/audit.module'
import { MemberExportService } from './member-export'

@Module({
  imports: [
    TeamsModule,
    AssetsModule,
    ClubsModule,
    InvitesModule,
    MarketplaceModule,
    AuditModule, // club-admin review fixes: audited member export
  ],
  controllers: [
    UsersController,
    ParentHandoffController,
  ],
  providers: [
    UsersService,
    ManagedSubProfilesService,
    ParentHandoffService,
    ParentHandoffPurgeWorker,
    MemberExportService,
  ],
  exports: [UsersService],
})
export class UsersModule {}
