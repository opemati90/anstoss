import { createHash, scryptSync, timingSafeEqual } from 'node:crypto'

export const ADMIN_CONSOLE_AUDIENCE = 'admin-console'
export const ADMIN_CONSOLE_SESSION_TTL_SECONDS = 12 * 60 * 60

export type ResolvedAdminConsoleCredentials = {
  username: string
  passwordHash: string
  email: string
  name: string
  version: string
}

export function resolveAdminConsoleCredentials(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedAdminConsoleCredentials | null {
  const username = (env.ADMIN_CONSOLE_USERNAME ?? '').trim().toLowerCase()
  const passwordHash = (env.ADMIN_CONSOLE_PASSWORD_HASH ?? '').trim()

  if (!username || !passwordHash || !isValidScryptPasswordHash(passwordHash)) {
    return null
  }

  const email =
    (env.ADMIN_CONSOLE_EMAIL ?? '').trim().toLowerCase() || `${username}@admin.anstoss.local`
  const name = (env.ADMIN_CONSOLE_NAME ?? 'Anstoss Platform Admin').trim()
  const version = createHash('sha256')
    .update(`${username}:${passwordHash}:${email}`)
    .digest('hex')

  return {
    username,
    passwordHash,
    email,
    name,
    version,
  }
}

export function verifyAdminConsolePassword(
  credentials: ResolvedAdminConsoleCredentials,
  password: string,
): boolean {
  return verifyScryptPassword(credentials.passwordHash, password)
}

export function collectAdminConsoleEnvErrors(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const errors: string[] = []
  const username = (env.ADMIN_CONSOLE_USERNAME ?? '').trim().toLowerCase()
  const passwordHash = (env.ADMIN_CONSOLE_PASSWORD_HASH ?? '').trim()
  const legacyPassword = (env.ADMIN_CONSOLE_PASSWORD ?? '').trim()

  if (!username) {
    errors.push('ADMIN_CONSOLE_USERNAME is required in production')
  }

  if (!passwordHash) {
    errors.push('ADMIN_CONSOLE_PASSWORD_HASH is required in production')
  } else if (!isValidScryptPasswordHash(passwordHash)) {
    errors.push(
      'ADMIN_CONSOLE_PASSWORD_HASH must use scrypt$<hex-salt>$<hex-hash> format with at least a 32-byte derived key',
    )
  }

  if (legacyPassword) {
    errors.push('ADMIN_CONSOLE_PASSWORD is not allowed in production; use ADMIN_CONSOLE_PASSWORD_HASH')
  }

  return errors
}

function isValidScryptPasswordHash(serializedHash: string): boolean {
  const parts = serializedHash.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false
  }

  const [, saltHex, hashHex] = parts
  const salt = safeHexBuffer(saltHex)
  const hash = safeHexBuffer(hashHex)
  return Boolean(salt && hash && salt.length >= 16 && hash.length >= 32)
}

function verifyScryptPassword(serializedHash: string, password: string): boolean {
  const parts = serializedHash.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false
  }

  const [, saltHex, hashHex] = parts
  const salt = safeHexBuffer(saltHex)
  const expectedHash = safeHexBuffer(hashHex)
  if (!salt || !expectedHash || expectedHash.length < 32) {
    return false
  }

  const derived = scryptSync(password, salt, expectedHash.length)
  return (
    derived.length === expectedHash.length && timingSafeEqual(derived, expectedHash)
  )
}

function safeHexBuffer(value: string): Buffer | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null
  return Buffer.from(value, 'hex')
}
