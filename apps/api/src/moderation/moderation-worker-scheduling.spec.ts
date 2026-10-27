import { ModerationSafetyWorker, PlatformSafetyAlerter } from './moderation-safety'
import { PrismaService } from '../prisma/prisma.service'

describe('moderation worker scheduling', () => {
  const previousEnv = process.env.NODE_ENV
  const previousSwitch = process.env.MODERATION_SAFETY_SWEEP_ENABLED
  let worker: ModerationSafetyWorker
  let retry: jest.SpyInstance
  let overdue: jest.SpyInstance
  let purge: jest.SpyInstance

  beforeEach(() => {
    jest.useFakeTimers()
    process.env.NODE_ENV = 'production'
    delete process.env.MODERATION_SAFETY_SWEEP_ENABLED
    worker = new ModerationSafetyWorker({} as PrismaService, {} as PlatformSafetyAlerter)
    retry = jest.spyOn(worker, 'retryPendingQuarantines').mockResolvedValue(0)
    overdue = jest.spyOn(worker, 'alertOverdue').mockResolvedValue([])
    purge = jest.spyOn(worker, 'purgeExpiredEvidence').mockResolvedValue(0)
  })

  afterEach(() => {
    worker.onModuleDestroy()
    jest.useRealTimers()
    jest.restoreAllMocks()
    if (previousEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousEnv
    if (previousSwitch === undefined) delete process.env.MODERATION_SAFETY_SWEEP_ENABLED
    else process.env.MODERATION_SAFETY_SWEEP_ENABLED = previousSwitch
  })

  it('retries on startup and every minute without running hourly retention early', async () => {
    worker.onModuleInit()
    expect(retry).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(60_000)
    expect(retry).toHaveBeenCalledTimes(2)
    expect(overdue).not.toHaveBeenCalled()
    expect(purge).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(59 * 60_000)
    expect(overdue).toHaveBeenCalledTimes(1)
    expect(purge).toHaveBeenCalledTimes(1)
  })

  it('does not overlap slow retries and resumes after a failure', async () => {
    let reject!: (error: Error) => void
    retry.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
    worker.onModuleInit()
    await jest.advanceTimersByTimeAsync(120_000)
    expect(retry).toHaveBeenCalledTimes(1)
    reject(new Error('storage unavailable'))
    await jest.advanceTimersByTimeAsync(60_000)
    expect(retry).toHaveBeenCalledTimes(2)
  })

  it('cleans up both schedules on shutdown', async () => {
    worker.onModuleInit()
    worker.onModuleDestroy()
    await jest.advanceTimersByTimeAsync(3_600_000)
    expect(retry).toHaveBeenCalledTimes(1)
    expect(overdue).not.toHaveBeenCalled()
  })

  it.each(['test', 'disabled'])('honours the %s disable condition', (condition) => {
    if (condition === 'test') process.env.NODE_ENV = 'test'
    else process.env.MODERATION_SAFETY_SWEEP_ENABLED = 'false'
    worker.onModuleInit()
    expect(retry).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })
})
