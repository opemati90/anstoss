import { z } from 'zod'

export const storePlatformSchema = z.enum(['APPLE', 'GOOGLE'])
export const storeEnvironmentSchema = z.enum(['PRODUCTION', 'SANDBOX'])
export const storeBillingRequestSchema = z.object({
  store: storePlatformSchema,
  environment: storeEnvironmentSchema,
  // Apple transaction ID or Google purchase token. Never a client-supplied price or expiry.
  reference: z.string().min(1).max(8192),
}).strict()
export type StoreBillingRequest = z.infer<typeof storeBillingRequestSchema>

export const STORE_PRODUCTS = [
  { id: 'com.renuirug.anstoss.team.monthly', package: 'TEAM', interval: 'monthly', definition: 'plan_three_team_monthly_20261115' },
  { id: 'com.renuirug.anstoss.team.yearly', package: 'TEAM', interval: 'yearly', definition: 'plan_three_team_twelve_months_20261115' },
  { id: 'com.renuirug.anstoss.club3.monthly', package: 'CLUB_3', interval: 'monthly', definition: 'plan_three_club3_monthly_20261115' },
  { id: 'com.renuirug.anstoss.club3.yearly', package: 'CLUB_3', interval: 'yearly', definition: 'plan_three_club3_twelve_months_20261115' },
  { id: 'com.renuirug.anstoss.unlimited.monthly', package: 'UNLIMITED', interval: 'monthly', definition: 'plan_three_unlimited_monthly_20261115' },
  { id: 'com.renuirug.anstoss.unlimited.yearly', package: 'UNLIMITED', interval: 'yearly', definition: 'plan_three_unlimited_twelve_months_20261115' },
] as const

export const storeCheckoutRequestSchema = z.object({
  store: storePlatformSchema,
  productId: z.string().refine(id => STORE_PRODUCTS.some(product => product.id === id), 'Unknown subscription'),
}).strict()

export const appleNotificationSchema = z.object({ signedPayload: z.string().min(1).max(65536) }).strict()
export const googleNotificationSchema = z.object({
  message: z.object({ data: z.string().min(1).max(32768), messageId: z.string().max(200).optional() }),
  subscription: z.string().max(500).optional(),
})
export const googleNotificationDataSchema = z.object({
  packageName: z.string(),
  subscriptionNotification: z.object({ purchaseToken: z.string().min(1).max(8192) }).optional(),
  testNotification: z.object({ version: z.string() }).optional(),
})

export const storeBillingStatusSchema = z.object({
  enabled: z.boolean(),
  accountToken: z.string().uuid().nullable(),
  checkout: z.object({ store: storePlatformSchema, ownedByYou: z.boolean(), productId: z.string().nullable().optional() }).nullable().optional(),
  products: z.array(z.string()),
  subscriptions: z.array(z.object({
    store: storePlatformSchema,
    productId: z.string(),
    environment: storeEnvironmentSchema,
    status: z.string(),
    expiresAt: z.string(),
    autoRenew: z.boolean(),
  })),
})
export type StoreBillingStatus = z.infer<typeof storeBillingStatusSchema>
