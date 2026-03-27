import { Injectable } from '@nestjs/common'
import type { BillingStatus } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

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

    const plan = subscription && subscription.status === 'active'
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

    return {
      clubId,
      plan: status.plan,
      features:
        status.plan === 'PREMIUM'
          ? ['sponsor_logos', 'splash_image', 'custom_domain']
          : [],
    }
  }

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
      metadata: { stripeSubscriptionId: data.stripeSubscriptionId, status: data.status },
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
    return this.prisma.paymentEvent.create({
      data: {
        clubId,
        stripeEventId: data.stripeEventId,
        type: data.type,
        amount: data.amount,
        currency: data.currency ?? 'eur',
        status: data.status,
      },
    })
  }

  async acknowledgeStripeWebhook() {
    return {
      received: true,
      provider: 'stripe',
    }
  }
}
