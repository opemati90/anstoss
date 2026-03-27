import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import {
  assetPresignRequestSchema,
  MembershipRole,
} from '@anstoss/shared'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RequireRole, RolesGuard } from '../auth/roles.guard'
import { AssetsService } from './assets.service'

@Controller('clubs/:clubId/assets')
@UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post('presign')
  @RequireRole(MembershipRole.ADMIN)
  async createUploadIntent(@Param('clubId') clubId: string, @Body() body: unknown) {
    const input = assetPresignRequestSchema.parse(body)
    return this.assetsService.createUploadIntent(clubId, input)
  }
}
