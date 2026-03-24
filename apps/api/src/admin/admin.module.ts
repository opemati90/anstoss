import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { InternalAdminGuard } from './internal-admin.guard'

@Module({
  controllers: [AdminController],
  providers: [AdminService, InternalAdminGuard],
})
export class AdminModule {}
