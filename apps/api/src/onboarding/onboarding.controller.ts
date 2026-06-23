import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { claimPhoneSchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { OnboardingService } from './onboarding.service'

@Controller('onboarding')
@UseGuards(ClerkAuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  // Phone-roster claims are keyed on the coach-entered slot phone. OTP users
  // have no Clerk identity and the User model has no phone column, so the
  // phone is supplied by the client (the number they were invited on) and
  // matched server-side. `?phone=` is optional — absent/blank returns [].
  // Rate-limited: `?phone=` returns roster-slot names for a matching number, so
  // an unthrottled route is a by-phone PII-enumeration oracle. The write-tier
  // limit caps bulk harvesting (the claim still needs the exact slot phone).
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

  @Post('join-team')
  @UseGuards(AgeGateGuard)
  async joinTeam(
    @CurrentUser() user: { id: string },
    @Body() body: { joinCode?: string; role?: string },
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
    const result = await this.onboarding.joinTeamByCode(user.id, {
      joinCode: body.joinCode,
      role,
    })
    return { ok: true, ...result }
  }
}
