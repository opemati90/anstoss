import { VersionMiddleware } from './version.middleware'

describe('VersionMiddleware', () => {
  let middleware: VersionMiddleware
  let mockReq: any
  let mockRes: any
  let mockNext: jest.Mock
  let settings: {
    getRuntimeReleaseSettings: jest.Mock
    getRuntimeReleaseSettingsRevision: jest.Mock
  }

  beforeEach(() => {
    settings = {
      getRuntimeReleaseSettings: jest.fn(async () => ({
        minVersion: process.env.MIN_APP_VERSION ?? '',
        recommendedVersion: process.env.RECOMMENDED_APP_VERSION ?? '',
        forceUpdateMessage: 'Update from the live release control.',
        announcementBanner: '',
      })),
      getRuntimeReleaseSettingsRevision: jest.fn(() => 0),
    }
    middleware = new VersionMiddleware(settings as never)
    mockReq = { headers: {} }
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    }
    mockNext = jest.fn()
  })

  afterEach(() => {
    delete process.env.MIN_APP_VERSION
    delete process.env.RECOMMENDED_APP_VERSION
  })

  it('allows requests with no X-App-Version header', async () => {
    await middleware.use(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
    expect(mockRes.status).not.toHaveBeenCalled()
  })

  it('allows requests when no MIN_APP_VERSION is set', async () => {
    mockReq.headers['x-app-version'] = '1.0.0'
    await middleware.use(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
  })

  it('returns 426 when client version is below minimum', async () => {
    process.env.MIN_APP_VERSION = '2.0.0'
    mockReq.headers['x-app-version'] = '1.9.9'
    await middleware.use(mockReq, mockRes, mockNext)
    expect(mockRes.status).toHaveBeenCalledWith(426)
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'UPGRADE_REQUIRED',
          message: 'Update from the live release control.',
        }),
      }),
    )
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('allows requests at exact minimum version', async () => {
    process.env.MIN_APP_VERSION = '2.0.0'
    mockReq.headers['x-app-version'] = '2.0.0'
    await middleware.use(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
    expect(mockRes.status).not.toHaveBeenCalled()
  })

  it('allows requests above minimum version', async () => {
    process.env.MIN_APP_VERSION = '2.0.0'
    mockReq.headers['x-app-version'] = '2.1.0'
    await middleware.use(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
  })

  it('sets X-Update-Available header for soft update', async () => {
    process.env.RECOMMENDED_APP_VERSION = '2.5.0'
    mockReq.headers['x-app-version'] = '2.3.0'
    await middleware.use(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Update-Available', '2.5.0')
  })

  it('emits the encoded live announcement header', async () => {
    settings.getRuntimeReleaseSettings.mockResolvedValueOnce({
      minVersion: '1.0.0',
      recommendedVersion: '1.0.0',
      forceUpdateMessage: 'Update required.',
      announcementBanner: 'Maintenance at 20:00',
    })
    mockReq.headers['x-app-version'] = '1.0.0'

    await middleware.use(mockReq, mockRes, mockNext)

    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'X-Anstoss-Announcement',
      'Maintenance%20at%2020%3A00',
    )
  })

  it('does not set soft update header when at recommended version', async () => {
    process.env.RECOMMENDED_APP_VERSION = '2.5.0'
    mockReq.headers['x-app-version'] = '2.5.0'
    await middleware.use(mockReq, mockRes, mockNext)
    expect(mockRes.setHeader).not.toHaveBeenCalled()
  })

  it('handles semver comparison correctly for patch versions', async () => {
    process.env.MIN_APP_VERSION = '1.2.3'
    mockReq.headers['x-app-version'] = '1.2.2'
    await middleware.use(mockReq, mockRes, mockNext)
    expect(mockRes.status).toHaveBeenCalledWith(426)
  })

  it('handles two-part version strings', async () => {
    process.env.MIN_APP_VERSION = '1.2.0'
    mockReq.headers['x-app-version'] = '1.2'
    await middleware.use(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled() // 1.2 == 1.2.0
  })

  it('falls back to deploy-time settings when the database lookup fails', async () => {
    process.env.MIN_APP_VERSION = '3.0.0'
    settings.getRuntimeReleaseSettings.mockRejectedValueOnce(new Error('database offline'))
    mockReq.headers['x-app-version'] = '2.9.0'

    await middleware.use(mockReq, mockRes, mockNext)

    expect(mockRes.status).toHaveBeenCalledWith(426)
    expect(mockNext).not.toHaveBeenCalled()
  })
})
