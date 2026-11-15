import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import {
  createSupportTicketSchema,
  supportListSchema,
  supportReplySchema,
  updateSupportStatusSchema,
} from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AllowWithoutConsent } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { PlatformAdminGuard } from '../admin/platform-admin.guard'
import { type PlatformAdminRequestUser, toPlatformAdminActor } from '../admin/platform-admin.types'
import { SupportService } from './support.service'

@Controller('me/support')
@UseGuards(ClerkAuthGuard)
@AllowWithoutConsent()
export class SupportController {
  constructor(private readonly support: SupportService) {}
  @Get()
  @RateLimit('read')
  list(@CurrentUser() user: { id: string }, @Query() query: unknown) {
    return this.support.listForUser(user.id, supportListSchema.parse(query).offset)
  }
  @Post()
  @RateLimit('write')
  create(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    return this.support.create(user.id, createSupportTicketSchema.parse(body))
  }
  @Get(':id')
  @RateLimit('read')
  detail(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.support.detail(id, user.id)
  }
  @Post(':id/replies')
  @RateLimit('write')
  reply(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() body: unknown) {
    return this.support.reply(id, supportReplySchema.parse(body), user.id)
  }
}

@Controller('admin/support-tickets')
@UseGuards(PlatformAdminGuard)
export class SupportAdminController {
  constructor(private readonly support: SupportService) {}
  @Get()
  @RateLimit('read')
  list(@Query() query: unknown) {
    const input = supportListSchema.parse(query)
    return this.support.listForAdmin(input.status, input.offset)
  }
  @Get(':id')
  @RateLimit('read')
  detail(@Param('id') id: string) {
    return this.support.detail(id)
  }
  @Post(':id/replies')
  @RateLimit('write')
  reply(
    @CurrentUser() user: PlatformAdminRequestUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.support.reply(id, supportReplySchema.parse(body), null, toPlatformAdminActor(user))
  }
  @Patch(':id')
  @RateLimit('write')
  status(
    @CurrentUser() user: PlatformAdminRequestUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.support.setStatus(
      id,
      updateSupportStatusSchema.parse(body).status,
      toPlatformAdminActor(user),
    )
  }
}
