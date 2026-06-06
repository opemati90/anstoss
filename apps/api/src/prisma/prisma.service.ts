import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { createTenantMiddleware } from './tenant.middleware'
import { getClubId } from './tenant.context'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('TenantScope')

  async onModuleInit() {
    this.$use(
      createTenantMiddleware(getClubId, (model, action) => {
        // A tenant-scoped read ran without a clubId in context (fail-open).
        // Authorization for these relation-routed reads lives in the service
        // layer; this surfaces the leak surface so it can be audited and
        // individual models promoted to fail-closed once proven scoped.
        this.logger.warn(
          `tenant-scoped read ran unscoped: ${model}.${action} — ` +
            'no clubId in context (relying on service-layer authorization)',
        )
      }) as any,
    )
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
