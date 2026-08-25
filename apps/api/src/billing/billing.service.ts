import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { EntitlementStatus, PlanTier } from '@prisma/client'
import type Stripe from 'stripe'
import type { BillingStatus } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { STRIPE_CLIENT } from './stripe.provider'
import { ClubEntitlementsService } from './club-entitlements.service'

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly clubEntitlements: ClubEntitlementsService,
  ) {}

  // ─── Status & Entitlements ──────────────────────────────────

  async getStatus(clubId: string): Promise<BillingStatus> {
    const [stripeAccount, subscription, entitlement] = await Promise.all([
      this.prisma.stripeAccount.findUnique({ where: { clubId } }),
      this.prisma.subscription.findFirst({
        where: { clubId },
        orderBy: { createdAt: 'desc' },
      }),
      this.clubEntitlements.resolve(clubId),
    ])

    const connectStatus = !stripeAccount
      ? 'not_started'
      : stripeAccount.onboardingComplete
        ? 'active'
        : 'pending'

    const subscriptionStatus = subscription
      ? (subscription.status as BillingStatus['subscriptionStatus'])
      : 'inactive'

    const plan = entitlement
      ? entitlement.tier === PlanTier.FREE
        ? 'FOUNDATION'
        : 'PREMIUM'
      : subscription && ['active', 'trialing'].includes(subscription.status)
        ? 'PREMIUM'
        : 'FOUNDATION'

    return {
      clubId,
      provider: stripeAccount ? 'STRIPE' : 'NONE',
      plan,
      subscriptionStatus,
      connectStatus: connectStatus as BillingStatus['connectStatus'],
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      billingContactEmail: null,
    }
  }

  async getEntitlements(clubId: string) {
    const status = await this.getStatus(clubId)
    const [resolved, usage] = await Promise.all([
      this.clubEntitlements.resolve(clubId),
      this.clubEntitlements.usage(clubId),
    ])

    // Apply per-club overrides on top of the plan-derived list. Read
    // inline (no service injection) to avoid an AdminModule ↔ BillingModule
    // cycle. enabled=true grants the feature; enabled=false revokes it
    // even when the plan would otherwise include it.
    const overrides = await this.prisma.featureFlagOverride.findMany({
      where: { clubId },
    })
    const now = Date.now()
    const features = new Set(resolved.features)
    for (const o of overrides) {
      if (o.expiresAt && o.expiresAt.getTime() < now) continue
      if (o.enabled) features.add(o.featureSlug)
      else features.delete(o.featureSlug)
    }

    return {
      clubId,
      plan: status.plan,
      tier: resolved.tier,
      limits: resolved.limits,
      usage,
      features: Array.from(features),
    }
  }

  // ─── Stripe Connect Onboarding ──────────────────────────────

  /**
   * Create a Stripe Connect account for a club and return the onboarding URL.
   * If an account already exists but onboarding is incomplete, refresh the link.
   */
  async createConnectAccount(
    clubId: string,
    returnUrl: string,
    refreshUrl: string,
  ): Promise<{ url: string }> {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured')
    }

    let stripeAccount = await this.prisma.stripeAccount.findUnique({
      where: { clubId },
    })

    if (!stripeAccount) {
      const club = await this.prisma.club.findUnique({
        where: { id: clubId },
        select: { name: true },
      })

      const account = await this.stripe.accounts.create({
        type: 'standard',
        country: 'DE',
        business_type: 'non_profit',
        metadata: { clubId },
        business_profile: {
          name: club?.name ?? undefined,
        },
      })

      stripeAccount = await this.prisma.stripeAccount.create({
        data: {
          clubId,
          stripeAccountId: account.id,
          onboardingComplete: false,
        },
      })

      this.logger.log(`Created Stripe account ${account.id} for club ${clubId}`)
    }

    // If onboarding is already complete, return a login link instead
    if (stripeAccount.onboardingComplete) {
      const loginLink = await this.stripe.accounts.createLoginLink(stripeAccount.stripeAccountId)
      return { url: loginLink.url }
    }

    // Generate onboarding link
    const accountLink = await this.stripe.accountLinks.create({
      account: stripeAccount.stripeAccountId,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      type: 'account_onboarding',
    })

    return { url: accountLink.url }
  }

  /**
   * Check if a Stripe Connect account has completed onboarding.
   * Called after the user returns from the Stripe onboarding flow.
   */
  async refreshConnectStatus(clubId: string): Promise<{ complete: boolean }> {
    if (!this.stripe) {
      return { complete: false }
    }

    const stripeAccount = await this.prisma.stripeAccount.findUnique({
      where: { clubId },
    })

    if (!stripeAccount) {
      return { complete: false }
    }

    const account = await this.stripe.accounts.retrieve(stripeAccount.stripeAccountId)

    const complete = account.charges_enabled && account.details_submitted
    if (complete && !stripeAccount.onboardingComplete) {
      await this.prisma.stripeAccount.update({
        where: { clubId },
        data: { onboardingComplete: true },
      })
      this.logger.log(
        `Stripe onboarding complete for club ${clubId} (${stripeAccount.stripeAccountId})`,
      )
    }

    return { complete: !!complete }
  }

  // ─── Subscriptions ──────────────────────────────────────────

  async createSubscription(
    clubId: string,
    priceId: string,
  ): Promise<{ subscriptionId: string; clientSecret: string | null }> {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured')
    }
    const plan = await this.requirePublishedPrice(priceId)

    const stripeAccount = await this.prisma.stripeAccount.findUnique({
      where: { clubId },
    })

    if (!stripeAccount || !stripeAccount.onboardingComplete) {
      throw new BadRequestException('Stripe Connect onboarding must be completed first')
    }

    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { name: true },
    })

    // Create or retrieve customer
    const searchResult = await this.stripe.customers.search({
      query: `metadata["clubId"]:"${clubId}"`,
      limit: 1,
    })

    let customerId: string
    if (searchResult.data.length > 0) {
      customerId = searchResult.data[0].id
    } else {
      const customer = await this.stripe.customers.create({
        name: club?.name ?? undefined,
        metadata: { clubId },
      })
      customerId = customer.id
    }

    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        payment_method_types: ['sepa_debit', 'card'],
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: { clubId, tier: plan.tier, interval: plan.interval },
    })

    const invoice = subscription.latest_invoice as Stripe.Invoice | null

    const firstItem = subscription.items.data[0]
    const periodStart = firstItem?.current_period_start ?? subscription.start_date
    const periodEnd = firstItem?.current_period_end ?? subscription.start_date

    await this.upsertSubscription(clubId, {
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      plan: 'PREMIUM',
      currentPeriodStart: new Date(periodStart * 1000),
      currentPeriodEnd: new Date(periodEnd * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    })

    return {
      subscriptionId: subscription.id,
      clientSecret: invoice?.confirmation_secret?.client_secret ?? null,
    }
  }

  /**
   * Stripe Checkout-session subscription. Returns a hosted-checkout URL
   * that the mobile app opens via Linking, avoiding the
   * Stripe-React-Native PaymentSheet integration. This mirrors what
   * PaywallSheet expects (`{ url }`) — without it the upgrade button
   * fires `Linking.openURL(undefined)` and silently fails.
   */
  async createCheckoutSession(clubId: string, priceId: string): Promise<{ url: string }> {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured')
    }
    const plan = await this.requirePublishedPrice(priceId)

    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { name: true },
    })
    if (!club) {
      throw new BadRequestException('Club not found')
    }

    const searchResult = await this.stripe.customers.search({
      query: `metadata["clubId"]:"${clubId}"`,
      limit: 1,
    })
    let customerId: string
    if (searchResult.data.length > 0) {
      customerId = searchResult.data[0].id
    } else {
      const customer = await this.stripe.customers.create({
        name: club.name ?? undefined,
        metadata: { clubId },
      })
      customerId = customer.id
    }

    const appBase = process.env.APP_DEEP_LINK_BASE ?? 'anstoss://'
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_types: ['card', 'sepa_debit'],
      success_url: `${appBase}billing/success?clubId=${encodeURIComponent(clubId)}`,
      cancel_url: `${appBase}billing/cancel`,
      metadata: { clubId, tier: plan.tier, interval: plan.interval },
      subscription_data: {
        metadata: { clubId, tier: plan.tier, interval: plan.interval },
      },
    })

    if (!session.url) {
      throw new BadRequestException('Stripe did not return a checkout URL')
    }
    return { url: session.url }
  }

  async cancelSubscription(clubId: string): Promise<void> {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured')
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: { clubId, status: { in: ['active', 'trialing'] } },
      orderBy: { createdAt: 'desc' },
    })

    if (!subscription) {
      throw new BadRequestException('No active subscription found')
    }

    await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    })
  }

  // ─── Webhooks ───────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signature: string): Promise<{ received: true }> {
    if (!this.stripe) {
      this.logger.error('Stripe client is unavailable — refusing webhook')
      throw new ServiceUnavailableException('Webhook receiver not configured')
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      // Fail closed. Skipping verification accepts any forged event when
      // the env var is missing — a misconfiguration that was previously
      // silently a HIGH severity production bug. Hard refusal makes the
      // misconfig visible immediately at the first webhook delivery.
      this.logger.error('STRIPE_WEBHOOK_SECRET not set — refusing webhook (fail closed)')
      throw new ServiceUnavailableException('Webhook receiver not configured')
    }

    let event: Stripe.Event
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err}`)
      throw new BadRequestException('Invalid webhook signature')
    }

    this.logger.log(`Processing webhook event: ${event.type} (${event.id})`)

    // Idempotency: Stripe redelivers the same event id on retry. If we've
    // already recorded a PaymentEvent for it, skip — re-running handlers
    // would re-apply side effects and crash on the unique stripeEventId
    // constraint. (subscription.*/account.updated don't record a
    // PaymentEvent and are upsert-based, so they stay safely re-runnable.)
    const alreadyProcessed = await this.prisma.paymentEvent.findUnique({
      where: { stripeEventId: event.id },
      select: { id: true },
    })
    if (alreadyProcessed) {
      this.logger.log(`Webhook ${event.id} already processed — skipping`)
      return { received: true }
    }

    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event)
        break
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event)
        break
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event)
        break
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event)
        break
      case 'account.updated':
        await this.handleAccountUpdated(event)
        break
      default:
        this.logger.log(`Unhandled webhook event type: ${event.type}`)
    }

    return { received: true }
  }

  private async handleInvoicePaymentSucceeded(event: Stripe.Event) {
    const invoice = event.data.object as Stripe.Invoice
    const clubId =
      invoice.parent?.subscription_details?.metadata?.clubId ?? invoice.metadata?.clubId
    if (!clubId) return

    await this.recordPaymentEvent(clubId, {
      stripeEventId: event.id,
      type: 'invoice.payment_succeeded',
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: 'succeeded',
    })
  }

  private async handleInvoicePaymentFailed(event: Stripe.Event) {
    const invoice = event.data.object as Stripe.Invoice
    const clubId =
      invoice.parent?.subscription_details?.metadata?.clubId ?? invoice.metadata?.clubId
    if (!clubId) return

    await this.recordPaymentEvent(clubId, {
      stripeEventId: event.id,
      type: 'invoice.payment_failed',
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: 'failed',
    })
  }

  private getSubscriptionPeriod(subscription: Stripe.Subscription) {
    const item = subscription.items.data[0]
    return {
      start: new Date((item?.current_period_start ?? subscription.start_date) * 1000),
      end: new Date((item?.current_period_end ?? subscription.start_date) * 1000),
    }
  }

  private async handleSubscriptionUpdated(event: Stripe.Event) {
    const subscription = event.data.object as Stripe.Subscription
    const clubId = subscription.metadata?.clubId
    if (!clubId) return

    const period = this.getSubscriptionPeriod(subscription)
    await this.upsertSubscription(clubId, {
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      plan: 'PREMIUM',
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    })
    await this.syncPaidEntitlement(subscription, clubId, period)
  }

  private async handleSubscriptionDeleted(event: Stripe.Event) {
    const subscription = event.data.object as Stripe.Subscription
    const clubId = subscription.metadata?.clubId
    if (!clubId) return

    const period = this.getSubscriptionPeriod(subscription)
    await this.upsertSubscription(clubId, {
      stripeSubscriptionId: subscription.id,
      status: 'canceled',
      plan: 'PREMIUM',
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      cancelAtPeriodEnd: false,
    })
    await this.prisma.entitlementGrant.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: { status: EntitlementStatus.REVOKED, expiresAt: new Date() },
    })
  }

  private async requirePublishedPrice(priceId: string) {
    const plan = await this.prisma.planDefinition.findUnique({
      where: { stripePriceId: priceId },
    })
    if (!plan?.publishedAt || plan.tier === PlanTier.FREE) {
      throw new BadRequestException('Unknown or unpublished subscription price')
    }
    return plan
  }

  private async syncPaidEntitlement(
    subscription: Stripe.Subscription,
    clubId: string,
    period: { start: Date; end: Date },
  ) {
    const priceId = subscription.items.data[0]?.price?.id
    const definition = priceId
      ? await this.prisma.planDefinition.findUnique({ where: { stripePriceId: priceId } })
      : null
    const existing = await this.prisma.entitlementGrant.findUnique({
      where: { stripeSubscriptionId: subscription.id },
      select: { tier: true },
    })
    const tier = definition?.tier ?? existing?.tier
    if (!tier) {
      this.logger.error(
        `Refusing to grant an entitlement for unknown Stripe price ${priceId ?? 'missing'} on subscription ${subscription.id}`,
      )
      return
    }
    const status = ['active', 'trialing'].includes(subscription.status)
      ? EntitlementStatus.ACTIVE
      : ['canceled', 'unpaid', 'incomplete_expired'].includes(subscription.status)
        ? EntitlementStatus.REVOKED
        : EntitlementStatus.SUSPENDED

    await this.prisma.entitlementGrant.upsert({
      where: { stripeSubscriptionId: subscription.id },
      create: {
        clubId,
        tier,
        source: 'PAID',
        status,
        startsAt: period.start,
        expiresAt: period.end,
        reason: `Stripe subscription ${subscription.id}`,
        stripeSubscriptionId: subscription.id,
        planDefinitionId: definition?.id ?? null,
      },
      update: {
        tier,
        status,
        startsAt: period.start,
        expiresAt: period.end,
        ...(definition ? { planDefinitionId: definition.id } : {}),
      },
    })
  }

  private async handleAccountUpdated(event: Stripe.Event) {
    const account = event.data.object as Stripe.Account
    const clubId = account.metadata?.clubId
    if (!clubId) return

    const complete = account.charges_enabled && account.details_submitted
    await this.createOrUpdateStripeAccount(clubId, account.id, !!complete)
  }

  // ─── Prisma helpers ─────────────────────────────────────────

  async createOrUpdateStripeAccount(
    clubId: string,
    stripeAccountId: string,
    onboardingComplete: boolean,
  ) {
    return this.prisma.stripeAccount.upsert({
      where: { clubId },
      create: { clubId, stripeAccountId, onboardingComplete },
      update: { stripeAccountId, onboardingComplete },
    })
  }

  async upsertSubscription(
    clubId: string,
    data: {
      stripeSubscriptionId: string
      status: string
      plan: string
      currentPeriodStart: Date
      currentPeriodEnd: Date
      cancelAtPeriodEnd: boolean
    },
  ) {
    const subscription = await this.prisma.subscription.upsert({
      where: { stripeSubscriptionId: data.stripeSubscriptionId },
      create: { clubId, ...data },
      update: {
        status: data.status,
        plan: data.plan,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
      },
    })

    await this.auditService.log({
      clubId,
      type: 'billing.status_changed',
      actorType: 'system',
      actorId: null,
      actorLabel: null,
      summary: `Subscription status changed to ${data.status} (plan: ${data.plan})`,
      metadata: {
        stripeSubscriptionId: data.stripeSubscriptionId,
        status: data.status,
      },
    })

    return subscription
  }

  async recordPaymentEvent(
    clubId: string,
    data: {
      stripeEventId: string
      type: string
      amount: number
      currency?: string
      status: string
    },
  ) {
    // Upsert (not create) so a race between two concurrent redeliveries
    // that both clear the early idempotency check can't crash on the
    // unique stripeEventId constraint.
    return this.prisma.paymentEvent.upsert({
      where: { stripeEventId: data.stripeEventId },
      create: {
        clubId,
        stripeEventId: data.stripeEventId,
        type: data.type,
        amount: data.amount,
        currency: data.currency ?? 'eur',
        status: data.status,
      },
      update: {},
    })
  }
}
