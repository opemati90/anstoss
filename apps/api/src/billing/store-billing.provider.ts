import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { AppStoreServerAPIClient, Environment, SignedDataVerifier } from '@apple/app-store-server-library'
import { GoogleAuth, OAuth2Client } from 'google-auth-library'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { appleBillingCredentials, googleBillingCredentials } from './store-billing.credentials'
import type { StoreBillingRequest } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import {
  ANSTOSS_APPLE_ID, ANSTOSS_BUNDLE_ID, InvalidStorePurchaseException,
  googleSubscriptionSchema, normalizeApplePurchase, normalizeGooglePurchase, purchaseTokenHash, type VerifiedStorePurchase,
} from './store-purchase'

export class StoreBillingUnavailableException extends ServiceUnavailableException {
  constructor() { super('Store billing is temporarily unavailable. Your purchase can be restored later.') }
}

@Injectable()
export class StoreBillingProvider {
  private google?: GoogleAuth
  private readonly oidc = new OAuth2Client()
  constructor(private readonly prisma: PrismaService) {}

  configured(store: StoreBillingRequest['store']) {
    const env = process.env
    const common = env.ANSTOSS_IAP_ENABLED === 'true' && /^[a-fA-F0-9]{64}$/.test(env.ANSTOSS_IAP_ENCRYPTION_KEY ?? '')
    if (!common) return false
    try {
      if (store === 'APPLE') appleBillingCredentials(env)
      else googleBillingCredentials(env)
      return true
    } catch { return false }
  }

  private googleClient() {
    if (!this.configured('GOOGLE')) throw new StoreBillingUnavailableException()
    this.google ??= new GoogleAuth({ credentials: googleBillingCredentials(), scopes: ['https://www.googleapis.com/auth/androidpublisher'] })
    return this.google
  }

  private apple(environment: StoreBillingRequest['environment']) {
    if (!this.configured('APPLE')) throw new StoreBillingUnavailableException()
    const credentials = appleBillingCredentials()
    const mode = environment === 'PRODUCTION' ? Environment.PRODUCTION : Environment.SANDBOX
    const client = new AppStoreServerAPIClient(
      credentials.privateKey,
      credentials.keyId, credentials.issuerId, ANSTOSS_BUNDLE_ID, mode,
    )
    const verifier = new SignedDataVerifier(credentials.roots, true, mode, ANSTOSS_BUNDLE_ID, ANSTOSS_APPLE_ID)
    return { client, verifier }
  }

  async verify(input: StoreBillingRequest): Promise<VerifiedStorePurchase> {
    if (!this.configured(input.store)) throw new StoreBillingUnavailableException()
    try {
      if (input.store === 'GOOGLE') {
        const purchase = await this.verifyGoogleReference(input.reference)
        // RTDN and Play Billing clients do not reliably expose the test flag.
        // Only the authenticated Google API decides the environment.
        return purchase
      }
      if (!/^\d{1,40}$/.test(input.reference)) throw new InvalidStorePurchaseException()
      const { client, verifier } = this.apple(input.environment)
      // Query current server state, not a replayed client receipt or old notification.
      const info = await client.getTransactionInfo(input.reference)
      if (!info.signedTransactionInfo) throw new InvalidStorePurchaseException()
      const initial = await verifier.verifyAndDecodeTransaction(info.signedTransactionInfo)
      if (!initial.originalTransactionId) throw new InvalidStorePurchaseException()
      const response = await client.getAllSubscriptionStatuses(initial.originalTransactionId)
      const current = response.data?.flatMap((group) => group.lastTransactions ?? [])
        .find((item) => item.originalTransactionId === initial.originalTransactionId)
      if (!current?.signedTransactionInfo || !current.signedRenewalInfo || !current.status) throw new InvalidStorePurchaseException()
      const transaction = await verifier.verifyAndDecodeTransaction(current.signedTransactionInfo)
      const renewal = await verifier.verifyAndDecodeRenewalInfo(current.signedRenewalInfo)
      if (transaction.originalTransactionId !== initial.originalTransactionId) throw new InvalidStorePurchaseException()
      return normalizeApplePurchase(transaction, renewal, current.status, input.environment)
    } catch (error) {
      if (error instanceof InvalidStorePurchaseException) throw error
      // SDK errors may contain a Google token or signed payload; never log/return them.
      throw new StoreBillingUnavailableException()
    }
  }

  async verifyGoogleReference(reference: string) {
    if (!this.configured('GOOGLE')) throw new StoreBillingUnavailableException()
    try {
      const response = await this.googleClient().request({ url: this.googleUrl(reference), timeout: 15000, retry: false })
      const parsed = googleSubscriptionSchema.safeParse(response.data)
      if (!parsed.success) throw new InvalidStorePurchaseException()
      const data = parsed.data
      const environment = data.testPurchase ? 'SANDBOX' : 'PRODUCTION'
      const lookup = (token: string) => this.prisma.storeSubscription.findUnique({
        where: { store_environment_originalId: { store: 'GOOGLE', environment, originalId: purchaseTokenHash(token) } },
        select: { accountId: true, deferredFromProductId: true, deferredToProductId: true },
      })
      // Identity comes only from Google's authenticated response or immutable
      // mappings of the exact token/environment. Never from the client request.
      const current = await lookup(reference)
      const expiredToken = data.outOfAppPurchaseContext?.expiredPurchaseToken
      const expired = expiredToken ? await lookup(expiredToken) : null
      return normalizeGooglePurchase(data, reference, {
        accountTokens: [current?.accountId, expired?.accountId].filter((id): id is string => Boolean(id)),
        deferredReplacement: current?.deferredFromProductId && current.deferredToProductId
          ? { fromProductId: current.deferredFromProductId, toProductId: current.deferredToProductId } : undefined,
      })
    } catch (error) {
      if (error instanceof InvalidStorePurchaseException) throw error
      throw new StoreBillingUnavailableException()
    }
  }

  async acknowledge(purchase: VerifiedStorePurchase) {
    if (purchase.store !== 'GOOGLE' || !purchase.acknowledgementNeeded) return
    try {
      await this.googleClient().request({
        url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANSTOSS_BUNDLE_ID}/purchases/subscriptions/${encodeURIComponent(purchase.productId)}/tokens/${encodeURIComponent(purchase.reference)}:acknowledge`,
        method: 'POST', data: purchase.resubscription
          ? { externalAccountIds: { obfuscatedAccountId: purchase.accountToken } } : {}, timeout: 15000, retry: false,
      })
    } catch { throw new StoreBillingUnavailableException() }
  }

  async appleNotification(payload: string): Promise<StoreBillingRequest | null> {
    if (!this.configured('APPLE')) throw new StoreBillingUnavailableException()
    for (const environment of ['PRODUCTION', 'SANDBOX'] as const) {
      try {
        const { verifier } = this.apple(environment)
        const notification = await verifier.verifyAndDecodeNotification(payload)
        if (notification.notificationType === 'TEST') return null
        if (!notification.data?.signedTransactionInfo) throw new InvalidStorePurchaseException()
        const transaction = await verifier.verifyAndDecodeTransaction(notification.data.signedTransactionInfo)
        if (!transaction.originalTransactionId) throw new InvalidStorePurchaseException()
        return { store: 'APPLE', environment, reference: transaction.originalTransactionId }
      } catch { /* Try the other cryptographically verified store environment. */ }
    }
    throw new UnauthorizedException('Invalid store notification')
  }

  async verifyGoogleNotification(authorization: string | undefined) {
    const audience = process.env.ANSTOSS_IAP_GOOGLE_PUSH_AUDIENCE
    const email = process.env.ANSTOSS_IAP_GOOGLE_PUSH_EMAIL
    if (!audience || !email) throw new StoreBillingUnavailableException()
    const token = authorization?.match(/^Bearer (\S+)$/)?.[1]
    if (!token) throw new UnauthorizedException('Invalid store notification')
    try {
      const ticket = await this.oidc.verifyIdToken({ idToken: token, audience })
      const payload = ticket.getPayload()
      if (payload?.email !== email || payload.email_verified !== true || payload.aud !== audience ||
          !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw new Error('identity')
    } catch { throw new UnauthorizedException('Invalid store notification') }
  }

  seal(reference: string) {
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), nonce)
    cipher.setAAD(Buffer.from(ANSTOSS_BUNDLE_ID))
    const encrypted = Buffer.concat([cipher.update(reference, 'utf8'), cipher.final()])
    return [nonce, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.')
  }

  unseal(sealed: string) {
    const [nonce, tag, encrypted] = sealed.split('.').map((part) => Buffer.from(part, 'base64'))
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), nonce)
    decipher.setAAD(Buffer.from(ANSTOSS_BUNDLE_ID))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  }

  private encryptionKey() {
    const key = process.env.ANSTOSS_IAP_ENCRYPTION_KEY ?? ''
    if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new StoreBillingUnavailableException()
    return Buffer.from(key, 'hex')
  }

  private googleUrl(reference: string) {
    return `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANSTOSS_BUNDLE_ID}/purchases/subscriptionsv2/tokens/${encodeURIComponent(reference)}`
  }
}
