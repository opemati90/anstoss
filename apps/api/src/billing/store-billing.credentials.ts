import { readFileSync } from 'node:fs'
import { createPrivateKey, X509Certificate } from 'node:crypto'

type Environment = NodeJS.ProcessEnv
export const ANSTOSS_GOOGLE_PROJECT = 'anstoss-b268f'
export const ANSTOSS_GOOGLE_BILLING_EMAIL = 'anstoss-billing@anstoss-b268f.iam.gserviceaccount.com'

export class InvalidStoreCredentialsException extends Error {
  constructor() { super('Anstoss store credentials are missing or invalid') }
}

function decoded(value: string): Buffer {
  if (!value || value.length > 65536 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new InvalidStoreCredentialsException()
  const result = Buffer.from(value, 'base64')
  if (result.toString('base64') !== value) throw new InvalidStoreCredentialsException()
  return result
}

function source(env: Environment, file: string, encoded: string): Buffer {
  if (Boolean(env[file]) === Boolean(env[encoded])) throw new InvalidStoreCredentialsException()
  const value = env[encoded] ? decoded(env[encoded]!) : readFileSync(env[file]!)
  if (!value.length || value.length > 65536) throw new InvalidStoreCredentialsException()
  return value
}

/** Never fall back to ambient Google credentials or another project's account. */
export function googleBillingCredentials(env: Environment = process.env) {
  try {
    const value = JSON.parse(source(env, 'ANSTOSS_IAP_GOOGLE_KEY_FILE', 'ANSTOSS_IAP_GOOGLE_KEY_BASE64').toString('utf8'))
    if (value.type !== 'service_account' || value.project_id !== ANSTOSS_GOOGLE_PROJECT ||
        value.client_email !== ANSTOSS_GOOGLE_BILLING_EMAIL ||
        value.token_uri !== 'https://oauth2.googleapis.com/token' ||
        typeof value.private_key !== 'string' || createPrivateKey(value.private_key).asymmetricKeyType !== 'rsa') {
      throw new InvalidStoreCredentialsException()
    }
    return { client_email: value.client_email as string, private_key: value.private_key as string }
  } catch { throw new InvalidStoreCredentialsException() }
}

/** Supports local files or Railway secret variables, never both at once. */
export function appleBillingCredentials(env: Environment = process.env) {
  try {
    const keyId = env.ANSTOSS_IAP_APPLE_KEY_ID ?? ''
    const issuerId = env.ANSTOSS_IAP_APPLE_ISSUER_ID ?? ''
    if (!/^[A-Z0-9]{10}$/.test(keyId) || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(issuerId)) {
      throw new InvalidStoreCredentialsException()
    }
    const privateKey = source(env, 'ANSTOSS_IAP_APPLE_KEY_FILE', 'ANSTOSS_IAP_APPLE_KEY_BASE64').toString('utf8')
    const key = createPrivateKey(privateKey)
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new InvalidStoreCredentialsException()
    const files = env.ANSTOSS_IAP_APPLE_ROOT_FILES
    const encoded = env.ANSTOSS_IAP_APPLE_ROOTS_BASE64
    if (Boolean(files) === Boolean(encoded)) throw new InvalidStoreCredentialsException()
    const roots = encoded ? encoded.split(',').map(decoded) : files!.split(',').map(p => readFileSync(p.trim()))
    if (!roots.length || roots.length > 3) throw new InvalidStoreCredentialsException()
    for (const root of roots) {
      const cert = new X509Certificate(root)
      if (!cert.ca || !cert.verify(cert.publicKey) || new Date(cert.validFrom) > new Date() || new Date(cert.validTo) < new Date()) throw new InvalidStoreCredentialsException()
    }
    return { keyId, issuerId, privateKey, roots }
  } catch { throw new InvalidStoreCredentialsException() }
}
