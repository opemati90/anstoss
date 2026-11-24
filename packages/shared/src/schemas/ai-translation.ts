import { z } from 'zod'

export const AI_TRANSLATION_NOTICE_VERSION = 'openai-translation-v1' as const
export const aiTranslationConsentSchema = z
  .object({
    enabled: z.boolean(),
    noticeVersion: z.literal(AI_TRANSLATION_NOTICE_VERSION),
  })
  .strict()
export const aiTranslationPreferenceSchema = z.object({
  enabled: z.boolean(),
  available: z.boolean(),
  noticeVersion: z.literal(AI_TRANSLATION_NOTICE_VERSION),
})
export type AiTranslationPreference = z.infer<typeof aiTranslationPreferenceSchema>
