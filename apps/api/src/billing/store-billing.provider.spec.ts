import { StoreBillingProvider } from './store-billing.provider'

describe('store credential safety', () => {
  const saved = process.env.ANSTOSS_IAP_ENCRYPTION_KEY
  afterEach(() => {
    if (saved === undefined) delete process.env.ANSTOSS_IAP_ENCRYPTION_KEY
    else process.env.ANSTOSS_IAP_ENCRYPTION_KEY = saved
  })
  it('does not store purchase tokens as plaintext and detects tampering', () => {
    process.env.ANSTOSS_IAP_ENCRYPTION_KEY = 'ab'.repeat(32)
    const provider = new StoreBillingProvider()
    const sealed = provider.seal('private-purchase-token')
    expect(sealed).not.toContain('private-purchase-token')
    expect(provider.unseal(sealed)).toBe('private-purchase-token')
    expect(provider.seal('private-purchase-token')).not.toBe(sealed)
    const parts = sealed.split('.')
    parts[1] = Buffer.alloc(16).toString('base64')
    expect(() => provider.unseal(parts.join('.'))).toThrow()
  })
  it('fails closed without a valid encryption key', () => {
    delete process.env.ANSTOSS_IAP_ENCRYPTION_KEY
    const provider = new StoreBillingProvider()
    expect(provider.configured('APPLE')).toBe(false)
    expect(provider.configured('GOOGLE')).toBe(false)
    expect(() => provider.seal('token')).toThrow()
  })
  it('rejects Google callbacks without authentication before querying the store', async () => {
    process.env.ANSTOSS_IAP_GOOGLE_PUSH_AUDIENCE = 'https://api.anstoss.io/billing/webhooks/google'
    process.env.ANSTOSS_IAP_GOOGLE_PUSH_EMAIL = 'billing@example.invalid'
    try { await expect(new StoreBillingProvider().verifyGoogleNotification(undefined)).rejects.toThrow('Invalid store notification') }
    finally {
      delete process.env.ANSTOSS_IAP_GOOGLE_PUSH_AUDIENCE
      delete process.env.ANSTOSS_IAP_GOOGLE_PUSH_EMAIL
    }
  })
})
