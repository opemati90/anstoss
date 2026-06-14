import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type Stripe from 'stripe'
import type { BillingStatus } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { STRIPE_CLIENT } from './stripe.provider'

// Mirrors entitlement.guard.ts — flip both to false when billing launches post-MVP.
const MVP_ALL_FREE = true

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
  ) {}

  // ─── Status & Entitlements ──────────────────────────────────

  async getStatus(clubId: string): Promise<BillingStatus> {
    const [stripeAccount, subscription] = await Promise.all([
      this.prisma.stripeAccount.findUnique({ where: { clubId } }),
      this.prisma.subscription.findFirst({
        where: { clubId },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const connectStatus = !stripeAccount
      ? 'not_started'
      : stripeAccount.onboardingComplete
        ? 'active'
        : 'pending'

    const subscriptionStatus = subscription
      ? (subscription.status as BillingStatus['subscriptionStatus'])
      : 'inactive'

    const plan =
      subscription && subscription.status === 'active' ? 'PREMIUM' : 'FOUNDATION'

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

    // Feature list mirrors apps/web/src/index.html pricing block. Keep
    // these slugs stable — they're the source of truth for paywall gates
    // on mobile (`useEntitlements().has('lineup_builder_pro')`) and any
    // future server-side gate decorator.
    const baseFeatures =
      status.plan === 'PREMIUM'
        ? [
            'sponsor_logos',
            'splash_image',
            'custom_domain',
            'lineup_builder_pro',
            'motm_archive',
            'contribution_intake',
            'scouting_marketplace',
            'priority_support',
          ]
        : []

    // Apply per-club overrides on top of the plan-derived list. Read
    // inline (no service injection) to avoid an AdminModule ↔ BillingModule
    // cycle. enabled=true grants the feature; enabled=false revokes it
    // even when the plan would otherwise include it.
    const overrides = await this.prisma.featureFlagOverride.findMany({
      where: { clubId },
    })
    const now = Date.now()
    const features = new Set(baseFeatures)
    for (const o of overrides) {
      if (o.expiresAt && o.expiresAt.getTime() < now) continue
      if (o.enabled) features.add(o.featureSlug)
      else features.delete(o.featureSlug)
    }

    return {
      clubId,
      plan: status.plan,
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
      const loginLink = await this.stripe.accounts.createLoginLink(
        stripeAccount.stripeAccountId,
      )
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

    const account = await this.stripe.accounts.retrieve(
      stripeAccount.stripeAccountId,
    )

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
      metadata: { clubId },
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
  async createCheckoutSession(
    clubId: string,
    priceId: string,
  ): Promise<{ url: string }> {
    // MVP: subscriptions are free for all clubs — block this path to prevent
    // accidental real Stripe charges. Remove when billing launches post-MVP.
    if (MVP_ALL_FREE) {
      throw new BadRequestException(
        'Subscriptions are not available during the MVP period',
      )
    }
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured')
    }

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
      metadata: { clubId },
      subscription_data: {
        metadata: { clubId },
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

  /**
   * Mint a Stripe Checkout Session that lets a player pay a single
   * contribution amount into the club's Connect account. Returns
   * `null` when the club has not finished Stripe Connect onboarding —
   * caller falls back to the soft mark-paid signal in that case.
   *
   * The Checkout Session metadata carries `recordId` so the webhook
   * (`checkout.session.completed`) can flip the ContributionRecord to
   * PAID without the mobile app having to round-trip.
   */
  async createContributionCheckoutSession(input: {
    clubId: string
    recordId: string
    memberUserId: string
    planName: string
    amount: number
    currency: string
    idempotencyKey?: string
  }): Promise<{ url: string } | null> {
    if (!this.stripe) return null

    const stripeAccount = await this.prisma.stripeAccount.findUnique({
      where: { clubId: input.clubId },
    })
    if (!stripeAccount?.onboardingComplete) {
      return null
    }

    const club = await this.prisma.club.findUnique({
      where: { id: input.clubId },
      select: { name: true },
    })

    const appBase = process.env.APP_DEEP_LINK_BASE ?? 'anstoss://'

    // Reuse an existing open session for the same record+period when an
    // idempotency key is provided. If Stripe returns the same session
    // (already created with this key), it will have the same URL so the
    // member simply resumes the same Checkout — no second charge is ever
    // minted.
    const stripeRequestOptions: Stripe.RequestOptions = {
      stripeAccount: stripeAccount.stripeAccountId,
      ...(input.idempotencyKey
        ? { idempotencyKey: `contrib_checkout_${input.idempotencyKey}` }
        : {}),
    }

    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amount,
              product_data: {
                name: `${club?.name ?? 'Club'}: ${input.planName}`,
              },
            },
            quantity: 1,
          },
        ],
        payment_method_types: ['card', 'sepa_debit'],
        success_url: `${appBase}contributions/success?recordId=${encodeURIComponent(input.recordId)}`,
        cancel_url: `${appBase}contributions/cancel`,
        // Application fee defaults to 0 for MVP — clubs keep 100% of
        // the contribution. Set ANSTOSS_CONTRIBUTION_FEE_BPS later if
        // we charge a platform cut.
        metadata: {
          clubId: input.clubId,
          recordId: input.recordId,
          memberUserId: input.memberUserId,
          intent: 'contribution_payment',
        },
        payment_intent_data: {
          metadata: {
            clubId: input.clubId,
            recordId: input.recordId,
            memberUserId: input.memberUserId,
            intent: 'contribution_payment',
          },
          // Direct-charge model: funds land on the connected account.
          // Platform doesn't sit between the player and the club for
          // the dues path.
        },
      },
      stripeRequestOptions,
    )

    if (!session.url) return null
    return { url: session.url }
  }

  // ─── Webhooks ───────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signature: string): Promise<{ received: true }> {
    if (!this.stripe) {
      return { received: true }
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      // Fail closed. Skipping verification accepts any forged event when
      // the env var is missing — a misconfiguration that was previously
      // silently a HIGH severity production bug. Hard refusal makes the
      // misconfig visible immediately at the first webhook delivery.
      this.logger.error(
        'STRIPE_WEBHOOK_SECRET not set — refusing webhook (fail closed)',
      )
      throw new ServiceUnavailableException(
        'Webhook receiver not configured',
      )
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
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event)
        break
      default:
        this.logger.log(`Unhandled webhook event type: ${event.type}`)
    }

    return { received: true }
  }

  private async handleCheckoutSessionCompleted(event: Stripe.Event) {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.metadata?.intent !== 'contribution_payment') return
    const recordId = session.metadata?.recordId
    if (!recordId) return
    if (session.payment_status !== 'paid') return

    const record = await this.prisma.contributionRecord.findUnique({
      where: { id: recordId },
    })
    if (!record) return
    if (record.status === 'PAID') return

    // Verify the amount and currency reported by Stripe match what we
    // expect for this contribution record. A mismatch (e.g. tampered
    // metadata pointing at a different record, or a currency mismatch)
    // must never silently mark the record PAID at the wrong figure.
    const sessionAmount = session.amount_total
    const sessionCurrency = session.currency?.toLowerCase()
    const recordCurrency = record.currency.toLowerCase()

    if (
      typeof sessionAmount !== 'number' ||
      sessionAmount !== record.amount ||
      sessionCurrency !== recordCurrency
    ) {
      this.logger.error(
        `Contribution record ${record.id} amount/currency mismatch: ` +
          `Stripe session ${session.id} reported ${sessionAmount} ${sessionCurrency}, ` +
          `record expects ${record.amount} ${recordCurrency}. Skipping PAID transition.`,
      )
      return
    }

    // Direct contribution PAID update — calling ContributionsService
    // would create a circular dep through Billing. Audit log entry +
    // push notify are emitted by the next reconcile poll; the user
    // sees PAID status on refresh either way.
    await this.prisma.contributionRecord.update({
      where: { id: record.id },
      data: {
        status: 'PAID',
        paidAmount: sessionAmount,
        paidAt: new Date(),
      },
    })

    await this.recordPaymentEvent(record.clubId, {
      stripeEventId: event.id,
      type: 'checkout.session.completed',
      amount: sessionAmount,
      currency: record.currency,
      status: 'succeeded',
    })

    this.logger.log(
      `Contribution record ${record.id} marked PAID via Stripe Checkout (session ${session.id})`,
    )
  }

  private async handleInvoicePaymentSucceeded(event: Stripe.Event) {
    const invoice = event.data.object as Stripe.Invoice
    const clubId = invoice.parent?.subscription_details?.metadata?.clubId ?? invoice.metadata?.clubId
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
    const clubId = invoice.parent?.subscription_details?.metadata?.clubId ?? invoice.metadata?.clubId
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
