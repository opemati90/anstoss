import { R2Provider } from './r2.provider'

describe('R2Provider public URL parsing', () => {
  const previous = process.env.R2_PUBLIC_BASE_URL

  afterEach(() => {
    if (previous === undefined) delete process.env.R2_PUBLIC_BASE_URL
    else process.env.R2_PUBLIC_BASE_URL = previous
  })

  it('requires the exact configured origin and rejects traversal/query aliases', () => {
    process.env.R2_PUBLIC_BASE_URL = 'https://assets.anstoss.app/public'
    const provider = new R2Provider()

    expect(provider.objectKeyFromUrl('https://assets.anstoss.app/public/chat/a.png'))
      .toBe('chat/a.png')
    expect(provider.objectKeyFromUrl('https://assets.anstoss.app.evil/public/chat/a.png'))
      .toBeNull()
    expect(provider.objectKeyFromUrl('https://assets.anstoss.app/public/../private/a.png'))
      .toBeNull()
    expect(provider.objectKeyFromUrl('https://assets.anstoss.app/public/chat/a.png?override=1'))
      .toBeNull()
  })
})
