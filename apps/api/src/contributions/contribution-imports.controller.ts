import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import {
  confirmContributionMatchSchema,
  createBankImportSchema,
  reverseContributionMatchSchema,
} from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { EntitlementGuard, RequireFeature } from '../billing/entitlement.guard'
import { ContributionImportsService } from './contribution-imports.service'

@Controller('clubs/:clubId/contributions/imports')
@UseGuards(ClerkAuthGuard, EntitlementGuard)
@RequireFeature('bank_reconciliation')
export class ContributionImportsController {
  constructor(private readonly imports: ContributionImportsService) {}

  @Post()
  @RateLimit('bank-import')
  import(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    return this.imports.import(clubId, user.id, createBankImportSchema.parse(body))
  }

  @Get()
  listBatches(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.imports.listBatches(clubId, user.id)
  }

  @Get('records/outstanding')
  outstandingRecords(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.imports.outstandingRecords(clubId, user.id)
  }

  @Get(':batchId')
  batchDetails(
    @Param('clubId') clubId: string,
    @Param('batchId') batchId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.imports.batchDetails(clubId, user.id, batchId)
  }

  @Get(':batchId/suggestions')
  suggestions(
    @Param('clubId') clubId: string,
    @Param('batchId') batchId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.imports.suggestions(clubId, user.id, batchId)
  }

  @Post('matches/confirm')
  @RateLimit('write')
  confirm(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    return this.imports.confirm(clubId, user.id, confirmContributionMatchSchema.parse(body))
  }

  @Post('matches/:matchId/reverse')
  @RateLimit('write')
  reverse(
    @Param('clubId') clubId: string,
    @Param('matchId') matchId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    return this.imports.reverse(
      clubId,
      user.id,
      matchId,
      reverseContributionMatchSchema.parse(body),
    )
  }
}
