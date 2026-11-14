import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common'
import { studioContextQuerySchema, updateStudioBrandKitSchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { StudioService } from './studio.service'

@Controller('clubs/:clubId/studio')
@UseGuards(ClerkAuthGuard, AgeGateGuard)
export class StudioController {
  constructor(private readonly studio: StudioService) {}

  @Get('context')
  @RateLimit('read')
  context(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Query() query: unknown,
  ) {
    return this.studio.context(clubId, user.id, studioContextQuerySchema.parse(query))
  }

  @Get('brand-kit')
  @RateLimit('read')
  brandKit(@Param('clubId') clubId: string, @CurrentUser() user: { id: string }) {
    return this.studio.brandKit(clubId, user.id)
  }

  @Put('brand-kit')
  @RateLimit('write')
  updateBrandKit(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    return this.studio.updateBrandKit(clubId, user.id, updateStudioBrandKitSchema.parse(body))
  }
}
