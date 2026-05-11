import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { InternalAdminGuard } from './internal-admin.guard'
import { PlatformAdminGuard } from './platform-admin.guard'

@Module({
  imports: [AuditModule],
  controllers: [AdminController],
  // InternalAdminGuard is kept for backward compatibility; new routes
  // should use PlatformAdminGuard which accepts both the DB flag and the
  // legacy email allowlist.
  providers: [AdminService, InternalAdminGuard, PlatformAdminGuard],
})
export class AdminModule {}
