import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { carpoolSeatSchema, createCarpoolRideSchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { CarpoolService } from './carpool.service'

/** Fahrgemeinschaft board for one event. */
@Controller('clubs/:clubId/events/:eventId/carpool')
@UseGuards(ClerkAuthGuard, AgeGateGuard)
export class CarpoolController {
  constructor(private readonly carpoolService: CarpoolService) {}

  /** GET — every ride for the event with its passengers. */
  @Get()
  list(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.carpoolService.list(clubId, eventId, user.id)
  }

  /** POST — offer a ride; the caller drives. */
  @Post()
  @RateLimit('write')
  offer(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    return this.carpoolService.offer(clubId, eventId, user.id, createCarpoolRideSchema.parse(body))
  }

  /** DELETE :rideId — the driver (or an event manager) withdraws the ride. */
  @Delete(':rideId')
  @RateLimit('write')
  remove(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @Param('rideId') rideId: string,
  ) {
    return this.carpoolService.remove(clubId, eventId, rideId, user.id)
  }

  /** POST :rideId/seat — take a seat (for yourself or `childUserId`). */
  @Post(':rideId/seat')
  @RateLimit('write')
  takeSeat(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @Param('rideId') rideId: string,
    @Body() body: unknown,
  ) {
    const { childUserId } = carpoolSeatSchema.parse(body ?? {})
    return this.carpoolService.takeSeat(clubId, eventId, rideId, user.id, childUserId)
  }

  /** DELETE :rideId/seat — leave a seat. */
  @Delete(':rideId/seat')
  @RateLimit('write')
  leaveSeat(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @Param('rideId') rideId: string,
    @Body() body: unknown,
  ) {
    const { childUserId } = carpoolSeatSchema.parse(body ?? {})
    return this.carpoolService.leaveSeat(clubId, eventId, rideId, user.id, childUserId)
  }
}
