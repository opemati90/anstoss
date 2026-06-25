import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  root() {
    return {
      name: 'Anstoss API',
      status: 'ok',
      docs: '/health',
    }
  }

  @Get('health')
  async check() {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1')
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded',
        db: 'error',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.0.1',
      })
    }

    return {
      status: 'ok',
      db: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.0.1',
    }
  }
}
