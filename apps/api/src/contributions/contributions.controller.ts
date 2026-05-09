import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import {
  createContributionPlanSchema,
  sendContributionReminderSchema,
  updateContributionAssignmentsSchema,
  updateContributionMemberStatusSchema,
  updateContributionPlanSchema,
  updateContributionSettingsSchema,
} from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { ContributionsService } from './contributions.service'

function pickLocale(acceptLanguage?: string): 'en' | 'de' {
  if (!acceptLanguage) return 'en'
  const primary = acceptLanguage.split(',')[0]?.trim().toLowerCase() ?? ''
  if (primary.startsWith('de')) return 'de'
  return 'en'
}

@Controller('clubs/:clubId/contributions')
@UseGuards(ClerkAuthGuard, AgeGateGuard)
export class ContributionsController {
  constructor(private readonly contributionsService: ContributionsService) {}

  @Get('my')
  async getMyContributions(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.contributionsService.getMyContributions(
      clubId,
      user.id,
      pickLocale(acceptLanguage),
    )
  }

  @Post('my/:planId/pay')
  @RateLimit('write')
  async markOwnAsPaid(
    @Param('clubId') clubId: string,
    @Param('planId') planId: string,
    @CurrentUser() user: { id: string },
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.contributionsService.markOwnAsPaid(
      clubId,
      user.id,
      planId,
      pickLocale(acceptLanguage),
    )
  }

  @Get()
  async getOverview(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.contributionsService.getOverview(clubId, user.id)
  }

  @Get('settings')
  async getSettings(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.contributionsService.getSettings(clubId, user.id)
  }

  @Patch('settings')
  @RateLimit('write')
  async updateSettings(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = updateContributionSettingsSchema.parse(body)
    return this.contributionsService.updateSettings(clubId, user.id, data)
  }

  @Get('plans')
  async listPlans(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.contributionsService.listPlans(clubId, user.id)
  }

  @Post('plans')
  @RateLimit('write')
  async createPlan(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = createContributionPlanSchema.parse(body)
    return this.contributionsService.createPlan(clubId, user.id, data)
  }

  @Patch('plans/:planId')
  @RateLimit('write')
  async updatePlan(
    @Param('clubId') clubId: string,
    @Param('planId') planId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = updateContributionPlanSchema.parse(body)
    return this.contributionsService.updatePlan(clubId, planId, user.id, data)
  }

  @Post('assignments')
  @RateLimit('write')
  async replaceAssignments(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = updateContributionAssignmentsSchema.parse(body)
    return this.contributionsService.replaceAssignments(clubId, user.id, data)
  }

  @Patch('members/:memberUserId/status')
  @RateLimit('write')
  async updateMemberStatus(
    @Param('clubId') clubId: string,
    @Param('memberUserId') memberUserId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = updateContributionMemberStatusSchema.parse(body)
    return this.contributionsService.updateMemberStatus(
      clubId,
      memberUserId,
      user.id,
      data,
    )
  }

  @Post('reminders/send')
  @RateLimit('write')
  async sendReminders(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = sendContributionReminderSchema.parse(body)
    return this.contributionsService.sendManualReminders(clubId, user.id, data)
  }
}
