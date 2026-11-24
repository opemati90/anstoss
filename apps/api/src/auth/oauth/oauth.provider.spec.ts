import { createRemoteJWKSet, exportPKCS8, generateKeyPair, SignJWT, type KeyLike } from 'jose'
import fs = require('node:fs')
import {
  APPLE_SIGN_IN_AUDIENCE,
  GOOGLE_SIGN_IN_AUDIENCE,
  InvalidSocialCredential,
  OAuthProviderService,
  SocialLoginUnavailable,
} from './oauth.provider'

jest.mock('jose', () => ({ ...jest.requireActual('jose'), createRemoteJWKSet: jest.fn() }))

describe('provider token verification (real signatures, no provider network)', () => {
  let privateKey: KeyLike
  let publicKey: KeyLike
  let signingKey: string
  const env = { ...process.env }
  const originalFetch = global.fetch
  const nonce = 'n'.repeat(43)
  beforeAll(async () => {
    ;({ privateKey, publicKey } = await generateKeyPair('RS256'))
    signingKey = await exportPKCS8((await generateKeyPair('ES256')).privateKey)
  })
  beforeEach(() => {
    process.env = {
      ...env,
      ANSTOSS_SOCIAL_LOGIN_ENABLED: 'true',
      ANSTOSS_APPLE_SIGN_IN_ENABLED: 'true',
      ANSTOSS_APPLE_SIGN_IN_TEAM_ID: 'A3H3NSC234',
      ANSTOSS_APPLE_SIGN_IN_KEY_ID: 'test-key',
      ANSTOSS_APPLE_SIGN_IN_KEY_FILE: '/test-only/apple.p8',
      ANSTOSS_AUTH_ENCRYPTION_KEY: 'ab'.repeat(32),
    }
    jest.mocked(createRemoteJWKSet).mockReturnValue(publicKey as never)
    const readFile = fs.readFileSync
    jest
      .spyOn(fs, 'readFileSync')
      .mockImplementation(((path: unknown, options: unknown) =>
        path === '/test-only/apple.p8'
          ? signingKey
          : readFile(path as never, options as never)) as never)
  })
  afterEach(() => {
    jest.restoreAllMocks()
    process.env = { ...env }
    global.fetch = originalFetch
  })
  async function token(
    provider: 'google' | 'apple' = 'google',
    claims: Record<string, unknown> = {},
  ) {
    return new SignJWT({
      email: 'Player@example.com',
      email_verified: true,
      ...(provider === 'apple' ? { nonce } : {}),
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(
        provider === 'google' ? 'https://accounts.google.com' : 'https://appleid.apple.com',
      )
      .setAudience(provider === 'google' ? GOOGLE_SIGN_IN_AUDIENCE : APPLE_SIGN_IN_AUDIENCE)
      .setSubject('provider-subject')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey)
  }
  it('accepts a Google-signed identity for the Anstoss web audience', async () => {
    expect(await new OAuthProviderService().verify('google', { idToken: await token() })).toEqual({
      provider: 'google',
      subject: 'provider-subject',
      email: 'player@example.com',
      name: null,
      sealedRefreshToken: null,
    })
  })
  it('fails closed when disabled', async () => {
    delete process.env.ANSTOSS_SOCIAL_LOGIN_ENABLED
    await expect(
      new OAuthProviderService().verify('google', { idToken: 'x' }),
    ).rejects.toBeInstanceOf(SocialLoginUnavailable)
  })
  it.each(['another-app', 'com.renuir.app'])(
    'rejects another app audience: %s',
    async (audience) => {
      const signed = await new SignJWT({ email: 'x@example.com', email_verified: true })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer('https://accounts.google.com')
        .setAudience(audience)
        .setSubject('x')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey)
      await expect(
        new OAuthProviderService().verify('google', { idToken: signed }),
      ).rejects.toBeInstanceOf(InvalidSocialCredential)
    },
  )
  it('rejects unverified email', async () => {
    await expect(
      new OAuthProviderService().verify('google', {
        idToken: await token('google', { email_verified: false }),
      }),
    ).rejects.toBeInstanceOf(InvalidSocialCredential)
  })
  it('rejects a foreign authorized party', async () => {
    await expect(
      new OAuthProviderService().verify('google', {
        idToken: await token('google', { azp: 'other-client' }),
      }),
    ).rejects.toBeInstanceOf(InvalidSocialCredential)
  })
  it('rejects forged signatures', async () => {
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://accounts.google.com')
      .setAudience(GOOGLE_SIGN_IN_AUDIENCE)
      .setSubject('x')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign((await generateKeyPair('RS256')).privateKey)
    await expect(
      new OAuthProviderService().verify('google', { idToken: forged }),
    ).rejects.toBeInstanceOf(InvalidSocialCredential)
  })
  it('rejects expired tokens', async () => {
    const expired = await new SignJWT({ email: 'x@example.com', email_verified: true })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://accounts.google.com')
      .setAudience(GOOGLE_SIGN_IN_AUDIENCE)
      .setSubject('x')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey)
    await expect(
      new OAuthProviderService().verify('google', { idToken: expired }),
    ).rejects.toBeInstanceOf(InvalidSocialCredential)
  })
  it('rejects an Apple nonce mismatch without exchanging the code', async () => {
    global.fetch = jest.fn()
    await expect(
      new OAuthProviderService().verify('apple', {
        idToken: await token('apple'),
        nonce: 'wrong'.repeat(10),
        authorizationCode: 'code',
      }),
    ).rejects.toBeInstanceOf(InvalidSocialCredential)
    expect(global.fetch).not.toHaveBeenCalled()
  })
  it('exchanges Apple codes, encrypts the refresh token and accepts private relay addresses', async () => {
    const signed = await token('apple', {
      email: 'private@privaterelay.appleid.com',
      email_verified: 'true',
    })
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: signed, refresh_token: 'test-refresh' }),
    })
    const provider = new OAuthProviderService()
    const input = {
      idToken: signed,
      nonce,
      authorizationCode: 'one-use-code',
    }
    const verified = await provider.verify('apple', input)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(verified.sealedRefreshToken).toBeNull()
    const result = await provider.exchangeApple(verified, input)
    expect(result.email).toBe('private@privaterelay.appleid.com')
    expect(result.sealedRefreshToken).not.toContain('test-refresh')
    await provider.revokeApple(result.sealedRefreshToken!)
    expect(global.fetch).toHaveBeenLastCalledWith(
      'https://appleid.apple.com/auth/revoke',
      expect.objectContaining({
        body: expect.any(URLSearchParams),
        redirect: 'error',
      }),
    )
    const request = jest.mocked(global.fetch).mock.calls[1][1]!
    expect((request.body as URLSearchParams).get('token')).toBe('test-refresh')
  })
  it('rejects an authorization code from a different Apple identity', async () => {
    const other = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://appleid.apple.com')
      .setAudience(APPLE_SIGN_IN_AUDIENCE)
      .setSubject('other-subject')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: other, refresh_token: 'secret' }),
    })
    const provider = new OAuthProviderService()
    const input = { idToken: await token('apple'), nonce, authorizationCode: 'code' }
    const log = jest.spyOn(provider['logger'], 'error').mockImplementation(() => undefined)
    const verified = await provider.verify('apple', input)
    await expect(provider.exchangeApple(verified, input)).rejects.toBeInstanceOf(
      InvalidSocialCredential,
    )
    expect(log).toHaveBeenCalledWith(
      'Apple grant exchange did not complete locally; provider outcome may be indeterminate',
    )
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret')
  })

  async function notification(
    options: {
      audience?: string
      issuer?: string
      event?: Record<string, unknown>
      stringEvents?: boolean
      key?: KeyLike
    } = {},
  ) {
    const event = {
      type: 'consent-revoked',
      sub: 'apple-subject',
      event_time: Math.floor(Date.now() / 1000),
      ...options.event,
    }
    return new SignJWT({ events: options.stringEvents ? JSON.stringify(event) : event })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(options.issuer ?? 'https://appleid.apple.com')
      .setAudience(options.audience ?? APPLE_SIGN_IN_AUDIENCE)
      .setIssuedAt()
      .setJti('event-id')
      .sign(options.key ?? privateKey)
  }
  it.each([false, true])(
    'verifies signed Apple notifications without exp (string events: %s)',
    async (stringEvents) => {
      process.env.ANSTOSS_SOCIAL_LOGIN_ENABLED = 'false'
      expect(
        await new OAuthProviderService().verifyAppleNotification(
          await notification({ stringEvents }),
        ),
      ).toMatchObject({
        type: 'consent-revoked',
        subject: 'apple-subject',
        eventTime: expect.any(Number),
      })
    },
  )
  it.each([
    { audience: 'com.renuir.app' },
    { issuer: 'https://attacker.invalid' },
    { event: { event_time: -1 } },
    { event: { event_time: 9_999_999_999 } },
    { event: { event_time: '123' } },
    { event: { sub: '' } },
    { event: { type: 'unexpected' } },
  ])('rejects invalid Apple notifications: %p', async (options) => {
    await expect(
      new OAuthProviderService().verifyAppleNotification(await notification(options)),
    ).rejects.toBeInstanceOf(InvalidSocialCredential)
  })
  it('rejects forged notification signatures', async () => {
    const key = (await generateKeyPair('RS256')).privateKey
    await expect(
      new OAuthProviderService().verifyAppleNotification(await notification({ key })),
    ).rejects.toBeInstanceOf(InvalidSocialCredential)
  })
})
