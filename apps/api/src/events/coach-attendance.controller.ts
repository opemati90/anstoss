import { Body, Controller, ForbiddenException, Get, Param, Put, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { CoachAttendanceService } from './coach-attendance.service'

const inputSchema = z.object({
  status: z.enum(['PRESENT', 'ABSENT', 'UNKNOWN']),
  expectedVersion: z.number().int().positive().nullable(),
  operationId: z.string().uuid(),
  expectedActorId: z.string().min(1).max(128),
}).strict()

@Controller('clubs/:clubId/events/:eventId/coach-attendance')
@UseGuards(ClerkAuthGuard, AgeGateGuard)
export class CoachAttendanceController {
  constructor(private readonly service: CoachAttendanceService) {}

  @Get()
  list(@CurrentUser() actor: { id: string }, @Param('clubId') clubId: string, @Param('eventId') eventId: string, @Query('expectedActorId') expectedActorId: string) {
    if (expectedActorId !== actor.id) throw new ForbiddenException('Account changed')
    return this.service.list(clubId, eventId, actor.id)
  }

  @Put(':userId')
  @RateLimit('write')
  record(@CurrentUser() actor: { id: string }, @Param('clubId') clubId: string,
    @Param('eventId') eventId: string, @Param('userId') userId: string, @Body() body: unknown) {
    const input = inputSchema.parse(body)
    if (input.expectedActorId !== actor.id) throw new ForbiddenException('Account changed')
    return this.service.record(clubId, eventId, actor.id, userId, input.status, input.expectedVersion, input.operationId)
  }
}
