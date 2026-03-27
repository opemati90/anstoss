import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { InternalAdminGuard } from './internal-admin.guard'

@Module({
  imports: [AuditModule],
  controllers: [AdminController],
  providers: [AdminService, InternalAdminGuard],
})
export class AdminModule {}
