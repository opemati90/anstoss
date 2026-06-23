import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import {
  OtpService,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_REQUESTS_PER_HOUR,
  OTP_MAX_VERIFY_FAILURES_PER_HOUR,
} from './otp.service'
import { verifySessionToken } from './jwt.util'
import * as mailer from '../../email/mailer'

jest.mock('../../email/mailer', () => ({
  sendEmail: jest.fn(async () => true),
}))

const sendEmailMock = mailer.sendEmail as jest.Mock

interface OtpRow {
  id: string
  email: string
  codeHash: string
  expiresAt: Date
  attempts: number
  consumedAt: Date | null
  createdAt: Date
}

interface UserRow {
  id: string
  clerkId: string | null
  email: string | null
  name: string
  preferredLanguage: string | null
  deletedAt: Date | null
}

/** Minimal in-memory Prisma double covering the surface OtpService touches. */
function makePrisma() {
  const otp: OtpRow[] = []
  const users: UserRow[] = []
  let seq = 0
  const nextId = () => `id_${++seq}`

  const otpCode = {
    count: async ({ where }: any) => {
      return otp.filter(
        (r) =>
          r.email === where.email &&
          (!where.createdAt?.gte || r.createdAt >= where.createdAt.gte),
      ).length
    },
    create: async ({ data }: any) => {
      const row: OtpRow = {
        id: nextId(),
        attempts: 0,
        consumedAt: null,
        createdAt: new Date(),
        ...data,
      }
      otp.push(row)
      return row
    },
    updateMany: async ({ where, data }: any) => {
      let n = 0
      for (const r of otp) {
        if (
          r.email === where.email &&
          (where.consumedAt === null ? r.consumedAt === null : true)
        ) {
          Object.assign(r, data)
          n++
        }
      }
      return { count: n }
    },
    update: async ({ where, data }: any) => {
      const r = otp.find((x) => x.id === where.id)!
      Object.assign(r, data)
      return r
    },
    aggregate: async ({ where, _sum }: any) => {
      const rows = otp.filter(
        (r) =>
          r.email === where.email &&
          (!where.createdAt?.gte || r.createdAt >= where.createdAt.gte),
      )
      const result: any = { _sum: {} }
      if (_sum?.attempts) {
        result._sum.attempts = rows.reduce((acc, r) => acc + (r.attempts ?? 0), 0)
      }
      return result
    },
    findFirst: async ({ where, orderBy }: any) => {
      let rows = otp.filter(
        (r) =>
          r.email === where.email &&
          (where.consumedAt === null ? r.consumedAt === null : true),
      )
      if (orderBy?.createdAt === 'desc') {
        rows = rows.sort((a, b) => +b.createdAt - +a.createdAt)
      }
      return rows[0] ?? null
    },
  }

  const user = {
    findFirst: async ({ where, select }: any) => {
      const u = users.find(
        (x) =>
          x.email === where.email &&
          (where.deletedAt === null ? x.deletedAt === null : true),
      )
      if (!u) return null
      if (select?.preferredLanguage)
        return { preferredLanguage: u.preferredLanguage }
      return u
    },
    create: async ({ data }: any) => {
      const u: UserRow = {
        id: nextId(),
        clerkId: null,
        preferredLanguage: null,
        deletedAt: null,
        ...data,
      }
      users.push(u)
      return u
    },
  }

  // Emulates the atomic guarded INSERT used by insertCodeIfUnderCap. Reads the
  // template-literal values $executeRaw receives and applies the same
  // count-then-insert-if-under-cap semantics against the in-memory rows.
  const $executeRaw = async (_strings: TemplateStringsArray, ...values: any[]) => {
    const [id, email, codeHash, expiresAt, createdAt, capEmail, oneHourAgo, cap] =
      values
    const windowCount = otp.filter(
      (r) => r.email === capEmail && r.createdAt >= oneHourAgo,
    ).length
    if (windowCount >= cap) return 0
    otp.push({
      id,
      email,
      codeHash,
      expiresAt,
      attempts: 0,
      consumedAt: null,
      createdAt,
    })
    return 1
  }

  const base = {
    otpCode: { ...otpCode, $executeRaw },
    user,
    _otp: otp,
    _users: users,
  }

  return {
    ...base,
    // Supports BOTH the array form ($transaction([...])) used elsewhere and the
    // interactive callback form ($transaction(async (tx) => …)) used by the
    // atomic request-cap insert. The tx handle reuses the same in-memory store.
    $transaction: async (arg: any) =>
      typeof arg === 'function'
        ? arg({ otpCode: { ...otpCode, $executeRaw }, user, $executeRaw })
        : Promise.all(arg),
  }
}

describe('OtpService', () => {
  let prisma: ReturnType<typeof makePrisma>
  let service: OtpService

  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = 'svc-jwt-secret'
    process.env.AUTH_OTP_PEPPER = 'svc-otp-pepper'
    process.env.NODE_ENV = 'test'
    sendEmailMock.mockClear()
    prisma = makePrisma()
    service = new OtpService(prisma as any)
  })

  /** Extract the plaintext 6-digit code from the most recent sent email. */
  function lastSentCode(): string {
    const call = sendEmailMock.mock.calls.at(-1)![0]
    const m = /\b(\d{6})\b/.exec(call.text)
    return m![1]
  }

  it('requestCode stores a HASHED code (never plaintext) and emails it', async () => {
    await service.requestCode('User@Example.com')
    expect(prisma._otp).toHaveLength(1)
    const row = prisma._otp[0]
    expect(row.email).toBe('user@example.com') // normalized
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/) // hex HMAC, not plaintext
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const code = lastSentCode()
    expect(row.codeHash).not.toContain(code)
  })

  it('verifyCode success issues a JWT and finds/creates the user', async () => {
    await service.requestCode('new@example.com')
    const code = lastSentCode()
    const result = await service.verifyCode('new@example.com', code)
    expect(result.user.email).toBe('new@example.com')
    expect(result.user.name).toBe('new') // placeholder from local-part
    const claims = verifySessionToken(result.token)
    expect(claims.sub).toBe(result.user.id)
    // single-use: code consumed
    expect(prisma._otp[0].consumedAt).not.toBeNull()
  })

  it('verifyCode reuses an existing user (case-insensitive email)', async () => {
    prisma._users.push({
      id: 'existing_1',
      clerkId: 'clerk_x',
      email: 'me@example.com',
      name: 'Existing',
      preferredLanguage: 'de',
      deletedAt: null,
    })
    await service.requestCode('ME@example.com')
    const code = lastSentCode()
    const result = await service.verifyCode('me@example.com', code)
    expect(result.user.id).toBe('existing_1')
    expect(prisma._users).toHaveLength(1)
  })

  it('rejects an expired code', async () => {
    await service.requestCode('exp@example.com')
    const code = lastSentCode()
    prisma._otp[0].expiresAt = new Date(Date.now() - 1000)
    await expect(service.verifyCode('exp@example.com', code)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('rejects a wrong code and increments attempts', async () => {
    await service.requestCode('wrong@example.com')
    await expect(
      service.verifyCode('wrong@example.com', '000000'),
    ).rejects.toThrow(UnauthorizedException)
    expect(prisma._otp[0].attempts).toBe(1)
    expect(prisma._otp[0].consumedAt).toBeNull()
  })

  it('invalidates the code after too many attempts', async () => {
    await service.requestCode('brute@example.com')
    const realCode = lastSentCode()
    const bad = realCode === '000000' ? '111111' : '000000'
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await expect(
        service.verifyCode('brute@example.com', bad),
      ).rejects.toThrow()
    }
    // burned — even the correct code now fails
    expect(prisma._otp[0].consumedAt).not.toBeNull()
    await expect(
      service.verifyCode('brute@example.com', realCode),
    ).rejects.toThrow(UnauthorizedException)
  })

  it('does not enumerate emails: request resolves the same regardless', async () => {
    // Unknown email — no user row, still no throw, still emails.
    await expect(service.requestCode('ghost@example.com')).resolves.toBeUndefined()
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
  })

  it('invalidates older unconsumed codes when a new one is requested', async () => {
    await service.requestCode('rotate@example.com')
    const firstCode = lastSentCode()
    await service.requestCode('rotate@example.com')
    expect(prisma._otp[0].consumedAt).not.toBeNull() // first burned
    await expect(
      service.verifyCode('rotate@example.com', firstCode),
    ).rejects.toThrow(UnauthorizedException)
  })

  it('caps requests per email per hour', async () => {
    for (let i = 0; i < OTP_MAX_REQUESTS_PER_HOUR; i++) {
      await service.requestCode('cap@example.com')
    }
    sendEmailMock.mockClear()
    await service.requestCode('cap@example.com')
    expect(sendEmailMock).not.toHaveBeenCalled() // silently dropped
  })

  it('caps concurrent over-cap requests atomically (no email bombing)', async () => {
    // Fire many requests for the same email in the same tick. The guarded
    // INSERT must let at most OTP_MAX_REQUESTS_PER_HOUR rows through even when
    // the count() and insert can't be assumed to run sequentially per request.
    const BURST = OTP_MAX_REQUESTS_PER_HOUR + 8
    await Promise.all(
      Array.from({ length: BURST }, () => service.requestCode('burst@example.com')),
    )
    const rows = prisma._otp.filter((r) => r.email === 'burst@example.com')
    expect(rows.length).toBe(OTP_MAX_REQUESTS_PER_HOUR)
    // Over-cap requests resolve cleanly (no throw) — response shape invariant.
    await expect(service.requestCode('burst@example.com')).resolves.toBeUndefined()
    expect(
      prisma._otp.filter((r) => r.email === 'burst@example.com').length,
    ).toBe(OTP_MAX_REQUESTS_PER_HOUR)
  })

  it('caps failed verify attempts per email per hour across codes', async () => {
    // Seed enough accumulated failed attempts (across past codes) to hit the
    // per-email cap, then prove the very next verify is rejected as rate-limited
    // — even with a freshly-requested, otherwise-valid code.
    await service.requestCode('flood@example.com')
    prisma._otp[0].attempts = OTP_MAX_VERIFY_FAILURES_PER_HOUR
    prisma._otp[0].consumedAt = new Date() // old code burned

    await service.requestCode('flood@example.com')
    const freshCode = lastSentCode()

    await expect(
      service.verifyCode('flood@example.com', freshCode),
    ).rejects.toThrow('Too many attempts. Please try again later.')
    // The fresh code was never even checked (still unconsumed, 0 attempts).
    const fresh = prisma._otp.find((r) => r.consumedAt === null)!
    expect(fresh.attempts).toBe(0)
  })

  it('rejects an invalid email shape', async () => {
    await expect(service.requestCode('not-an-email')).rejects.toThrow(
      BadRequestException,
    )
  })

  it('rejects a non-6-digit code at verify', async () => {
    await service.requestCode('shape@example.com')
    await expect(
      service.verifyCode('shape@example.com', 'abc'),
    ).rejects.toThrow(BadRequestException)
  })
})
