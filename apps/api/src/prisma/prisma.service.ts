import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { createTenantMiddleware } from './tenant.middleware'
import { getClubId } from './tenant.context'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.$use(createTenantMiddleware(getClubId) as any)
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
