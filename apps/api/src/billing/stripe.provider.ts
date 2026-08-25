import { Provider } from '@nestjs/common'
import Stripe from 'stripe'

export const STRIPE_CLIENT = 'STRIPE_CLIENT'

export const StripeProvider: Provider = {
  provide: STRIPE_CLIENT,
  useFactory: () => {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('STRIPE_SECRET_KEY must be configured in production')
      }
      // Local development and isolated tests may run without Stripe.
      return null
    }
    return new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
  },
}
