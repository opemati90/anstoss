import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { OtpService } from '../otp/otp.service'
import { verifySessionToken } from '../otp/jwt.util'
import { OAuthProviderService } from './oauth.provider'
import { SocialLoginService, socialSubjectHash, socialTicketHash } from './oauth.service'

const url = process.env.SOCIAL_TEST_DATABASE_URL
if (url) {
  const target = new URL(url)
  if (target.hostname !== '127.0.0.1' || !target.pathname.endsWith('_test')) {
    throw new Error('Social login database tests require an isolated localhost *_test database')
  }
}

;(url ? describe : describe.skip)('social login PostgreSQL concurrency', () => {
  const env = { ...process.env }
  const run = randomUUID()
  const email = `social-${run}@example.invalid`
  const subject = `subject-${run}`
  let prisma: PrismaClient
  let service: SocialLoginService
  let userId: string | undefined
  const otp = { requestCode: jest.fn(), verifyCode: jest.fn() }
  beforeAll(async () => {
    if (!url) throw new Error('SOCIAL_TEST_DATABASE_URL required')
    process.env.AUTH_OTP_PEPPER = `test-pepper-${run}`
    process.env.AUTH_JWT_SECRET = `test-secret-${run}`
    prisma = new PrismaClient({ datasources: { db: { url } } })
    const providers = { configured: () => true, verify: async () => ({
      provider: 'google', subject, email, name: 'Local social QA', sealedRefreshToken: null,
    }) }
    service = new SocialLoginService(prisma as unknown as PrismaService,
      providers as unknown as OAuthProviderService, otp as unknown as OtpService)
  })
  afterAll(async () => {
    if (prisma) {
      // Exact per-run fixtures only. Never reset a whole database or table.
      await prisma.socialLoginChallenge.deleteMany({ where: { email } })
      await prisma.user.deleteMany({ where: { email } })
      await prisma.$disconnect()
    }
    process.env = env
  })
  it('serializes simultaneous first logins to one identity and one unprivileged user', async () => {
    const results = await Promise.all([service.signIn('google', { idToken: 'fixture' }),
      service.signIn('google', { idToken: 'fixture' })])
    const ids = results.map((result) => {
      if (result.kind !== 'session') throw new Error('Expected new-user session')
      return verifySessionToken(result.token).sub
    })
    expect(ids[0]).toBe(ids[1])
    userId = ids[0]
    expect(await prisma.user.count({ where: { email } })).toBe(1)
    expect(await prisma.socialIdentity.count({ where: { userId } })).toBe(1)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(user.dateOfBirth).toBeNull()
    expect(user.adultConfirmedAt).toBeNull()
    expect(user.platformRole).toBe('NONE')
  })
  it('consumes a link ticket only once under simultaneous submissions', async () => {
    if (!userId) throw new Error('Missing test user')
    // Remove only the identity created in the preceding test, to exercise linking.
    await prisma.socialIdentity.deleteMany({ where: { userId, provider: 'google' } })
    const ticket = randomUUID()
    await prisma.socialLoginChallenge.create({ data: {
      tokenHash: socialTicketHash(ticket), kind: 'link', provider: 'google',
      subjectHash: socialSubjectHash('google', subject), userId, email,
      expiresAt: new Date(Date.now() + 600_000),
    } })
    otp.verifyCode.mockResolvedValue({ user: { id: userId }, token: 'local-proof-session' })
    const results = await Promise.allSettled([service.link(ticket, '123456'), service.link(ticket, '123456')])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(await prisma.socialIdentity.count({ where: { userId } })).toBe(1)
    expect(await prisma.socialLoginChallenge.count({ where: { tokenHash: socialTicketHash(ticket) } })).toBe(0)
  })
  it.each(['expires', 'is consumed'])('requires restart when a ticket %s after lookup but before transaction consumption', async (change) => {
    if (!userId) throw new Error('Missing test user')
    const ticket = randomUUID()
    const challenge = await prisma.socialLoginChallenge.create({ data: {
      tokenHash: socialTicketHash(ticket), kind: 'link', provider: 'google',
      subjectHash: socialSubjectHash('google', subject), userId, email,
      expiresAt: new Date(Date.now() + 600_000),
    } })
    const identityBefore = await prisma.socialIdentity.findMany({ where: { userId } })
    // verifyCode runs after pendingLink has read the valid ticket. Mutate the
    // real row at that boundary, without mocking transactional consumption.
    otp.verifyCode.mockImplementationOnce(async () => {
      if (change === 'expires') {
        await prisma.socialLoginChallenge.update({
          where: { id: challenge.id }, data: { expiresAt: new Date(0) },
        })
      } else {
        await prisma.socialLoginChallenge.delete({ where: { id: challenge.id } })
      }
      return { user: { id: userId }, token: 'must-not-escape' }
    })
    await expect(service.link(ticket, '123456')).rejects.toMatchObject({
      response: { code: 'OAUTH_LINK_EXPIRED' }, status: 410,
    })
    expect(await prisma.socialIdentity.findMany({ where: { userId } })).toEqual(identityBefore)
    const after = await prisma.socialLoginChallenge.findUnique({ where: { id: challenge.id } })
    if (change === 'expires') expect(after?.expiresAt).toEqual(new Date(0))
    else expect(after).toBeNull()
  })
  it('does not authenticate a soft-deleted user with a valid provider identity', async () => {
    if (!userId) throw new Error('Missing test user')
    await prisma.user.update({ where: { id: userId! }, data: { deletedAt: new Date() } })
    await expect(service.signIn('google', { idToken: 'fixture' })).rejects.toThrow('Sign-in could not be verified')
    expect(await prisma.user.count({ where: { email } })).toBe(1)
  })
})
