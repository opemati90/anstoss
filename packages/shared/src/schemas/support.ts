import { z } from 'zod'

export const supportStatusSchema = z.enum(['OPEN', 'WAITING', 'RESOLVED'])
export const supportCategorySchema = z.enum(['BUG', 'BILLING', 'ACCOUNT', 'OTHER'])
export const createSupportTicketSchema = z
  .object({
    requestId: z.string().uuid(),
    category: supportCategorySchema,
    subject: z.string().trim().min(3).max(120),
    body: z.string().trim().min(10).max(4000),
    appVersion: z.string().max(30).optional(),
    build: z.string().max(30).optional(),
    platform: z.enum(['ios', 'android', 'web']).optional(),
  })
  .strict()
export const supportReplySchema = z
  .object({
    requestId: z.string().uuid(),
    body: z.string().trim().min(1).max(4000),
  })
  .strict()
export const updateSupportStatusSchema = z.object({ status: supportStatusSchema }).strict()
export const supportListSchema = z
  .object({
    status: supportStatusSchema.optional(),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict()

export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>
export type SupportReplyInput = z.infer<typeof supportReplySchema>
export type SupportStatus = z.infer<typeof supportStatusSchema>
export type SupportTicketSummary = {
  id: string
  subject: string
  category: z.infer<typeof supportCategorySchema>
  status: SupportStatus
  createdAt: string
  updatedAt: string
}
export type SupportTicketDetail = SupportTicketSummary & {
  messages: Array<{ id: string; body: string; fromSupport: boolean; createdAt: string }>
}
