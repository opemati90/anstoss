import { Provider } from '@nestjs/common'
import Stripe from 'stripe'

export const STRIPE_CLIENT = 'STRIPE_CLIENT'

export const StripeProvider: Provider = {
  provide: STRIPE_CLIENT,
  useFactory: () => {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      // Return null in dev/test when Stripe isn't configured
      return null
    }
    return new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
  },
}
