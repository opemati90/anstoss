import { StoreBillingProvider } from './store-billing.provider'
import { OAuth2Client } from 'google-auth-library'
import { generateKeyPairSync } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ANSTOSS_BUNDLE_ID, purchaseTokenHash } from './store-purchase'

describe('store credential safety', () => {
  const saved = process.env.ANSTOSS_IAP_ENCRYPTION_KEY
  afterEach(() => {
    if (saved === undefined) delete process.env.ANSTOSS_IAP_ENCRYPTION_KEY
    else process.env.ANSTOSS_IAP_ENCRYPTION_KEY = saved
  })
  it('does not store purchase tokens as plaintext and detects tampering', () => {
    process.env.ANSTOSS_IAP_ENCRYPTION_KEY = 'ab'.repeat(32)
    const provider = new StoreBillingProvider({} as never)
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
    const provider = new StoreBillingProvider({} as never)
    expect(provider.configured('APPLE')).toBe(false)
    expect(provider.configured('GOOGLE')).toBe(false)
    expect(() => provider.seal('token')).toThrow()
  })
  it('rejects Google callbacks without authentication before querying the store', async () => {
    process.env.ANSTOSS_IAP_GOOGLE_PUSH_AUDIENCE = 'https://api.anstoss.io/billing/webhooks/google'
    process.env.ANSTOSS_IAP_GOOGLE_PUSH_EMAIL = 'billing@example.invalid'
    try { await expect(new StoreBillingProvider({} as never).verifyGoogleNotification(undefined)).rejects.toThrow('Invalid store notification') }
    finally {
      delete process.env.ANSTOSS_IAP_GOOGLE_PUSH_AUDIENCE
      delete process.env.ANSTOSS_IAP_GOOGLE_PUSH_EMAIL
    }
  })
})

describe('authenticated store boundaries', () => {
  const saved = { ...process.env }
  afterEach(() => { process.env = { ...saved }; jest.restoreAllMocks() })
  const account = 'ae119da1-dcea-46fc-a465-cf9ef88b9d0b'
  const raw = {
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    startTime: '2026-11-01T00:00:00Z', externalAccountIdentifiers: { obfuscatedExternalAccountId: account },
    lineItems: [{ productId: `${ANSTOSS_BUNDLE_ID}.team.monthly`, expiryTime: '2026-12-01T00:00:00Z',
      autoRenewingPlan: { autoRenewEnabled: true }, offerDetails: { basePlanId: 'monthly' } }],
  }
  function google(data: unknown, mappings: Record<string, string> = {}) {
    const findUnique = jest.fn(async ({ where }) => {
      const key = where.store_environment_originalId
      const accountId = mappings[`${key.store}:${key.environment}:${key.originalId}`]
      return accountId ? { accountId } : null
    })
    const provider = new StoreBillingProvider({ storeSubscription: { findUnique } } as never)
    jest.spyOn(provider, 'configured').mockReturnValue(true)
    const request = jest.fn().mockResolvedValue({ data })
    Object.assign(provider, { google: { request } })
    return { provider, request, findUnique }
  }
  it.each(['id', 'expired-token', 'both'])('recovers canonical resubscriptions with %s identity', async mode => {
    const data = { ...raw, externalAccountIdentifiers: undefined, outOfAppPurchaseContext: {
      expiredPurchaseToken: 'expired-token', expiredExternalAccountIdentifiers: mode === 'expired-token' ? undefined
        : { obfuscatedExternalAccountId: account },
    } }
    const { provider, request } = google(data, mode === 'id' ? {} : { [`GOOGLE:PRODUCTION:${purchaseTokenHash('expired-token')}`]: account })
    const purchase = await provider.verifyGoogleReference('new-token')
    expect(purchase.accountToken).toBe(account)
    expect(purchase.replacesOriginalId).toBeUndefined()
    await provider.acknowledge(purchase)
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'POST',
      data: { externalAccountIds: { obfuscatedAccountId: account } } }))
    expect(request.mock.calls[0][0].url).toContain(`/applications/${ANSTOSS_BUNDLE_ID}/`)
  })
  it('reconciles an acknowledged token after context disappears without accepting an unknown token', async () => {
    const { provider, request } = google({ ...raw, externalAccountIdentifiers: undefined,
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }, {
      [`GOOGLE:PRODUCTION:${purchaseTokenHash('known-token')}`]: account,
    })
    const purchase = await provider.verifyGoogleReference('known-token')
    expect(purchase).toMatchObject({ accountToken: account, acknowledgementNeeded: false })
    await provider.acknowledge(purchase)
    expect(request).toHaveBeenCalledTimes(1)
    await expect(provider.verifyGoogleReference('unknown-token')).rejects.toThrow()
  })
  it('rejects mismatched stored identities and never crosses store environments', async () => {
    const conflicting = google({ ...raw, outOfAppPurchaseContext: { expiredPurchaseToken: 'expired-token' } }, {
      [`GOOGLE:PRODUCTION:${purchaseTokenHash('expired-token')}`]: 'another-payer',
    })
    await expect(conflicting.provider.verifyGoogleReference('new-token')).rejects.toThrow()
    const crossed = google({ ...raw, externalAccountIdentifiers: undefined, testPurchase: {},
      outOfAppPurchaseContext: { expiredPurchaseToken: 'expired-token' } }, {
      [`GOOGLE:PRODUCTION:${purchaseTokenHash('expired-token')}`]: account,
    })
    await expect(crossed.provider.verifyGoogleReference('new-token')).rejects.toThrow()
    expect(crossed.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: {
      store_environment_originalId: { store: 'GOOGLE', environment: 'SANDBOX', originalId: purchaseTokenHash('expired-token') },
    } }))
  })
  it('does not send resubscribe-only account fields on ordinary acknowledgements', async () => {
    const { provider, request } = google(raw)
    await provider.acknowledge(await provider.verifyGoogleReference('token'))
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'POST', data: {} }))
  })
  it('rejects forged Apple JWS using the real signature verifier', async () => {
    process.env.ANSTOSS_IAP_ENABLED = 'true'
    process.env.ANSTOSS_IAP_ENCRYPTION_KEY = 'ab'.repeat(32)
    process.env.ANSTOSS_IAP_APPLE_KEY_ID = 'TESTKEY123'
    process.env.ANSTOSS_IAP_APPLE_ISSUER_ID = '00000000-0000-4000-8000-000000000001'
    process.env.ANSTOSS_IAP_APPLE_KEY_BASE64 = Buffer.from(generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()).toString('base64')
    process.env.ANSTOSS_IAP_APPLE_ROOTS_BASE64 = readFileSync(join(__dirname, 'fixtures/apple-root-g3.cer')).toString('base64')
    delete process.env.ANSTOSS_IAP_APPLE_KEY_FILE
    delete process.env.ANSTOSS_IAP_APPLE_ROOT_FILES
    const forged = [JSON.stringify({ alg: 'ES256' }), JSON.stringify({ notificationType: 'TEST' }), 'forged']
      .map(value => Buffer.from(value).toString('base64url')).join('.')
    await expect(new StoreBillingProvider({} as never).appleNotification(forged)).rejects.toThrow('Invalid store notification')
  })
  it.each([
    { email: 'wrong@example.invalid' }, { email_verified: false }, { aud: 'https://other.app' },
    { iss: 'https://attacker.invalid' },
  ])('rejects wrong Google callback claims: %j', async override => {
    process.env.ANSTOSS_IAP_GOOGLE_PUSH_AUDIENCE = 'https://api.anstoss.io/billing/webhooks/google'
    process.env.ANSTOSS_IAP_GOOGLE_PUSH_EMAIL = 'billing@example.invalid'
    const verify = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({ getPayload: () => ({
      email: process.env.ANSTOSS_IAP_GOOGLE_PUSH_EMAIL, email_verified: true,
      aud: process.env.ANSTOSS_IAP_GOOGLE_PUSH_AUDIENCE, iss: 'https://accounts.google.com', ...override,
    }) } as never)
    await expect(new StoreBillingProvider({} as never).verifyGoogleNotification('Bearer signed-token')).rejects.toThrow('Invalid store notification')
    expect(verify).toHaveBeenCalledWith({ idToken: 'signed-token', audience: process.env.ANSTOSS_IAP_GOOGLE_PUSH_AUDIENCE })
  })
  it('rejects Google signature verification failures without exposing SDK error contents', async () => {
    process.env.ANSTOSS_IAP_GOOGLE_PUSH_AUDIENCE = 'https://api.anstoss.io/billing/webhooks/google'
    process.env.ANSTOSS_IAP_GOOGLE_PUSH_EMAIL = 'billing@example.invalid'
    jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockImplementation(async () => { throw new Error('private SDK payload') })
    await expect(new StoreBillingProvider({} as never).verifyGoogleNotification('Bearer forged-token')).rejects.toThrow('Invalid store notification')
  })
})
