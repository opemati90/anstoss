import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appleBillingCredentials, googleBillingCredentials, ANSTOSS_GOOGLE_BILLING_EMAIL } from './store-billing.credentials'
import { StoreBillingProvider } from './store-billing.provider'

describe('Anstoss billing credential isolation', () => {
  const folder = mkdtempSync(join(tmpdir(), 'anstoss-credential-test-'))
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const google = { type: 'service_account', project_id: 'anstoss-b268f', client_email: ANSTOSS_GOOGLE_BILLING_EMAIL, private_key: rsa, token_uri: 'https://oauth2.googleapis.com/token' }
  const encoded = (value: string) => Buffer.from(value).toString('base64')
  const root = readFileSync(join(__dirname, 'fixtures/apple-root-g3.cer'))
  const appleEnv = { ANSTOSS_IAP_APPLE_KEY_ID: 'TESTKEY123', ANSTOSS_IAP_APPLE_ISSUER_ID: '00000000-0000-4000-8000-000000000001', ANSTOSS_IAP_APPLE_KEY_BASE64: encoded(ec), ANSTOSS_IAP_APPLE_ROOTS_BASE64: root.toString('base64') }
  const googleEnv = { ANSTOSS_IAP_GOOGLE_KEY_BASE64: encoded(JSON.stringify(google)) }
  const saved = { ...process.env }
  afterEach(() => { process.env = { ...saved } })
  afterAll(() => rmSync(folder, { recursive: true, force: true }))

  it('loads Apple keys and certificates from protected environment variables', () => {
    expect(appleBillingCredentials(appleEnv)).toEqual({ keyId: 'TESTKEY123', issuerId: appleEnv.ANSTOSS_IAP_APPLE_ISSUER_ID, privateKey: ec, roots: [root] })
  })
  it('loads both stores from local files without changing the private material', () => {
    writeFileSync(join(folder, 'key.p8'), ec, { mode: 0o600 })
    writeFileSync(join(folder, 'google.json'), JSON.stringify(google), { mode: 0o600 })
    expect(appleBillingCredentials({ ...appleEnv, ANSTOSS_IAP_APPLE_KEY_BASE64: undefined, ANSTOSS_IAP_APPLE_KEY_FILE: join(folder, 'key.p8'), ANSTOSS_IAP_APPLE_ROOTS_BASE64: undefined, ANSTOSS_IAP_APPLE_ROOT_FILES: join(__dirname, 'fixtures/apple-root-g3.cer') }).privateKey).toBe(ec)
    expect(googleBillingCredentials({ ANSTOSS_IAP_GOOGLE_KEY_FILE: join(folder, 'google.json') }).client_email).toBe(ANSTOSS_GOOGLE_BILLING_EMAIL)
  })
  it('uses only the expected Google identity and private key fields', () => {
    expect(googleBillingCredentials(googleEnv)).toEqual({ client_email: ANSTOSS_GOOGLE_BILLING_EMAIL, private_key: rsa })
  })
  it.each([
    { project_id: 'renuir-app' }, { client_email: 'renuir-play-verifier@renuir-app.iam.gserviceaccount.com' },
    { client_email: 'firebase-adminsdk@anstoss-b268f.iam.gserviceaccount.com' },
    { type: 'authorized_user' }, { token_uri: 'https://example.invalid/token' }, { private_key: ec }, { private_key: 'PRIVATE-SENTINEL' },
  ])('rejects foreign, broad or invalid Google credentials', (override) => {
    expect(() => googleBillingCredentials({ ANSTOSS_IAP_GOOGLE_KEY_BASE64: encoded(JSON.stringify({ ...google, ...override })) })).toThrow('Anstoss store credentials are missing or invalid')
  })
  it.each([
    { ANSTOSS_IAP_APPLE_KEY_ID: 'bad' }, { ANSTOSS_IAP_APPLE_ISSUER_ID: 'bad' },
    { ANSTOSS_IAP_APPLE_KEY_BASE64: encoded(rsa) }, { ANSTOSS_IAP_APPLE_KEY_BASE64: 'invalid!' },
    { ANSTOSS_IAP_APPLE_ROOTS_BASE64: encoded('not a certificate') }, { ANSTOSS_IAP_APPLE_ROOTS_BASE64: '' },
    { ANSTOSS_IAP_APPLE_KEY_FILE: '/must-not-be-read.p8' }, { ANSTOSS_IAP_APPLE_ROOT_FILES: '/must-not-be-read.cer' },
  ])('fails closed for invalid or ambiguous Apple configuration', (override) => {
    expect(() => appleBillingCredentials({ ...appleEnv, ...override })).toThrow('Anstoss store credentials are missing or invalid')
  })
  it('rejects Google fallback and ambiguous sources without exposing file names or key material', () => {
    for (const env of [{}, { ANSTOSS_IAP_GOOGLE_KEY_FILE: '/private/PRIVATE-SENTINEL.json' }, { ...googleEnv, ANSTOSS_IAP_GOOGLE_KEY_FILE: '/PRIVATE-SENTINEL.json' }, { ANSTOSS_IAP_GOOGLE_KEY_BASE64: encoded('PRIVATE-SENTINEL') }]) {
      try { googleBillingCredentials(env); throw new Error('unexpected success') }
      catch (error) { expect((error as Error).message).toBe('Anstoss store credentials are missing or invalid') }
    }
  })
  it('keeps both providers off until explicitly enabled and requires a valid encryption key', () => {
    process.env = { ...appleEnv, ...googleEnv, ANSTOSS_IAP_ENCRYPTION_KEY: 'ab'.repeat(32) }
    const provider = new StoreBillingProvider()
    expect(provider.configured('APPLE')).toBe(false)
    expect(provider.configured('GOOGLE')).toBe(false)
    process.env.ANSTOSS_IAP_ENABLED = 'true'
    expect(provider.configured('APPLE')).toBe(true)
    expect(provider.configured('GOOGLE')).toBe(true)
    process.env.ANSTOSS_IAP_ENCRYPTION_KEY = 'bad'
    expect(provider.configured('APPLE')).toBe(false)
    expect(provider.configured('GOOGLE')).toBe(false)
  })
})
