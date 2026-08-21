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
export function collectProductionEnvErrors(env: NodeJS.ProcessEnv = process.env): string[] {
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

  const requireValue = (name: string) => {
    if (!(env[name] ?? '').trim()) {
      errors.push(`${name} is required in production`)
    }
  }

  for (const name of [
    'REDIS_URL',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_BASE_URL',
  ]) {
    requireValue(name)
  }

  const fingerprints = (env.ANDROID_CERT_FINGERPRINTS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (fingerprints.length > 0) {
    const sha256FingerprintPattern = /^([A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/
    for (const fingerprint of fingerprints) {
      if (!sha256FingerprintPattern.test(fingerprint)) {
        errors.push(
          'ANDROID_CERT_FINGERPRINTS must contain comma-separated SHA-256 certificate fingerprints',
        )
        break
      }
    }
  }

  return errors
}

/**
 * Collect non-fatal production config warnings. These are for features that
 * degrade gracefully when unset (the app still boots and serves), so we warn
 * loudly rather than refuse to start.
 */
export function collectProductionEnvWarnings(env: NodeJS.ProcessEnv = process.env): string[] {
  const warnings: string[] = []

  // Chat/DM auto-translation no-ops silently when LIBRETRANSLATE_URL is unset
  // (translation.service returns null, chat still works). Surface it so a
  // missing translation backend is diagnosable instead of mysteriously absent.
  if (!(env.LIBRETRANSLATE_URL ?? '').trim()) {
    warnings.push(
      'LIBRETRANSLATE_URL is not set — chat/DM message auto-translation is disabled (messages show in their original language only)',
    )
  }

  const adminApiKey = (env.ADMIN_API_KEY ?? '').trim()
  if (!adminApiKey) {
    warnings.push(
      'ADMIN_API_KEY is not set — the static internal admin console cannot authenticate with X-Admin-Key',
    )
  } else if (adminApiKey.length < 32) {
    warnings.push('ADMIN_API_KEY should be at least 32 characters')
  }

  return warnings
}

/**
 * Exit the process with a clear message if production env validation fails.
 * No-op for the empty/OK case.
 */
export function assertProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const errors = collectProductionEnvErrors(env)
  if (errors.length > 0) {
    console.error(
      '[FATAL] Refusing to start: production environment validation failed:\n  - ' +
        errors.join('\n  - '),
    )
    process.exit(1)
  }
}
