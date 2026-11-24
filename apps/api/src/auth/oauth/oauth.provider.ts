import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTPayload } from 'jose'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { OAuthProvider, OAuthSignInInput } from '@anstoss/shared'

export const APPLE_SIGN_IN_AUDIENCE = 'com.renuirug.anstoss'
export const GOOGLE_SIGN_IN_AUDIENCE =
  '387307271714-6um2fcotjbrr8p3eo5754f416iao6e5k.apps.googleusercontent.com'
const GOOGLE_IOS_CLIENT = '387307271714-7ucmis3qn03b8canv0ucijfk98imhvbm.apps.googleusercontent.com'
const GOOGLE_ANDROID_CLIENT =
  '387307271714-5vppsd1fmlc3geus5e61pfqqa774hm5t.apps.googleusercontent.com'

export class SocialLoginUnavailable extends ServiceUnavailableException {
  constructor() {
    super({ code: 'OAUTH_UNAVAILABLE', message: 'Please sign in with your email for now.' })
  }
}
export class InvalidSocialCredential extends UnauthorizedException {
  constructor() {
    super({ code: 'OAUTH_INVALID', message: 'Sign-in could not be verified. Please try again.' })
  }
}

export interface VerifiedSocialIdentity {
  provider: OAuthProvider
  subject: string
  email: string | null
  name: string | null
  sealedRefreshToken: string | null
  authenticatedAt?: number
}

export interface VerifiedAppleNotification {
  type: 'consent-revoked' | 'account-deleted' | 'email-enabled' | 'email-disabled'
  subject: string
  eventTime: number
}

/** Called only after signature/issuer/audience validation. Never trust client email or user IDs. */
export function socialClaims(provider: OAuthProvider, claims: JWTPayload, nonce?: string) {
  const now = Math.floor(Date.now() / 1000)
  if (
    !claims.sub ||
    claims.sub.length > 255 ||
    !Number.isInteger(claims.iat) ||
    claims.iat! > now + 30 ||
    claims.iat! < now - 3600 ||
    !Number.isInteger(claims.exp)
  ) {
    throw new InvalidSocialCredential()
  }
  if (provider === 'apple' && (!nonce || nonce.length < 32 || claims.nonce !== nonce)) {
    throw new InvalidSocialCredential()
  }
  if (
    provider === 'google' &&
    claims.azp &&
    ![GOOGLE_SIGN_IN_AUDIENCE, GOOGLE_IOS_CLIENT, GOOGLE_ANDROID_CLIENT].includes(
      String(claims.azp),
    )
  ) {
    throw new InvalidSocialCredential()
  }
  const verified =
    claims.email_verified === true || (provider === 'apple' && claims.email_verified === 'true')
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : null
  if (
    (email && (!verified || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
    (provider === 'google' && !email)
  )
    throw new InvalidSocialCredential()
  return {
    subject: claims.sub,
    email,
    name: typeof claims.name === 'string' ? claims.name.trim().slice(0, 120) || null : null,
  }
}

@Injectable()
export class OAuthProviderService {
  private readonly logger = new Logger(OAuthProviderService.name)
  private readonly googleKeys = createRemoteJWKSet(
    new URL('https://www.googleapis.com/oauth2/v3/certs'),
    { timeoutDuration: 5000 },
  )
  private readonly appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'), {
    timeoutDuration: 5000,
  })

  configured(provider: OAuthProvider): boolean {
    const env = process.env
    if (env.ANSTOSS_SOCIAL_LOGIN_ENABLED !== 'true') return false
    if (provider === 'google') return true
    return (
      env.ANSTOSS_APPLE_SIGN_IN_ENABLED === 'true' &&
      env.ANSTOSS_APPLE_SIGN_IN_TEAM_ID === 'A3H3NSC234' &&
      Boolean(env.ANSTOSS_APPLE_SIGN_IN_KEY_ID && env.ANSTOSS_APPLE_SIGN_IN_KEY_FILE) &&
      /^[a-fA-F0-9]{64}$/.test(env.ANSTOSS_AUTH_ENCRYPTION_KEY ?? '')
    )
  }

  async verify(provider: OAuthProvider, input: OAuthSignInInput): Promise<VerifiedSocialIdentity> {
    if (!this.configured(provider)) throw new SocialLoginUnavailable()
    try {
      const { payload } = await jwtVerify(
        input.idToken,
        provider === 'apple' ? this.appleKeys : this.googleKeys,
        {
          algorithms: ['RS256'],
          issuer:
            provider === 'apple'
              ? 'https://appleid.apple.com'
              : ['https://accounts.google.com', 'accounts.google.com'],
          audience: provider === 'apple' ? APPLE_SIGN_IN_AUDIENCE : GOOGLE_SIGN_IN_AUDIENCE,
          requiredClaims: ['sub', 'iat', 'exp'],
          clockTolerance: 30,
        },
      )
      const identity = socialClaims(provider, payload, input.nonce)
      return {
        provider,
        ...identity,
        sealedRefreshToken: null,
        ...(provider === 'apple' ? { authenticatedAt: payload.iat! } : {}),
      }
    } catch {
      throw new InvalidSocialCredential()
    }
  }

  /** Called only with verified nonce-bound claims, under the subject lock. */
  async exchangeApple(
    identity: VerifiedSocialIdentity,
    input: OAuthSignInInput,
  ): Promise<VerifiedSocialIdentity> {
    if (!this.configured('apple')) throw new SocialLoginUnavailable()
    let exchangeAttempted = false
    try {
      if (identity.provider !== 'apple' || !input.authorizationCode)
        throw new InvalidSocialCredential()
      exchangeAttempted = true
      const tokens = await this.appleRequest('token', {
        grant_type: 'authorization_code',
        code: input.authorizationCode,
      })
      if (typeof tokens.id_token !== 'string' || typeof tokens.refresh_token !== 'string')
        throw new InvalidSocialCredential()
      const exchanged = await jwtVerify(tokens.id_token, this.appleKeys, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: APPLE_SIGN_IN_AUDIENCE,
        requiredClaims: ['sub', 'iat', 'exp'],
        clockTolerance: 30,
      })
      if (
        exchanged.payload.sub !== identity.subject ||
        !Number.isSafeInteger(exchanged.payload.iat)
      )
        throw new InvalidSocialCredential()
      return {
        ...identity,
        name: identity.name ?? input.fullName ?? null,
        authenticatedAt: Math.min(identity.authenticatedAt!, exchanged.payload.iat!),
        sealedRefreshToken: this.seal(tokens.refresh_token),
      }
    } catch {
      // Neither provider errors nor JWT payloads may enter logs/telemetry.
      // A timed-out response or post-exchange verification failure can still
      // have issued a grant. Report indeterminate completion, not a safe retry.
      if (exchangeAttempted)
        this.logger.error(
          'Apple grant exchange did not complete locally; provider outcome may be indeterminate',
        )
      throw new InvalidSocialCredential()
    }
  }

  async verifyAppleNotification(token: string): Promise<VerifiedAppleNotification> {
    // Lifecycle notifications must remain active when new sign-ins are disabled.
    try {
      const { payload } = await jwtVerify(token, this.appleKeys, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: APPLE_SIGN_IN_AUDIENCE,
        requiredClaims: ['iat', 'jti', 'events'],
        clockTolerance: 30,
      })
      const events: unknown =
        typeof payload.events === 'string' ? JSON.parse(payload.events) : payload.events
      if (!events || typeof events !== 'object' || Array.isArray(events))
        throw new InvalidSocialCredential()
      const event = events as Record<string, unknown>
      const now = Math.floor(Date.now() / 1000)
      if (
        !Number.isSafeInteger(payload.iat) ||
        payload.iat! <= 0 ||
        payload.iat! > now + 30 ||
        typeof payload.jti !== 'string' ||
        !payload.jti.length ||
        payload.jti.length > 255 ||
        typeof event.sub !== 'string' ||
        !event.sub.length ||
        event.sub.length > 255 ||
        !Number.isSafeInteger(event.event_time) ||
        (event.event_time as number) <= 0 ||
        (event.event_time as number) > Math.min(now, payload.iat!) + 30 ||
        !['consent-revoked', 'account-deleted', 'email-enabled', 'email-disabled'].includes(
          String(event.type),
        )
      ) {
        throw new InvalidSocialCredential()
      }
      return {
        type: event.type as VerifiedAppleNotification['type'],
        subject: event.sub,
        eventTime: event.event_time as number,
      }
    } catch {
      throw new InvalidSocialCredential()
    }
  }

  async revokeApple(sealedRefreshToken: string): Promise<void> {
    await this.appleRequest('revoke', {
      token: this.unseal(sealedRefreshToken),
      token_type_hint: 'refresh_token',
    })
  }

  private async appleRequest(
    endpoint: 'token' | 'revoke',
    parameters: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const env = process.env
    if (
      !env.ANSTOSS_APPLE_SIGN_IN_KEY_FILE ||
      !env.ANSTOSS_APPLE_SIGN_IN_KEY_ID ||
      env.ANSTOSS_APPLE_SIGN_IN_TEAM_ID !== 'A3H3NSC234'
    )
      throw new SocialLoginUnavailable()
    const key = await importPKCS8(readFileSync(env.ANSTOSS_APPLE_SIGN_IN_KEY_FILE, 'utf8'), 'ES256')
    const secret = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: env.ANSTOSS_APPLE_SIGN_IN_KEY_ID })
      .setIssuer(env.ANSTOSS_APPLE_SIGN_IN_TEAM_ID)
      .setSubject(APPLE_SIGN_IN_AUDIENCE)
      .setAudience('https://appleid.apple.com')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key)
    const response = await fetch(`https://appleid.apple.com/auth/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...parameters,
        client_id: APPLE_SIGN_IN_AUDIENCE,
        client_secret: secret,
      }),
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    })
    if (!response.ok) throw new InvalidSocialCredential()
    return endpoint === 'revoke' ? {} : ((await response.json()) as Record<string, unknown>)
  }

  private encryptionKey(): Buffer {
    const key = process.env.ANSTOSS_AUTH_ENCRYPTION_KEY ?? ''
    if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new SocialLoginUnavailable()
    return Buffer.from(key, 'hex')
  }
  private seal(value: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv)
    cipher.setAAD(Buffer.from('anstoss:apple-sign-in:v1'))
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.')
  }
  private unseal(value: string): string {
    const parts = value.split('.').map((part) => Buffer.from(part, 'base64url'))
    if (parts.length !== 3 || parts[0].length !== 12 || parts[1].length !== 16)
      throw new InvalidSocialCredential()
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), parts[0])
    decipher.setAAD(Buffer.from('anstoss:apple-sign-in:v1'))
    decipher.setAuthTag(parts[1])
    return Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString('utf8')
  }
}
