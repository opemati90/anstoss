import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { createManagedSubProfileSchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { ManagedSubProfilesService } from './managed-sub-profiles.service'

@Controller('users/managed-sub-profiles')
@UseGuards(ClerkAuthGuard)
export class ManagedSubProfilesController {
  constructor(private readonly service: ManagedSubProfilesService) {}

  @Post()
  @RateLimit('write')
  create(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const parsed = createManagedSubProfileSchema.parse(body)
    return this.service.create(user.id, parsed)
  }
}
