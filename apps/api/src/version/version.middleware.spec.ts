import { VersionMiddleware } from './version.middleware'

describe('VersionMiddleware', () => {
  let middleware: VersionMiddleware
  let mockReq: any
  let mockRes: any
  let mockNext: jest.Mock

  beforeEach(() => {
    middleware = new VersionMiddleware()
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

  it('allows requests with no X-App-Version header', () => {
    middleware.use(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
    expect(mockRes.status).not.toHaveBeenCalled()
  })

  it('allows requests when no MIN_APP_VERSION is set', () => {
    mockReq.headers['x-app-version'] = '1.0.0'
    middleware.use(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
  })

  it('returns 426 when client version is below minimum', () => {
    process.env.MIN_APP_VERSION = '2.0.0'
    mockReq.headers['x-app-version'] = '1.9.9'
    middleware.use(mockReq, mockRes, mockNext)
    expect(mockRes.status).toHaveBeenCalledWith(426)
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'UPGRADE_REQUIRED' }),
      }),
    )
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('allows requests at exact minimum version', () => {
    process.env.MIN_APP_VERSION = '2.0.0'
    mockReq.headers['x-app-version'] = '2.0.0'
    middleware.use(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
    expect(mockRes.status).not.toHaveBeenCalled()
  })

  it('allows requests above minimum version', () => {
    process.env.MIN_APP_VERSION = '2.0.0'
    mockReq.headers['x-app-version'] = '2.1.0'
    middleware.use(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
  })

  it('sets X-Update-Available header for soft update', () => {
    process.env.RECOMMENDED_APP_VERSION = '2.5.0'
    mockReq.headers['x-app-version'] = '2.3.0'
    middleware.use(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Update-Available', '2.5.0')
  })

  it('does not set soft update header when at recommended version', () => {
    process.env.RECOMMENDED_APP_VERSION = '2.5.0'
    mockReq.headers['x-app-version'] = '2.5.0'
    middleware.use(mockReq, mockRes, mockNext)
    expect(mockRes.setHeader).not.toHaveBeenCalled()
  })

  it('handles semver comparison correctly for patch versions', () => {
    process.env.MIN_APP_VERSION = '1.2.3'
    mockReq.headers['x-app-version'] = '1.2.2'
    middleware.use(mockReq, mockRes, mockNext)
    expect(mockRes.status).toHaveBeenCalledWith(426)
  })

  it('handles two-part version strings', () => {
    process.env.MIN_APP_VERSION = '1.2.0'
    mockReq.headers['x-app-version'] = '1.2'
    middleware.use(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled() // 1.2 == 1.2.0
  })
})
