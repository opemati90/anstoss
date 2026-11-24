import { Injectable } from '@nestjs/common'
import { z } from 'zod'
import { AiBudgetService, AiUnavailableException, type AiPurpose } from './ai-budget.service'

// Snapshot/rates reviewed 2026-11-24: $0.40/M input, $1.60/M output.
// 8,000 UTF-8 bytes + 1,024 framing-token allowance + 2,048 output tokens
// cost < $0.007. Reserve $0.01 and NEVER release it, even on timeouts,
// malformed output or lost responses. No automatic retries, tools or images.
// Pricing/model changes require a new reviewed bound, not an env override.
export const AI_MODEL = 'gpt-4.1-mini-2025-04-14'
export const AI_MAX_REQUEST_BYTES = 8_000
export const AI_MAX_OUTPUT_TOKENS = 2_048
const AI_MAX_RESPONSE_BYTES = 64_000

const providerResponse = z.object({
  status: z.literal('completed'),
  output: z.array(
    z.object({
      type: z.literal('message'),
      content: z.array(z.object({ type: z.literal('output_text'), text: z.string() })),
    }),
  ),
})

@Injectable()
export class AiTextService {
  constructor(private readonly budget: AiBudgetService) {}

  isEnabled(): boolean {
    return process.env.ANSTOSS_AI_ENABLED === 'true' && !!process.env.OPENAI_API_KEY?.trim()
  }

  async generate(
    purpose: AiPurpose,
    instructions: string,
    input: string,
    format?: { name: string; schema: Record<string, unknown> },
    beforeDispatch?: () => Promise<boolean>,
  ): Promise<string> {
    if (!this.isEnabled()) throw new AiUnavailableException()
    const body = JSON.stringify({
      model: AI_MODEL,
      instructions,
      input,
      max_output_tokens: AI_MAX_OUTPUT_TOKENS,
      service_tier: 'default',
      store: false,
      ...(format ? { text: { format: { type: 'json_schema', strict: true, ...format } } } : {}),
    })
    if (Buffer.byteLength(body, 'utf8') > AI_MAX_REQUEST_BYTES) throw new AiUnavailableException()
    await this.budget.reserve(purpose)
    // Budget lock contention must not extend a permission grant: consent and
    // message deletion may have changed while the reservation was waiting.
    if (!this.isEnabled() || (beforeDispatch && !(await beforeDispatch())))
      throw new AiUnavailableException()
    // Reservation is committed before any network operation. The fetch API
    // performs no application retries; redirects are explicitly prohibited.
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(purpose === 'TRANSLATION' ? 4_000 : 20_000),
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}`,
          'Content-Type': 'application/json',
        },
        body,
      })
      if (!response.ok || !response.body) {
        await response.body?.cancel().catch(() => undefined)
        throw new AiUnavailableException()
      }
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let bytes = 0
      try {
        for (;;) {
          const part = await reader.read()
          if (part.done) break
          bytes += part.value.byteLength
          if (bytes > AI_MAX_RESPONSE_BYTES) throw new AiUnavailableException()
          chunks.push(part.value)
        }
      } finally {
        await reader.cancel().catch(() => undefined)
      }
      const parsed = providerResponse.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      const text = parsed.output.flatMap((item) => item.content.map((part) => part.text)).join('')
      if (!text.trim()) throw new AiUnavailableException()
      return text
    } catch {
      // Never log request/response bodies or provider errors containing chat text.
      throw new AiUnavailableException()
    }
  }
}
