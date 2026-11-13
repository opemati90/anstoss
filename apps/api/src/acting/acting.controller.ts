import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { startActingSessionSchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { ActingService } from './acting.service'

/** Vorschau und Vertretung: stand-in coach sessions (redesign 29/31). */
@Controller()
@UseGuards(ClerkAuthGuard, AgeGateGuard)
export class ActingController {
  constructor(private readonly acting: ActingService) {}

  @Get('clubs/:clubId/acting-sessions/candidates')
  candidates(@CurrentUser() user: { id: string }, @Param('clubId') clubId: string) {
    return this.acting.candidates(clubId, user.id)
  }

  @Post('clubs/:clubId/acting-sessions')
  start(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Body() body: unknown,
  ) {
    return this.acting.start(clubId, user.id, startActingSessionSchema.parse(body))
  }

  @Delete('acting-sessions/:id')
  end(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.acting.end(id, user.id)
  }

  @Get('me/acting-session')
  current(@CurrentUser() user: { id: string }) {
    return this.acting.current(user.id)
  }
}
