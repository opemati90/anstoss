import { Controller, Get, Param } from '@nestjs/common'
import { PublicService } from './public.service'

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('platform')
  getPlatformInfo() {
    return this.publicService.getPlatformInfo()
  }

  @Get('invites/:code')
  async getInvite(@Param('code') code: string) {
    return this.publicService.getInvite(code)
  }
}
