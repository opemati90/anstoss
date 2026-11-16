// Run locally with --env-file and TS_NODE_PROJECT=apps/api/tsconfig.json.
// --live makes bounded, read-only requests for Anstoss only; no purchase writes.
require('ts-node/register/transpile-only')
const { writeFileSync } = require('node:fs')
const { AppStoreServerAPIClient, Environment, SignedDataVerifier } = require('@apple/app-store-server-library')
const { GoogleAuth } = require('google-auth-library')
const { appleBillingCredentials, googleBillingCredentials } = require('../src/billing/store-billing.credentials')
const { StoreBillingProvider } = require('../src/billing/store-billing.provider')
const { ANSTOSS_BUNDLE_ID, ANSTOSS_APPLE_ID } = require('../src/billing/store-purchase')
const { STORE_PRODUCTS } = require('@anstoss/shared')

async function main() {
  const report = { checkedAt: new Date().toISOString(), app: ANSTOSS_BUNDLE_ID, local: {}, live: {} }
  const apple = appleBillingCredentials()
  const google = googleBillingCredentials()
  const provider = new StoreBillingProvider()
  if (process.env.ANSTOSS_IAP_ENABLED !== 'false') throw new Error('Run this check with billing disabled in the supplied env file')
  if (provider.configured('APPLE') || provider.configured('GOOGLE')) throw new Error('Billing off switch failed')
  process.env.ANSTOSS_IAP_ENABLED = 'true' // Only this standalone process; no server or database is started.
  if (!provider.configured('APPLE') || !provider.configured('GOOGLE')) throw new Error('Provider configuration failed')
  const sealed = provider.seal('local-preflight-not-a-purchase-token')
  if (provider.unseal(sealed) !== 'local-preflight-not-a-purchase-token') throw new Error('Token encryption round trip failed')
  process.env.ANSTOSS_IAP_ENABLED = 'false'
  const oldKey = process.env.ANSTOSS_IAP_ENCRYPTION_KEY
  process.env.ANSTOSS_IAP_ENCRYPTION_KEY = '00'.repeat(32)
  let rejected = false
  try { provider.unseal(sealed) } catch { rejected = true }
  process.env.ANSTOSS_IAP_ENCRYPTION_KEY = oldKey
  if (!rejected) throw new Error('Wrong-key decryption was accepted')
  for (const mode of [Environment.SANDBOX, Environment.PRODUCTION]) {
    const verifier = new SignedDataVerifier(apple.roots, false, mode, ANSTOSS_BUNDLE_ID, ANSTOSS_APPLE_ID)
    let rejected = false
    try { await verifier.verifyAndDecodeTransaction('forged.signed.payload') } catch { rejected = true }
    if (!rejected) throw new Error('Unsigned transaction accepted')
  }
  report.local = { credentialsValid: true, billingOffByDefault: true, enabledProviderLoadsBothStores: true, encryptionRoundTrip: true, wrongKeyRejected: true, forgedAppleSignaturesRejected: true }
  if (process.argv.includes('--live')) {
    // Apple's history endpoint is POST-based retrieval; it does not send notifications.
    for (const mode of [Environment.SANDBOX, Environment.PRODUCTION]) {
      try {
        const client = new AppStoreServerAPIClient(apple.privateKey, apple.keyId, apple.issuerId, ANSTOSS_BUNDLE_ID, mode)
        const endDate = Date.now()
        const result = await client.getNotificationHistory(null, { startDate: endDate - 60000, endDate })
        report.live[`apple${mode}`] = { authenticated: true, notificationCount: result.notificationHistory?.length ?? 0 }
      } catch (error) {
        report.live[`apple${mode}`] = { authenticated: false, httpStatus: Number(error.httpStatusCode) || null, apiError: Number(error.apiError) || null }
      }
    }
    try {
      const auth = new GoogleAuth({ credentials: google, scopes: ['https://www.googleapis.com/auth/androidpublisher'] })
      const response = await auth.request({ url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANSTOSS_BUNDLE_ID}/subscriptions?pageSize=100`, method: 'GET', timeout: 15000, retry: false })
      const subscriptions = response.data.subscriptions ?? []
      report.live.google = { authenticated: true, subscriptions: subscriptions.map(s => ({ productId: s.productId, plans: (s.basePlans ?? []).map(p => ({ id: p.basePlanId, state: p.state })) })), missingExpectedProducts: STORE_PRODUCTS.filter(p => !subscriptions.some(s => s.productId === p.id)).map(p => p.id) }
    } catch (error) {
      report.live.google = { authenticated: false, httpStatus: Number(error.response?.status) || null }
    }
  }
  const result = JSON.stringify(report, null, 2)
  const index = process.argv.indexOf('--report')
  if (index >= 0 && process.argv[index + 1]) writeFileSync(process.argv[index + 1], result + '\n', { mode: 0o600 })
  console.log(result)
  if (Object.values(report.live).some(result => !result.authenticated)) process.exitCode = 1
}
main().catch(() => { console.error('Billing credential preflight failed. Sensitive error details were suppressed.'); process.exitCode = 1 })
