import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { MembershipRole } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RolesGuard, RequireRole } from '../auth/roles.guard'
import { CurrentUser } from '../auth/user.decorator'
import { StreaksService } from './streaks.service'

/**
 * Streaks API — attendance + MOTM streak counts for the caller and a
 * club leaderboard. Currently a minimal stub that returns zeros + an
 * empty leaderboard so the frontend renders an empty state instead of
 * 404'ing. Real attendance computation lives in `events` and `motm`
 * modules; the wiring lands in a follow-up.
 */
@Controller('clubs/:clubId/streaks')
@UseGuards(ClerkAuthGuard, RolesGuard)
// Leaderboard exposes club member names/ids — caller must be a member of
// this club (PARENT is the lowest role, i.e. "any member").
@RequireRole(MembershipRole.PARENT)
export class StreaksController {
  constructor(private readonly streaksService: StreaksService) {}

  @Get()
  async getStreaks(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
  ) {
    return this.streaksService.getStreaks(clubId, user.id)
  }
}
