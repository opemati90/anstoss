import { isSocketOriginAllowed } from './socket-cors'

describe('isSocketOriginAllowed', () => {
  it('allows native clients without an Origin header', () => {
    expect(isSocketOriginAllowed(undefined, 'production')).toBe(true)
  })

  it('allows production Anstoss origins', () => {
    expect(isSocketOriginAllowed('https://anstoss.io', 'production')).toBe(true)
    expect(isSocketOriginAllowed('https://app.anstoss.io', 'production')).toBe(true)
    expect(isSocketOriginAllowed('https://preview.anstoss.app', 'production')).toBe(true)
  })

  it('rejects third-party browser origins in production', () => {
    expect(isSocketOriginAllowed('https://evil.example', 'production')).toBe(false)
  })

  it('keeps local and test development permissive', () => {
    expect(isSocketOriginAllowed('http://localhost:8081', 'development')).toBe(true)
    expect(isSocketOriginAllowed('https://evil.example', 'test')).toBe(true)
  })
})
