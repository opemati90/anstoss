import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { OAuthProvider, OAuthSignInInput, OAuthSignInResult } from '@anstoss/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { OtpService } from '../otp/otp.service'
import { signSessionToken } from '../otp/jwt.util'
import { isUnderageEmailBlocked } from '../underage-email-tombstone'
import {
  InvalidSocialCredential,
  OAuthProviderService,
  SocialLoginUnavailable,
  type VerifiedSocialIdentity,
} from './oauth.provider'
import { assertAppleProofCurrent } from './apple-session'

const CHALLENGE_TTL_MS = 10 * 60_000
export class SocialLinkExpired extends GoneException {
  constructor() {
    super({
      code: 'OAUTH_LINK_EXPIRED',
      message: 'This sign-in attempt is no longer valid. Please start sign-in again.',
    })
  }
}
export const socialTicketHash = (value: string) => createHash('sha256').update(value).digest('hex')
export function socialSubjectHash(provider: OAuthProvider, subject: string): string {
  const pepper = process.env.AUTH_OTP_PEPPER
  if (!pepper) throw new SocialLoginUnavailable()
  return createHmac('sha256', pepper).update(`social:${provider}:${subject}`).digest('hex')
}

@Injectable()
export class SocialLoginService {
  private readonly logger = new Logger(SocialLoginService.name)
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: OAuthProviderService,
    private readonly otp: OtpService,
  ) {}

  availability() {
    return {
      google: this.providers.configured('google'),
      apple: this.providers.configured('apple'),
    }
  }

  async appleNonce(): Promise<{ nonce: string }> {
    if (!this.providers.configured('apple')) throw new SocialLoginUnavailable()
    const nonce = randomBytes(32).toString('base64url')
    await this.prisma.socialLoginChallenge.create({
      data: {
        tokenHash: socialTicketHash(nonce),
        kind: 'nonce',
        provider: 'apple',
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    })
    return { nonce }
  }

  async signIn(provider: OAuthProvider, input: OAuthSignInInput): Promise<OAuthSignInResult> {
    // Consume a server-issued Apple nonce before any expensive provider request.
    if (!this.providers.configured(provider)) throw new SocialLoginUnavailable()
    if (provider === 'apple') {
      if (!input.nonce) throw new InvalidSocialCredential()
      const used = await this.prisma.socialLoginChallenge.deleteMany({
        where: {
          tokenHash: socialTicketHash(input.nonce),
          kind: 'nonce',
          provider,
          expiresAt: { gt: new Date() },
        },
      })
      if (used.count !== 1) throw new InvalidSocialCredential()
    }
    let identity = await this.providers.verify(provider, input)
    let grantJournalId: string | undefined
    if (provider === 'apple') {
      const grant = await this.acquireAppleGrant(identity, input)
      identity = grant.identity
      grantJournalId = grant.id
    }
    const subjectHash = socialSubjectHash(provider, identity.subject)
    const result = await this.prisma
      .$transaction(async (tx) => {
        // Serialize competing logins/linking for the same provider subject.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${provider}), hashtext(${subjectHash}))::text`
        if (provider === 'apple') {
          await assertAppleProofCurrent(tx, subjectHash, identity.authenticatedAt!)
          // The journal and its encrypted credential survive any rollback of
          // this transaction. Ownership moves only with the identity/link write.
          const consumed = await tx.socialLoginChallenge.deleteMany({
            where: {
              id: grantJournalId!,
              kind: 'grant',
              provider: 'apple',
              subjectHash,
              sealedRefreshToken: identity.sealedRefreshToken,
              providerAuthenticatedAt: new Date(identity.authenticatedAt! * 1000),
              expiresAt: { gt: new Date() },
            },
          })
          if (consumed.count !== 1) throw new InvalidSocialCredential()
        }
        const linked = await tx.socialIdentity.findUnique({
          where: { provider_subjectHash: { provider, subjectHash } },
          include: { user: true },
        })
        if (linked) {
          if (linked.user.deletedAt || linked.user.managedById) throw new InvalidSocialCredential()
          // A freshly completed exchange can initialize a legacy unknown proof;
          // journal replay/cleanup is deliberately not allowed to do so.
          if (
            identity.sealedRefreshToken &&
            (!linked.providerAuthenticatedAt ||
              identity.authenticatedAt! * 1000 > linked.providerAuthenticatedAt.getTime())
          )
            await tx.socialIdentity.update({
              where: { id: linked.id },
              data: {
                sealedRefreshToken: identity.sealedRefreshToken,
                providerAuthenticatedAt: new Date(identity.authenticatedAt! * 1000),
              },
            })
          return {
            kind: 'session' as const,
            token: signSessionToken(
              linked.userId,
              provider === 'apple'
                ? { appleIdentity: linked.id, appleAuthenticatedAt: identity.authenticatedAt }
                : {},
            ),
          }
        }
        const tombstone = await tx.authIdentityTombstone.findUnique({
          where: {
            provider_subjectHash: { provider: `social-${provider}`, subjectHash },
          },
        })
        if (tombstone && Date.now() - tombstone.createdAt.getTime() < 30 * 86_400_000) {
          throw new InvalidSocialCredential()
        }
        if (!identity.email) throw new InvalidSocialCredential()
        if (await isUnderageEmailBlocked(tx, identity.email))
          throw new ForbiddenException({
            code: 'UNDERAGE_EMAIL_BLOCKED',
            message: 'This account cannot register again yet.',
          })
        const existing = await tx.user.findFirst({
          where: { email: { equals: identity.email, mode: 'insensitive' }, deletedAt: null },
        })
        if (existing) {
          if (existing.managedById) throw new InvalidSocialCredential()
          // No auto-merge by email: possession of the existing account's email
          // factor must be proven explicitly before this identity is attached.
          const ticket = randomBytes(32).toString('base64url')
          await tx.socialLoginChallenge.create({
            data: {
              tokenHash: socialTicketHash(ticket),
              kind: 'link',
              provider,
              subjectHash,
              email: existing.email!,
              userId: existing.id,
              sealedRefreshToken: identity.sealedRefreshToken,
              ...(provider === 'apple'
                ? { providerAuthenticatedAt: new Date(identity.authenticatedAt! * 1000) }
                : {}),
              expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
            },
          })
          return { kind: 'link_required' as const, ticket, email: existing.email! }
        }
        const user = await tx.user.create({
          data: {
            email: identity.email,
            name: identity.name || identity.email.split('@')[0] || 'Player',
            // No DOB, adult-confirmation or roles from the provider: normal onboarding applies.
            socialIdentities: {
              create: {
                provider,
                subjectHash,
                sealedRefreshToken: identity.sealedRefreshToken,
                ...(provider === 'apple'
                  ? { providerAuthenticatedAt: new Date(identity.authenticatedAt! * 1000) }
                  : {}),
              },
            },
          },
          include: { socialIdentities: true },
        })
        return {
          kind: 'session' as const,
          token: signSessionToken(
            user.id,
            provider === 'apple'
              ? {
                  appleIdentity: user.socialIdentities[0].id,
                  appleAuthenticatedAt: identity.authenticatedAt,
                }
              : {},
          ),
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          // An OTP/other provider won the email race. Do NOT attach to that account.
          throw new ConflictException({
            code: 'OAUTH_RETRY',
            message: 'Please start sign-in again.',
          })
        }
        throw error
      })
    if (result.kind === 'link_required') await this.otp.requestCode(result.email)
    return result
  }

  private async acquireAppleGrant(verified: VerifiedSocialIdentity, input: OAuthSignInInput) {
    const subjectHash = socialSubjectHash('apple', verified.subject)
    let exchanged = false
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Cleanup cannot revoke this subject's consent during acquisition.
          // Reserve time for bounded provider/JWKS requests before the transaction
          // expires; an advisory-lock wait must not consume the network budget.
          await tx.$queryRaw`SELECT set_config('lock_timeout', '2000ms', true)`
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'apple'}), hashtext(${subjectHash}))::text`
          await assertAppleProofCurrent(tx, subjectHash, verified.authenticatedAt!)
          const identity = await this.providers.exchangeApple(verified, input)
          exchanged = true
          if (!identity.sealedRefreshToken) throw new InvalidSocialCredential()
          const journal = await tx.socialLoginChallenge.create({
            data: {
              tokenHash: socialTicketHash(randomBytes(32).toString('base64url')),
              kind: 'grant',
              provider: 'apple',
              subjectHash,
              sealedRefreshToken: identity.sealedRefreshToken,
              providerAuthenticatedAt: new Date(identity.authenticatedAt! * 1000),
              expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
            },
          })
          return { id: journal.id, identity }
        },
        { timeout: 25_000 },
      )
    } catch (error) {
      // Apple and PostgreSQL cannot share an atomic commit. If exchange succeeds
      // but journaling fails, deny login and alert without exposing credentials.
      // Blind compensation could revoke another working login for this subject.
      if (exchanged) this.logger.error('Apple grant journal persistence failed; login refused')
      throw error
    }
  }

  private async pendingLink(ticket: string) {
    const pending = await this.prisma.socialLoginChallenge.findUnique({
      where: { tokenHash: socialTicketHash(ticket) },
    })
    if (!pending || pending.expiresAt <= new Date()) throw new SocialLinkExpired()
    if (
      pending.kind !== 'link' ||
      !pending.userId ||
      !pending.email ||
      !pending.subjectHash ||
      !['google', 'apple'].includes(pending.provider)
    )
      throw new InvalidSocialCredential()
    if (!this.providers.configured(pending.provider as OAuthProvider))
      throw new SocialLoginUnavailable()
    return pending
  }

  async resendLink(ticket: string): Promise<{ ok: true }> {
    const pending = await this.pendingLink(ticket)
    await this.otp.requestCode(pending.email!)
    return { ok: true }
  }

  async link(ticket: string, code: string): Promise<OAuthSignInResult> {
    const pending = await this.pendingLink(ticket)
    const proof = await this.otp.verifyCode(pending.email!, code)
    if (proof.user.id !== pending.userId) throw new InvalidSocialCredential()
    const identityId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${pending.provider}), hashtext(${pending.subjectHash!}))::text`
      if (pending.provider === 'apple') {
        try {
          await assertAppleProofCurrent(
            tx,
            pending.subjectHash!,
            pending.providerAuthenticatedAt ? pending.providerAuthenticatedAt.getTime() / 1000 : 0,
          )
        } catch (error) {
          if (error instanceof UnauthorizedException) throw new SocialLinkExpired()
          throw error
        }
      }
      // The row lock makes account deletion and linking mutually exclusive.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${pending.userId!} FOR UPDATE`
      const user = await tx.user.findFirst({
        where: { id: pending.userId!, deletedAt: null, managedById: null },
      })
      if (!user || user.email !== pending.email) throw new InvalidSocialCredential()
      const consumed = await tx.socialLoginChallenge.deleteMany({
        where: { id: pending.id, expiresAt: { gt: new Date() } },
      })
      if (consumed.count !== 1) throw new SocialLinkExpired()
      const existing = await tx.socialIdentity.findUnique({
        where: {
          provider_subjectHash: { provider: pending.provider, subjectHash: pending.subjectHash! },
        },
      })
      if (existing && existing.userId !== pending.userId) throw new InvalidSocialCredential()
      // An unknown legacy credential cannot safely be replaced or discarded by
      // a replayed link. Roll back consumption and require a fresh sign-in.
      if (existing && pending.provider === 'apple' && !existing.providerAuthenticatedAt)
        throw new InvalidSocialCredential()
      // Never replace a previously linked, different provider account.
      const sameProvider = await tx.socialIdentity.findUnique({
        where: {
          provider_userId: { provider: pending.provider, userId: pending.userId! },
        },
      })
      if (sameProvider && sameProvider.subjectHash !== pending.subjectHash)
        throw new InvalidSocialCredential()
      const identity =
        existing ??
        (await tx.socialIdentity.create({
          data: {
            provider: pending.provider,
            subjectHash: pending.subjectHash!,
            userId: pending.userId!,
            sealedRefreshToken: pending.sealedRefreshToken,
            ...(pending.provider === 'apple'
              ? { providerAuthenticatedAt: pending.providerAuthenticatedAt }
              : {}),
          },
        }))
      if (
        existing &&
        pending.provider === 'apple' &&
        pending.sealedRefreshToken &&
        existing.providerAuthenticatedAt &&
        pending.providerAuthenticatedAt! > existing.providerAuthenticatedAt
      ) {
        await tx.socialIdentity.update({
          where: { id: existing.id },
          data: {
            sealedRefreshToken: pending.sealedRefreshToken,
            providerAuthenticatedAt: pending.providerAuthenticatedAt,
          },
        })
      }
      return identity?.id
    })
    if (pending.provider === 'apple') {
      if (!identityId) throw new InvalidSocialCredential()
      return {
        kind: 'session',
        token: signSessionToken(pending.userId!, {
          appleIdentity: identityId,
          appleAuthenticatedAt: pending.providerAuthenticatedAt!.getTime() / 1000,
        }),
      }
    }
    return { kind: 'session', token: proof.token }
  }
}
