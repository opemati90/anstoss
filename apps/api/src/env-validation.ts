/**
 * Boot-time production env/secret validation.
 *
 * A missing or weak AUTH_JWT_SECRET means silent session-token forgery; a
 * missing Resend config means OTP emails never send. We assert these BEFORE
 * the server listens so a misconfigured deploy fails fast (red) instead of
 * booting green with broken/forgeable auth. Mirrors RateLimitGuard's
 * "throw in production for missing UPSTASH_*" pattern.
 */
export const WEAK_JWT_PLACEHOLDER = 'change-me-long-random-secret'
export const WEAK_OTP_PLACEHOLDER = 'change-me-long-random-pepper'

/** Collect all validation errors (empty array = config OK). */
export function collectProductionEnvErrors(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const errors: string[] = []

  const checkSecret = (name: string, placeholder: string) => {
    const value = (env[name] ?? '').trim()
    if (!value) {
      errors.push(`${name} is required in production`)
    } else if (value.length < 32) {
      errors.push(`${name} must be at least 32 characters in production`)
    } else if (value === placeholder) {
      errors.push(
        `${name} is set to the example placeholder — generate a real secret (openssl rand -hex 32)`,
      )
    }
  }

  checkSecret('AUTH_JWT_SECRET', WEAK_JWT_PLACEHOLDER)
  checkSecret('AUTH_OTP_PEPPER', WEAK_OTP_PLACEHOLDER)

  for (const name of ['RESEND_API_KEY', 'RESEND_FROM_EMAIL']) {
    if (!(env[name] ?? '').trim()) {
      errors.push(`${name} is required in production`)
    }
  }

  return errors
}

/**
 * Exit the process with a clear message if production env validation fails.
 * No-op for the empty/OK case.
 */
export function assertProductionSecrets(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const errors = collectProductionEnvErrors(env)
  if (errors.length > 0) {
    console.error(
      '[FATAL] Refusing to start: production environment validation failed:\n  - ' +
        errors.join('\n  - '),
    )
    process.exit(1)
  }
}
