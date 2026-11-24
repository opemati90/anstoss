import { ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { OtpService } from '../otp/otp.service'
import { verifySessionToken } from '../otp/jwt.util'
import {
  InvalidSocialCredential,
  OAuthProviderService,
  SocialLoginUnavailable,
} from './oauth.provider'
import {
  SocialLinkExpired,
  SocialLoginService,
  socialSubjectHash,
  socialTicketHash,
} from './oauth.service'

describe('social account ownership', () => {
  const env = { ...process.env }
  const user = { id: 'user-one', email: 'player@example.com', deletedAt: null, managedById: null }
  const verified = {
    provider: 'google',
    subject: 'google-subject',
    email: user.email,
    name: 'Player',
    sealedRefreshToken: null,
  }
  const pending = {
    id: 'pending-one',
    tokenHash: 'hash',
    kind: 'link',
    provider: 'google',
    subjectHash: 'subject-hash',
    userId: user.id,
    email: user.email,
    sealedRefreshToken: null,
    expiresAt: new Date(Date.now() + 600_000),
  }
  function setup() {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      socialIdentity: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      socialLoginChallenge: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(pending),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      authIdentityTombstone: { findUnique: jest.fn().mockResolvedValue(null) },
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(user),
      },
    }
    const prisma = {
      ...db,
      $transaction: jest.fn(async (fn: (tx: typeof db) => unknown) => fn(db)),
    }
    const provider = {
      configured: jest.fn().mockReturnValue(true),
      verify: jest.fn().mockResolvedValue(verified),
      exchangeApple: jest.fn(),
    }
    const otp = {
      requestCode: jest.fn(),
      verifyCode: jest.fn().mockResolvedValue({ user, token: 'email-proved-session' }),
    }
    const service = new SocialLoginService(
      prisma as unknown as PrismaService,
      provider as unknown as OAuthProviderService,
      otp as unknown as OtpService,
    )
    return { db, prisma, provider, otp, service }
  }
  beforeEach(() => {
    process.env.AUTH_OTP_PEPPER = 'local-test-pepper'
    process.env.AUTH_JWT_SECRET = 'local-test-jwt-secret'
  })
  afterEach(() => {
    process.env = { ...env }
  })

  it('creates a new identity without supplying adult confirmation, DOB or roles', async () => {
    const { service, db } = setup()
    const result = await service.signIn('google', { idToken: 'verified-by-provider' })
    expect(result.kind).toBe('session')
    if (result.kind !== 'session') throw new Error('Expected session')
    expect(verifySessionToken(result.token).sub).toBe(user.id)
    expect(db.user.create).toHaveBeenCalledWith({
      data: {
        email: user.email,
        name: 'Player',
        socialIdentities: {
          create: {
            provider: 'google',
            subjectHash: socialSubjectHash('google', verified.subject),
            sealedRefreshToken: null,
          },
        },
      },
      include: { socialIdentities: true },
    })
  })
  it('requires email proof, never auto-links an existing email match', async () => {
    const { service, db, otp } = setup()
    db.user.findFirst.mockResolvedValue(user)
    const result = await service.signIn('google', { idToken: 'verified-by-provider' })
    expect(result.kind).toBe('link_required')
    if (result.kind !== 'link_required') throw new Error('Expected link')
    expect(result).not.toHaveProperty('token')
    expect(db.socialLoginChallenge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tokenHash: socialTicketHash(result.ticket),
        email: user.email,
        userId: user.id,
      }),
    })
    expect(otp.requestCode).toHaveBeenCalledWith(user.email)
    expect(db.socialIdentity.create).not.toHaveBeenCalled()
    expect(db.user.create).not.toHaveBeenCalled()
  })
  it.each([{ deletedAt: new Date() }, { managedById: 'guardian' }])(
    'rejects inactive or managed linked accounts: %p',
    async (change) => {
      const { service, db } = setup()
      db.socialIdentity.findUnique.mockResolvedValue({
        userId: user.id,
        user: { ...user, ...change },
      })
      await expect(service.signIn('google', { idToken: 'verified' })).rejects.toBeInstanceOf(
        InvalidSocialCredential,
      )
      expect(db.user.create).not.toHaveBeenCalled()
    },
  )
  it('blocks underage email re-registration', async () => {
    const { service, db } = setup()
    db.authIdentityTombstone.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ createdAt: new Date() })
    await expect(service.signIn('google', { idToken: 'verified' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(db.user.create).not.toHaveBeenCalled()
  })
  it('blocks recently deleted provider identities', async () => {
    const { service, db } = setup()
    db.authIdentityTombstone.findUnique.mockResolvedValue({ createdAt: new Date() })
    await expect(service.signIn('google', { idToken: 'verified' })).rejects.toBeInstanceOf(
      InvalidSocialCredential,
    )
  })
  it('rejects reused Apple nonces before contacting the provider', async () => {
    const { service, db, provider } = setup()
    db.socialLoginChallenge.deleteMany.mockResolvedValue({ count: 0 })
    await expect(
      service.signIn('apple', { idToken: 'verified', nonce: 'n'.repeat(43) }),
    ).rejects.toBeInstanceOf(InvalidSocialCredential)
    expect(provider.verify).not.toHaveBeenCalled()
  })
  it('stores only the hash of server-issued Apple nonces', async () => {
    const { service, db } = setup()
    const { nonce } = await service.appleNonce()
    expect(nonce).toHaveLength(43)
    expect(db.socialLoginChallenge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tokenHash: socialTicketHash(nonce),
        kind: 'nonce',
        provider: 'apple',
      }),
    })
    expect(JSON.stringify(db.socialLoginChallenge.create.mock.calls)).not.toContain(nonce)
  })
  it('uses only the ticket email for proof and attaches after successful proof', async () => {
    const { service, db, otp } = setup()
    db.user.findFirst.mockResolvedValue(user)
    await expect(service.link('ticket', '123456')).resolves.toEqual({
      kind: 'session',
      token: 'email-proved-session',
    })
    expect(otp.verifyCode).toHaveBeenCalledWith(user.email, '123456')
    expect(db.socialIdentity.create).toHaveBeenCalledWith({
      data: {
        provider: 'google',
        subjectHash: pending.subjectHash,
        userId: user.id,
        sealedRefreshToken: null,
      },
    })
  })
  it('rejects a reused link ticket even with a valid email proof', async () => {
    const { service, db } = setup()
    db.user.findFirst.mockResolvedValue(user)
    db.socialLoginChallenge.deleteMany.mockResolvedValue({ count: 0 })
    await expect(service.link('ticket', '123456')).rejects.toBeInstanceOf(SocialLinkExpired)
    expect(db.socialIdentity.create).not.toHaveBeenCalled()
  })
  it('rejects an email proof that resolves to a different user', async () => {
    const { service, db, otp } = setup()
    otp.verifyCode.mockResolvedValue({
      user: { ...user, id: 'other-user' },
      token: 'different-session',
    })
    await expect(service.link('ticket', '123456')).rejects.toBeInstanceOf(InvalidSocialCredential)
    expect(db.socialIdentity.create).not.toHaveBeenCalled()
  })
  it('never replaces a different Google account already attached to the user', async () => {
    const { service, db } = setup()
    db.user.findFirst.mockResolvedValue(user)
    db.socialIdentity.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ subjectHash: 'different-subject' })
    await expect(service.link('ticket', '123456')).rejects.toBeInstanceOf(InvalidSocialCredential)
    expect(db.socialIdentity.create).not.toHaveBeenCalled()
  })
  it('does not verify codes for expired link tickets', async () => {
    const { service, db, otp } = setup()
    db.socialLoginChallenge.findUnique.mockResolvedValue({ ...pending, expiresAt: new Date(0) })
    await expect(service.link('ticket', '123456')).rejects.toBeInstanceOf(SocialLinkExpired)
    expect(otp.verifyCode).not.toHaveBeenCalled()
  })
  it.each([null, { ...pending, expiresAt: new Date(0) }])(
    'requires restart for a missing or expired resend ticket',
    async (record) => {
      const { service, db, otp } = setup()
      db.socialLoginChallenge.findUnique.mockResolvedValue(record)
      await expect(service.resendLink('ticket')).rejects.toMatchObject({
        response: { code: 'OAUTH_LINK_EXPIRED' },
        status: 410,
      })
      expect(otp.requestCode).not.toHaveBeenCalled()
    },
  )
  it('fails closed while disabled', async () => {
    const { service, provider } = setup()
    provider.configured.mockReturnValue(false)
    await expect(service.signIn('google', { idToken: 'verified' })).rejects.toBeInstanceOf(
      SocialLoginUnavailable,
    )
    expect(provider.verify).not.toHaveBeenCalled()
  })

  function appleSetup() {
    const state = setup()
    const identity = {
      ...verified,
      provider: 'apple',
      authenticatedAt: Math.floor(Date.now() / 1000),
      sealedRefreshToken: 'encrypted-test-grant',
    }
    state.provider.verify.mockResolvedValue({ ...identity, sealedRefreshToken: null })
    state.provider.exchangeApple.mockResolvedValue(identity)
    state.db.socialLoginChallenge.create.mockResolvedValue({ id: 'durable-journal' })
    state.db.socialIdentity.findUnique.mockResolvedValue({
      id: 'linked',
      userId: user.id,
      user,
      providerAuthenticatedAt: new Date(0),
    })
    const log = jest.spyOn(state.service['logger'], 'error').mockImplementation(() => undefined)
    return {
      ...state,
      identity,
      log,
      input: { idToken: 'fixture', nonce: 'n'.repeat(43), authorizationCode: 'code' },
    }
  }

  it('refuses Apple login when the journal cannot be persisted, with sanitized diagnostics', async () => {
    const { service, db, prisma, input, log } = appleSetup()
    db.socialLoginChallenge.create.mockRejectedValue(new Error('private-database-detail'))
    await expect(service.signIn('apple', input)).rejects.toThrow('private-database-detail')
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(db.socialIdentity.update).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('Apple grant journal persistence failed; login refused')
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-database-detail')
  })

  it('does not start business processing after an unsuccessful Apple exchange', async () => {
    const { service, db, prisma, provider, input } = appleSetup()
    provider.exchangeApple.mockRejectedValue(new InvalidSocialCredential())
    await expect(service.signIn('apple', input)).rejects.toBeInstanceOf(InvalidSocialCredential)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(db.socialLoginChallenge.create).not.toHaveBeenCalled()
    expect(db.socialIdentity.findUnique).not.toHaveBeenCalled()
  })

  it('refuses a grant whose journal is missing or expired before ownership transfer', async () => {
    const { service, db, input } = appleSetup()
    db.socialLoginChallenge.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    await expect(service.signIn('apple', input)).rejects.toBeInstanceOf(InvalidSocialCredential)
    expect(db.socialIdentity.findUnique).not.toHaveBeenCalled()
    expect(db.socialIdentity.update).not.toHaveBeenCalled()
  })

  it('requires exact journal ownership and records the proof timestamp on successful transfer', async () => {
    const { service, db, input, identity } = appleSetup()
    const result = await service.signIn('apple', input)
    expect(result.kind).toBe('session')
    expect(db.socialLoginChallenge.deleteMany).toHaveBeenLastCalledWith({
      where: {
        id: 'durable-journal',
        kind: 'grant',
        provider: 'apple',
        subjectHash: socialSubjectHash('apple', identity.subject),
        sealedRefreshToken: identity.sealedRefreshToken,
        providerAuthenticatedAt: new Date(identity.authenticatedAt * 1000),
        expiresAt: { gt: expect.any(Date) },
      },
    })
    expect(db.socialIdentity.update).toHaveBeenCalledWith({
      where: { id: 'linked' },
      data: {
        sealedRefreshToken: identity.sealedRefreshToken,
        providerAuthenticatedAt: new Date(identity.authenticatedAt * 1000),
      },
    })
  })
})
