import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export const AI_MAX_MONTHLY_MICROS = 30_000_000
export const AI_REQUEST_RESERVATION_MICROS = 10_000
export type AiPurpose = 'TRANSLATION' | 'LANGUAGE_DETECTION' | 'STUDIO_CAPTION'

export class AiUnavailableException extends ServiceUnavailableException {
  constructor() {
    super({
      code: 'ai_unavailable',
      message: 'AI is temporarily unavailable. Please try again later.',
    })
  }
}

export function aiMonthlyLimitMicros(): number {
  const value = process.env.ANSTOSS_AI_MONTHLY_LIMIT_USD ?? '30'
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(value)) throw new AiUnavailableException()
  const micros = Math.round(Number(value) * 1_000_000)
  if (micros < AI_REQUEST_RESERVATION_MICROS || micros > AI_MAX_MONTHLY_MICROS)
    throw new AiUnavailableException()
  return micros
}

@Injectable()
export class AiBudgetService {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(purpose: AiPurpose): Promise<void> {
    const limit = aiMonthlyLimitMicros()
    try {
      await this.prisma.$transaction(async (tx) => {
        // One short platform-wide lock serializes all instances, including
        // rollover. Never hold this transaction open during the provider call.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(48231917, 1)`
        const [clock] = await tx.$queryRaw<Array<{ period: string }>>`
          SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM') AS period
        `
        if (!clock?.period) throw new AiUnavailableException()
        await tx.aiMonthlyBudget.upsert({
          where: { period: clock.period },
          create: { period: clock.period },
          update: {},
        })
        const updated = await tx.aiMonthlyBudget.updateMany({
          where: {
            period: clock.period,
            reservedMicros: { lte: limit - AI_REQUEST_RESERVATION_MICROS },
          },
          data: { reservedMicros: { increment: AI_REQUEST_RESERVATION_MICROS } },
        })
        if (updated.count !== 1) throw new AiUnavailableException()
        await tx.aiSpendReservation.create({
          data: { period: clock.period, purpose, reservedMicros: AI_REQUEST_RESERVATION_MICROS },
        })
      })
    } catch {
      // DB unavailable, contention, migration missing or budget exhausted:
      // all fail closed BEFORE dispatch. Never expose DB details to callers.
      throw new AiUnavailableException()
    }
  }
}
