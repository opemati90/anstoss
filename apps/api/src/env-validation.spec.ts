import {
  collectProductionEnvErrors,
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
  } as NodeJS.ProcessEnv
}

describe('collectProductionEnvErrors', () => {
  it('passes with a fully-configured strong env', () => {
    expect(collectProductionEnvErrors(validEnv())).toEqual([])
  })

  it('flags a missing AUTH_JWT_SECRET', () => {
    const env = validEnv()
    delete env.AUTH_JWT_SECRET
    expect(collectProductionEnvErrors(env)).toContain(
      'AUTH_JWT_SECRET is required in production',
    )
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
    expect(errors).toContain(
      'AUTH_JWT_SECRET must be at least 32 characters in production',
    )
    expect(errors).toContain(
      'AUTH_OTP_PEPPER must be at least 32 characters in production',
    )
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
})
