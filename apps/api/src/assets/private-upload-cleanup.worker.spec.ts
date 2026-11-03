import { Logger } from '@nestjs/common'
import { PrivateUploadCleanupWorker } from './private-upload-cleanup.worker'
import { PrivateUploadCleanupBatch } from './private-upload-cleanup-batch'
import { tenantContext } from '../prisma/tenant.context'

describe('private upload cleanup runtime', () => {
  const keys = ['PRIVATE_UPLOAD_CLEANUP_ENABLED', 'R2_ACCOUNT_ID', 'R2_QUARANTINE_BUCKET',
    'R2_QUARANTINE_ACCESS_KEY_ID', 'R2_QUARANTINE_SECRET_ACCESS_KEY', 'R2_QUARANTINE_JURISDICTION', 'R2_BUCKET_NAME'] as const
  let original: Record<string, string | undefined>
  let worker: PrivateUploadCleanupWorker
  let db: any
  let run: jest.SpyInstance
  beforeEach(() => {
    original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
    for (const key of keys) delete process.env[key]
    jest.useFakeTimers()
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    db = { $queryRaw: jest.fn().mockResolvedValue([{ clubId: 'deleted-club' }]) }
    run = jest.spyOn(PrivateUploadCleanupBatch.prototype, 'run').mockResolvedValue({ selected: 1, outcomes: { removed: 1 } })
    worker = new PrivateUploadCleanupWorker(db)
  })
  afterEach(() => {
    worker.onModuleDestroy()
    jest.useRealTimers()
    jest.restoreAllMocks()
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
  })
  function enable() {
    Object.assign(process.env, { PRIVATE_UPLOAD_CLEANUP_ENABLED: 'true', R2_ACCOUNT_ID: 'a'.repeat(32),
      R2_QUARANTINE_BUCKET: 'private-test', R2_QUARANTINE_ACCESS_KEY_ID: 'test',
      R2_QUARANTINE_SECRET_ACCESS_KEY: 'test', R2_QUARANTINE_JURISDICTION: 'eu', R2_BUCKET_NAME: 'public-test' })
  }

  it('is inert by default with no storage configuration', async () => {
    worker.onModuleInit()
    await worker.runCycle()
    expect(db.$queryRaw).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })
  it('fails closed if enabled without private EU storage', () => {
    process.env.PRIVATE_UPLOAD_CLEANUP_ENABLED = 'true'
    expect(() => worker.onModuleInit()).toThrow('private EU storage')
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })
  it('discovers from intents and runs cleanup even for a deleted club', async () => {
    enable(); worker.onModuleInit()
    await jest.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledWith('deleted-club', expect.any(Function))
    const shouldContinue = run.mock.calls[0][1]
    expect(shouldContinue()).toBe(true)
    expect(db.$queryRaw.mock.calls[0][0].join('')).toContain('LIMIT 10')
    const count = run.mock.calls.length
    worker.onModuleDestroy()
    expect(shouldContinue()).toBe(false)
    await jest.advanceTimersByTimeAsync(120_000)
    expect(run).toHaveBeenCalledTimes(count)
  })
  it('does not overlap cycles while discovery is pending', async () => {
    enable()
    let resolve!: (value: Array<{ clubId: string }>) => void
    db.$queryRaw.mockImplementation(() => new Promise((done) => { resolve = done }))
    worker.onModuleInit()
    await worker.runCycle()
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
    resolve([])
    await jest.advanceTimersByTimeAsync(0)
  })
  it('honors disablement without destroying pending records', async () => {
    enable(); worker.onModuleInit()
    await jest.advanceTimersByTimeAsync(0)
    process.env.PRIVATE_UPLOAD_CLEANUP_ENABLED = 'false'
    await jest.advanceTimersByTimeAsync(60_000)
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
  })
  it('does not discover other tenants from a tenant request context', async () => {
    enable()
    await tenantContext.run({ clubId: 'club', userId: 'user' }, async () => {
      worker.onModuleInit()
      await worker.runCycle()
    })
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })
})
