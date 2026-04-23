import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { clubSearchQuerySchema } from '@anstoss/shared'
import { ClubsSearchService } from './clubs-search.service'

@Controller('clubs')
@UseGuards(ClerkAuthGuard)
export class ClubsSearchController {
  constructor(private readonly search: ClubsSearchService) {}

  @Get('search')
  @RateLimit('read')
  async searchClubs(@Query() raw: Record<string, unknown>) {
    const query = clubSearchQuerySchema.parse(raw)
    return this.search.search(query)
  }
}
