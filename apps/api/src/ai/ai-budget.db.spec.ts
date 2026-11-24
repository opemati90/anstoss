import { PrismaService } from '../prisma/prisma.service'
import { AiBudgetService, AI_REQUEST_RESERVATION_MICROS } from './ai-budget.service'

const url = process.env.ANSTOSS_STUDIO_TEST_DATABASE_URL
if (url && (new URL(url).hostname !== '127.0.0.1' || !new URL(url).pathname.endsWith('_test')))
  throw new Error('AI budget tests require an isolated local *_test database')

;(url ? describe : describe.skip)('AI monthly spending guard: real PostgreSQL concurrency', () => {
  let db: PrismaService
  let period: string
  let ownsFixtures = false
  const oldLimit = process.env.ANSTOSS_AI_MONTHLY_LIMIT_USD
  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url: url! } } })
    await db.$connect()
    const rows = await db.$queryRaw<
      Array<{ period: string }>
    >`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM') AS period`
    period = rows[0].period
    if (await db.aiMonthlyBudget.findUnique({ where: { period } }))
      throw new Error('Test budget already exists; refusing to overwrite it')
    ownsFixtures = true
  })
  afterEach(async () => {
    if (ownsFixtures) {
      await db.aiSpendReservation.deleteMany({ where: { period } })
      await db.aiMonthlyBudget.deleteMany({ where: { period } })
    }
  })
  afterAll(async () => {
    if (oldLimit === undefined) delete process.env.ANSTOSS_AI_MONTHLY_LIMIT_USD
    else process.env.ANSTOSS_AI_MONTHLY_LIMIT_USD = oldLimit
    await db.$disconnect()
  })
  it('allows exactly one request at the last cent across separate service instances', async () => {
    process.env.ANSTOSS_AI_MONTHLY_LIMIT_USD = '30'
    await db.aiMonthlyBudget.create({
      data: { period, reservedMicros: 30_000_000 - AI_REQUEST_RESERVATION_MICROS },
    })
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => new AiBudgetService(db).reserve('TRANSLATION')),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((await db.aiMonthlyBudget.findUniqueOrThrow({ where: { period } })).reservedMicros).toBe(
      30_000_000,
    )
    expect(await db.aiSpendReservation.count({ where: { period } })).toBe(1)
  })
  it('creates one bucket on concurrent first use and respects a lower approved limit', async () => {
    process.env.ANSTOSS_AI_MONTHLY_LIMIT_USD = '0.03'
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => new AiBudgetService(db).reserve('STUDIO_CAPTION')),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3)
    expect((await db.aiMonthlyBudget.findUniqueOrThrow({ where: { period } })).reservedMicros).toBe(
      30_000,
    )
    expect(await db.aiSpendReservation.count({ where: { period } })).toBe(3)
  })
  it('does not reset previous reservations when the service restarts or cap is lowered', async () => {
    process.env.ANSTOSS_AI_MONTHLY_LIMIT_USD = '0.01'
    await new AiBudgetService(db).reserve('TRANSLATION')
    await expect(new AiBudgetService(db).reserve('TRANSLATION')).rejects.toThrow()
    expect(await db.aiSpendReservation.count({ where: { period } })).toBe(1)
  })
  it('does not reuse an older month bucket', async () => {
    const past = '2000-01'
    process.env.ANSTOSS_AI_MONTHLY_LIMIT_USD = '0.01'
    await db.aiMonthlyBudget.create({ data: { period: past, reservedMicros: 30_000_000 } })
    try {
      await new AiBudgetService(db).reserve('TRANSLATION')
      expect(
        (await db.aiMonthlyBudget.findUniqueOrThrow({ where: { period } })).reservedMicros,
      ).toBe(10_000)
      expect(
        (await db.aiMonthlyBudget.findUniqueOrThrow({ where: { period: past } })).reservedMicros,
      ).toBe(30_000_000)
    } finally {
      await db.aiMonthlyBudget.delete({ where: { period: past } })
    }
  })
})
