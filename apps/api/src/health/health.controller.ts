import { Controller, Get } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let dbStatus = 'ok'
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1')
    } catch {
      dbStatus = 'error'
    }

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      db: dbStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.0.1',
    }
  }
}
