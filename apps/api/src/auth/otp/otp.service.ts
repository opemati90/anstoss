/**
 * Email one-time-passcode auth service (replaces Clerk).
 *
 * requestCode: mint a 6-digit code, store ONLY its HMAC-SHA256 hash, invalidate
 *   any prior unconsumed codes for the email, and email the plaintext. Enforces
 *   a per-email hourly cap. Never reveals whether the email exists.
 * verifyCode: constant-time hash compare, expiry + single-use + attempt-cap
 *   enforcement, then find-or-JIT-create the user (by case-insensitive email)
 *   and mint a session JWT.
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { sendEmail } from '../../email/mailer'
import { buildOtpCodeEmail } from '../../email/email-content'
import { resolveLocale } from '../../i18n/translations'
import { signSessionToken } from './jwt.util'

export const OTP_CODE_LENGTH = 6
export const OTP_TTL_MINUTES = 10
export const OTP_MAX_ATTEMPTS = 5
export const OTP_MAX_REQUESTS_PER_HOUR = 5
/**
 * Per-email cap on FAILED verify attempts in a rolling hour. The per-code
 * `attempts` column (max 5) only protects a single code; without a per-email
 * cap an attacker can keep requesting fresh codes (bounded by the request cap)
 * and burn attempts across them. This bounds total brute-force across codes.
 */
export const OTP_MAX_VERIFY_FAILURES_PER_HOUR = 10

export interface AuthenticatedUserShape {
  id: string
  clerkId: string | null
  email: string | null
  name: string
}

export interface VerifyResult {
  token: string
  user: AuthenticatedUserShape
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name)

  constructor(private readonly prisma: PrismaService) {}

  /** Normalize an email for storage/lookup: trimmed + lowercased. */
  private normalizeEmail(email: unknown): string {
    if (typeof email !== 'string') {
      throw new BadRequestException('email is required')
    }
    const normalized = email.trim().toLowerCase()
    // Conservative shape check — full validation lives in Zod at the edge.
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new BadRequestException('A valid email is required')
    }
    return normalized
  }

  /** HMAC-SHA256 of the code keyed by AUTH_OTP_PEPPER, scoped to the email. */
  private hashCode(email: string, code: string): string {
    const pepper = (process.env.AUTH_OTP_PEPPER ?? '').trim()
    if (!pepper) {
      throw new Error('AUTH_OTP_PEPPER is not configured')
    }
    return createHmac('sha256', pepper).update(`${email}:${code}`).digest('hex')
  }

  private generateCode(): string {
    // Cryptographically-strong, zero-padded 6-digit code.
    return randomInt(0, 1_000_000).toString().padStart(OTP_CODE_LENGTH, '0')
  }

  /**
   * Request a sign-in code. ALWAYS resolves the same way (no email
   * enumeration). The controller responds `{ ok: true }` regardless.
   */
  async requestCode(rawEmail: string): Promise<void> {
    const email = this.normalizeEmail(rawEmail)
    const now = new Date()

    const code = this.generateCode()
    const codeHash = this.hashCode(email, code)
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000)

    // Per-email hourly cap, enforced ATOMICALLY. The previous count()+create()
    // had a check-then-act race: N concurrent requests could each read a
    // sub-cap count and all insert, blowing past the cap (email bombing). We
    // now invalidate prior unconsumed codes and conditionally insert the new
    // one in a single guarded statement, so the cap holds under concurrency.
    const inserted = await this.insertCodeIfUnderCap(email, codeHash, expiresAt, now)
    if (!inserted) {
      // Cap reached — silently stop. Same outward response, no leak of volume.
      this.logger.warn('OTP request cap reached for email hash')
      return
    }

    // Localize off any existing user's preference; default locale otherwise.
    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { preferredLanguage: true },
    })
    const locale = resolveLocale(existing?.preferredLanguage, 'en')

    const { subject, html, text } = buildOtpCodeEmail({
      locale,
      code,
      expiresInMinutes: OTP_TTL_MINUTES,
    })

    const sent = await sendEmail({ to: email, subject, html, text })
    if (!sent) {
      if (process.env.NODE_ENV === 'production') {
        // A Resend outage silently blocks every sign-in. Make it visible
        // (error log + Sentry) without leaking whether the email exists —
        // the controller still returns ok:true regardless.
        this.logger.error('OTP email failed to send (Resend unavailable)')
        try {
          const Sentry = require('@sentry/node')
          Sentry.captureMessage('OTP email failed to send (Resend unavailable)', 'error')
        } catch {
          // Sentry not available — no-op.
        }
      } else {
        // Dev convenience only — never in production logs.
        this.logger.debug(`OTP email not sent (Resend unconfigured); code=${code}`)
      }
    }
  }

  /**
   * Verify a code and issue a session JWT. Throws 400/401 on
   * invalid/expired/too-many-attempts. Marks the code consumed on success.
   */
  async verifyCode(rawEmail: string, rawCode: unknown): Promise<VerifyResult> {
    const email = this.normalizeEmail(rawEmail)
    if (typeof rawCode !== 'string' || !/^\d{6}$/.test(rawCode.trim())) {
      throw new BadRequestException('A 6-digit code is required')
    }
    const code = rawCode.trim()
    const now = new Date()

    // Per-email brute-force cap: sum failed attempts across all codes issued
    // to this email in the last hour. Each wrong guess bumps `attempts` on the
    // active code; aggregating across codes stops an attacker from resetting
    // the counter by requesting a fresh code. Mirrors requestCode's hourly cap.
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const failureAgg = await this.prisma.otpCode.aggregate({
      where: { email, createdAt: { gte: oneHourAgo } },
      _sum: { attempts: true },
    })
    if ((failureAgg._sum.attempts ?? 0) >= OTP_MAX_VERIFY_FAILURES_PER_HOUR) {
      throw new UnauthorizedException(
        'Too many attempts. Please try again later.',
      )
    }

    // Latest unconsumed code for this email.
    const record = await this.prisma.otpCode.findFirst({
      where: { email, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    })

    if (!record) {
      throw new UnauthorizedException('Invalid or expired code')
    }

    if (record.expiresAt <= now) {
      await this.prisma.otpCode.update({
        where: { id: record.id },
        data: { consumedAt: now },
      })
      throw new UnauthorizedException('Invalid or expired code')
    }

    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await this.prisma.otpCode.update({
        where: { id: record.id },
        data: { consumedAt: now },
      })
      throw new UnauthorizedException('Too many attempts. Request a new code.')
    }

    const expectedHash = this.hashCode(email, code)
    const expectedBuf = Buffer.from(expectedHash, 'hex')
    const actualBuf = Buffer.from(record.codeHash, 'hex')
    const matches =
      expectedBuf.length === actualBuf.length &&
      timingSafeEqual(expectedBuf, actualBuf)

    if (!matches) {
      const attempts = record.attempts + 1
      await this.prisma.otpCode.update({
        where: { id: record.id },
        data: {
          attempts,
          // Burn the code once the cap is hit.
          consumedAt: attempts >= OTP_MAX_ATTEMPTS ? now : null,
        },
      })
      throw new UnauthorizedException('Invalid or expired code')
    }

    // Success — single-use: consume the code.
    await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: now },
    })

    const user = await this.findOrCreateUser(email)
    const token = signSessionToken(user.id)
    return {
      token,
      user: {
        id: user.id,
        clerkId: user.clerkId,
        email: user.email,
        name: user.name,
      },
    }
  }

  /**
   * Atomically invalidate prior unconsumed codes for `email` and insert a new
   * code ONLY if the per-email hourly cap has not been reached. Returns true if
   * a row was inserted, false if the cap blocked it.
   *
   * The insert is a single guarded statement —
   *   INSERT ... SELECT ... WHERE (SELECT count(*) ... within the last hour) < cap
   * — so the count and the insert evaluate atomically against the same snapshot.
   * Two concurrent requests can't both pass a stale sub-cap count: at most
   * `cap` rows can ever exist in the window. The invalidation runs first in the
   * same interactive transaction so the active-code set stays consistent.
   */
  private async insertCodeIfUnderCap(
    email: string,
    codeHash: string,
    expiresAt: Date,
    now: Date,
  ): Promise<boolean> {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const id = randomUUID()
    return this.prisma.$transaction(async (tx) => {
      await tx.otpCode.updateMany({
        where: { email, consumedAt: null },
        data: { consumedAt: now },
      })
      // cuid()-shaped ids are generated app-side here since the raw INSERT
      // bypasses Prisma's @default(cuid()). A UUID is a valid String id.
      const insertedRows = await tx.$executeRaw`
        INSERT INTO "OtpCode" ("id", "email", "codeHash", "expiresAt", "attempts", "createdAt")
        SELECT ${id}, ${email}, ${codeHash}, ${expiresAt}, 0, ${now}
        WHERE (
          SELECT COUNT(*) FROM "OtpCode"
          WHERE "email" = ${email} AND "createdAt" >= ${oneHourAgo}
        ) < ${OTP_MAX_REQUESTS_PER_HOUR}
      `
      return insertedRows > 0
    })
  }

  /** Find a (non-deleted) user by email, or JIT-create with a placeholder name. */
  private async findOrCreateUser(email: string): Promise<AuthenticatedUserShape> {
    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    })
    if (existing) {
      return existing
    }

    try {
      return await this.prisma.user.create({
        data: {
          email,
          name: email.split('@')[0] || 'Player',
          // DOB null — age-gate guard forces DOB entry before club access.
        },
      })
    } catch (error) {
      // Lost a create race — re-read.
      const raced = await this.prisma.user.findFirst({
        where: { email, deletedAt: null },
      })
      if (raced) {
        return raced
      }
      throw error
    }
  }
}
