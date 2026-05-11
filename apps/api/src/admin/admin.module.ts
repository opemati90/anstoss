import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { PushModule } from '../push/push.module'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { BroadcastsService } from './broadcasts.service'
import { FeatureFlagsService } from './feature-flags.service'
import { ModerationService } from './moderation.service'
import { PlatformSettingsService } from './platform-settings.service'
import { InternalAdminGuard } from './internal-admin.guard'
import { PlatformAdminGuard } from './platform-admin.guard'

@Module({
  imports: [AuditModule, PushModule],
  controllers: [AdminController],
  // InternalAdminGuard is kept for backward compatibility; new routes
  // should use PlatformAdminGuard which accepts both the DB flag and the
  // legacy email allowlist.
  providers: [
    AdminService,
    BroadcastsService,
    FeatureFlagsService,
    ModerationService,
    PlatformSettingsService,
    InternalAdminGuard,
    PlatformAdminGuard,
  ],
  exports: [PlatformSettingsService],
})
export class AdminModule {}
