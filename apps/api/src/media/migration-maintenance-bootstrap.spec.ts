const listen = jest.fn()
const nestCreate = jest.fn()
const sentryInit = jest.fn()

jest.mock('@nestjs/core', () => ({ NestFactory: { create: nestCreate } }))
jest.mock('../logging/sentry', () => ({ initSentry: sentryInit }))
jest.mock('./migration-maintenance', () => ({
  ...jest.requireActual('./migration-maintenance'),
  createMigrationMaintenanceServer: () => ({ listen }),
}))
jest.mock('../app.module', () => { throw new Error('Application modules must not load in maintenance mode') })

describe('maintenance bootstrap', () => {
  const oldFlag = process.env.ANSTOSS_MIGRATION_MAINTENANCE
  const oldPort = process.env.PORT
  afterAll(() => {
    if (oldFlag === undefined) delete process.env.ANSTOSS_MIGRATION_MAINTENANCE
    else process.env.ANSTOSS_MIGRATION_MAINTENANCE = oldFlag
    if (oldPort === undefined) delete process.env.PORT
    else process.env.PORT = oldPort
  })

  it('starts only the standalone server, without Nest or application modules', async () => {
    process.env.ANSTOSS_MIGRATION_MAINTENANCE = 'true'
    process.env.PORT = '4321'
    await import('../main')
    expect(listen).toHaveBeenCalledWith(4321, '0.0.0.0', expect.any(Function))
    expect(nestCreate).not.toHaveBeenCalled()
    expect(sentryInit).not.toHaveBeenCalled()
  })
})
