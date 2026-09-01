import {
  collectProductionEnvErrors,
  collectProductionEnvWarnings,
  WEAK_JWT_PLACEHOLDER,
  WEAK_OTP_PLACEHOLDER,
} from './env-validation'

const STRONG = 'a'.repeat(40)

function validEnv(): NodeJS.ProcessEnv {
  return {
    AUTH_JWT_SECRET: STRONG,
    AUTH_OTP_PEPPER: 'b'.repeat(40),
    RESEND_API_KEY: 're_abc',
    RESEND_FROM_EMAIL: 'noreply@anstoss.app',
    REDIS_URL: 'rediss://example.invalid:6379',
    R2_ACCOUNT_ID: 'r2-account',
    R2_ACCESS_KEY_ID: 'r2-access',
    R2_SECRET_ACCESS_KEY: 'r2-secret',
    R2_BUCKET_NAME: 'anstoss-assets',
    R2_PUBLIC_BASE_URL: 'https://assets.anstoss.io',
    ADMIN_CONSOLE_USERNAME: 'admin',
    ADMIN_CONSOLE_PASSWORD_HASH:
      'scrypt$0123456789abcdef0123456789abcdef$f6d75a2d38087f4be92c8f237291f0bf005bef1d89f4f190bcfc34a3f860eeed0d82e0bdb34bcd0f39661c03ce2913091b52eb9a46803b82ca2d198f76f6e5f4',
    ANDROID_CERT_FINGERPRINTS:
      'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
  } as NodeJS.ProcessEnv
}

describe('collectProductionEnvErrors', () => {
  it('passes with a fully-configured strong env', () => {
    expect(collectProductionEnvErrors(validEnv())).toEqual([])
  })

  it('flags a missing AUTH_JWT_SECRET', () => {
    const env = validEnv()
    delete env.AUTH_JWT_SECRET
    expect(collectProductionEnvErrors(env)).toContain('AUTH_JWT_SECRET is required in production')
  })

  it('flags a too-short secret (<32 chars)', () => {
    const env = validEnv()
    env.AUTH_JWT_SECRET = 'short'
    expect(collectProductionEnvErrors(env)).toContain(
      'AUTH_JWT_SECRET must be at least 32 characters in production',
    )
  })

  it('rejects the short example placeholder secrets (caught by length)', () => {
    const env = validEnv()
    env.AUTH_JWT_SECRET = WEAK_JWT_PLACEHOLDER
    env.AUTH_OTP_PEPPER = WEAK_OTP_PLACEHOLDER
    const errors = collectProductionEnvErrors(env)
    // The shipped placeholders are <32 chars, so the length guard fires first.
    expect(errors).toContain('AUTH_JWT_SECRET must be at least 32 characters in production')
    expect(errors).toContain('AUTH_OTP_PEPPER must be at least 32 characters in production')
  })

  it('accepts a long, non-placeholder secret', () => {
    const env = validEnv()
    env.AUTH_JWT_SECRET = WEAK_JWT_PLACEHOLDER + WEAK_JWT_PLACEHOLDER // >=32, not the literal placeholder
    expect(collectProductionEnvErrors(env)).toEqual([])
  })

  it('flags missing Resend config', () => {
    const env = validEnv()
    delete env.RESEND_API_KEY
    delete env.RESEND_FROM_EMAIL
    const errors = collectProductionEnvErrors(env)
    expect(errors).toContain('RESEND_API_KEY is required in production')
    expect(errors).toContain('RESEND_FROM_EMAIL is required in production')
  })

  it('requires R2 config so production media uploads and deletion cleanup work', () => {
    const env = validEnv()
    delete env.R2_ACCOUNT_ID
    delete env.R2_ACCESS_KEY_ID
    delete env.R2_SECRET_ACCESS_KEY
    delete env.R2_BUCKET_NAME
    delete env.R2_PUBLIC_BASE_URL

    const errors = collectProductionEnvErrors(env)

    expect(errors).toEqual(
      expect.arrayContaining([
        'R2_ACCOUNT_ID is required in production',
        'R2_ACCESS_KEY_ID is required in production',
        'R2_SECRET_ACCESS_KEY is required in production',
        'R2_BUCKET_NAME is required in production',
        'R2_PUBLIC_BASE_URL is required in production',
      ]),
    )
  })

  it('validates Android app-link fingerprints when configured', () => {
    const env = validEnv()
    env.ANDROID_CERT_FINGERPRINTS = 'not-a-fingerprint'

    expect(collectProductionEnvErrors(env)).toContain(
      'ANDROID_CERT_FINGERPRINTS must contain comma-separated SHA-256 certificate fingerprints',
    )

    delete env.ANDROID_CERT_FINGERPRINTS
    expect(collectProductionEnvErrors(env)).toEqual([])
  })

  it('requires a hashed admin console credential in production', () => {
    const env = validEnv()
    delete env.ADMIN_CONSOLE_PASSWORD_HASH
    env.ADMIN_CONSOLE_PASSWORD = 'plaintext'

    expect(collectProductionEnvErrors(env)).toEqual(
      expect.arrayContaining([
        'ADMIN_CONSOLE_PASSWORD_HASH is required in production',
        'ADMIN_CONSOLE_PASSWORD is not allowed in production; use ADMIN_CONSOLE_PASSWORD_HASH',
      ]),
    )
  })
})

describe('collectProductionEnvWarnings', () => {
  it('warns when the static admin console key is missing or weak', () => {
    const missing = collectProductionEnvWarnings(validEnv())
    expect(missing).toContain(
      'ADMIN_API_KEY is not set — break-glass X-Admin-Key access is unavailable for the admin console',
    )

    const weak = validEnv()
    weak.ADMIN_API_KEY = 'short'
    expect(collectProductionEnvWarnings(weak)).toContain(
      'ADMIN_API_KEY should be at least 32 characters',
    )
  })
})
