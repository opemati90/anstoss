import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { claimPhoneSchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard, AllowWithoutConsent } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { OnboardingService } from './onboarding.service'

@Controller('onboarding')
@UseGuards(ClerkAuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  // Legacy compatibility route. The service rejects it outside Jest because
  // email OTP cannot prove possession of a coach-entered phone number.
  @AllowWithoutConsent()
  @Get('pending-claims')
  @RateLimit('write')
  async listPendingClaims(
    @CurrentUser() _user: { id: string },
    @Query('phone') phone?: string,
  ) {
    return this.onboarding.listPendingClaims(phone)
  }

  // NOTE: no AgeGateGuard here — claim runs before the DOB wizard and
  // claimSlot() copies the coach-set DOB from the slot itself, so the
  // guard's "DOB required" check would dead-end the auto-claim happy
  // path. Self-service joins (join-team) remain age-gated below.
  @AllowWithoutConsent()
  @Post('claim/:slotId')
  @RateLimit('write')
  async claim(
    @CurrentUser() user: { id: string },
    @Param('slotId') slotId: string,
    @Body() body: unknown,
  ) {
    const { phone } = claimPhoneSchema.parse(body)
    const result = await this.onboarding.claimSlot(user.id, phone, slotId)
    return { ok: true, ...result }
  }

  // Onboarding review fix (M5): a code-guessing surface, so write-limited.
  @Post('join-team')
  @UseGuards(AgeGateGuard)
  @RateLimit('write')
  async joinTeam(
    @CurrentUser() user: { id: string },
    @Body() body: { joinCode?: string; role?: string; teamRole?: string },
  ) {
    const role = body.role
    // Parent setup uses /parent-handoff/redeem so the guardian can link a
    // child roster slot atomically. Only PLAYER and COACH self-join here.
    if (role !== 'PLAYER' && role !== 'COACH') {
      throw new BadRequestException('Unsupported role for team-code join')
    }
    if (!body.joinCode || typeof body.joinCode !== 'string') {
      throw new BadRequestException('joinCode is required')
    }
    // M4: a coach says whether they are the head coach or an assistant.
    const teamRole =
      body.teamRole === undefined || body.teamRole === 'ASSISTANT_COACH'
        ? 'ASSISTANT_COACH'
        : body.teamRole === 'HEAD_COACH'
          ? 'HEAD_COACH'
          : null
    if (!teamRole) {
      throw new BadRequestException('Unsupported coach role')
    }
    const result = await this.onboarding.joinTeamByCode(user.id, {
      joinCode: body.joinCode,
      role,
      teamRole,
    })
    return { ok: true, ...result }
  }
}
