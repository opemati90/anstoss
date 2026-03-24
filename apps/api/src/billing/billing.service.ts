import { Injectable } from '@nestjs/common'
import type { BillingStatus } from '@anstoss/shared'

@Injectable()
export class BillingService {
  getStatus(clubId: string): BillingStatus {
    const premiumClubs = new Set(
      (process.env.PREMIUM_CLUB_IDS || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    const isPremium = premiumClubs.has(clubId)

    return {
      clubId,
      provider: process.env.BILLING_PROVIDER === 'STRIPE' ? 'STRIPE' : 'NONE',
      plan: isPremium ? 'PREMIUM' : 'FOUNDATION',
      subscriptionStatus: isPremium ? 'active' : 'inactive',
      connectStatus: isPremium ? 'pending' : 'not_started',
      currentPeriodEnd: null,
      billingContactEmail: null,
    }
  }

  getEntitlements(clubId: string) {
    const status = this.getStatus(clubId)

    return {
      clubId,
      plan: status.plan,
      features:
        status.plan === 'PREMIUM'
          ? ['sponsor_logos', 'splash_image', 'custom_domain']
          : [],
    }
  }

  acknowledgeStripeWebhook() {
    return {
      received: true,
      provider: 'stripe',
      persisted: false,
    }
  }
}
