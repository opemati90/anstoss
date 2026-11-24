import { ForbiddenException } from '@nestjs/common'
import { httpCorsOrigin, isHttpOriginAllowed } from './http-cors'

describe('httpCorsOrigin', () => {
  it('returns an operational 403 for the reported rejected origin', () => {
    const callback = jest.fn()
    httpCorsOrigin('https://api.anstoss.io', callback)
    const [error, allowed] = callback.mock.calls[0]
    expect(allowed).toBe(false)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(error.getStatus()).toBe(403)
    expect(error.message).not.toContain('https://api.anstoss.io')
  })

  it.each([undefined, 'https://anstoss.io', 'https://admin.anstoss.io'])(
    'continues allowing trusted or native origin %s', (origin) => {
      const callback = jest.fn()
      httpCorsOrigin(origin, callback)
      expect(callback).toHaveBeenCalledWith(null, true)
    },
  )
})

describe('isHttpOriginAllowed', () => {
  it('allows native and same-origin requests without an Origin header', () => {
    expect(isHttpOriginAllowed(undefined, 'production')).toBe(true)
  })

  it('allows only the explicit Anstoss browser origins in production', () => {
    expect(isHttpOriginAllowed('https://anstoss.io', 'production')).toBe(true)
    expect(isHttpOriginAllowed('https://app.anstoss.io', 'production')).toBe(true)
    expect(isHttpOriginAllowed('https://admin.anstoss.io', 'production')).toBe(true)
    expect(isHttpOriginAllowed('https://preview.anstoss.app', 'production')).toBe(true)
  })

  it('rejects lookalike and untrusted browser origins in production', () => {
    expect(isHttpOriginAllowed('https://admin.anstoss.io.evil.example', 'production')).toBe(false)
    expect(isHttpOriginAllowed('https://evil-anstoss.app', 'production')).toBe(false)
    expect(isHttpOriginAllowed('https://evil.example', 'production')).toBe(false)
    expect(isHttpOriginAllowed('http://admin.anstoss.io', 'production')).toBe(false)
  })

  it('allows local development origins outside production only', () => {
    expect(isHttpOriginAllowed('http://localhost:8081', 'development')).toBe(true)
    expect(isHttpOriginAllowed('http://127.0.0.1:3000', 'test')).toBe(true)
    expect(isHttpOriginAllowed('http://localhost:8081', 'production')).toBe(false)
  })
})
