import { z } from 'zod'
import type { PushOutcome, ReminderTransport } from './reminder-delivery'

const outcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), id: z.string().optional() }),
  z.object({ status: z.literal('error'), details: z.object({ error: z.string() }).optional() }),
])
const knownErrors = new Set([
  'DeviceNotRegistered',
  'MessageTooBig',
  'MessageRateExceeded',
  'MismatchSenderId',
  'InvalidCredentials',
])
function normalize(value: z.infer<typeof outcomeSchema>): PushOutcome {
  if (value.status === 'ok') return value
  const code = value.details?.error ?? 'UnknownProviderError'
  return { status: 'error', code: knownErrors.has(code) ? code : 'UnknownProviderError' }
}

/** No raw provider error bodies, token strings, or notification content in logs. */
export function reminderTransport(message: {
  title: string
  body: string
  data: Record<string, string>
  expiresAt: Date
}): ReminderTransport {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(process.env.EXPO_ACCESS_TOKEN
      ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
      : {}),
  }
  return {
    async send(tokens) {
      try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify(
            tokens.map(({ id, token }) => ({
              to: token,
              title: message.title,
              body: message.body,
              data: {
                ...message.data,
                notificationId: `${message.data.reminderId}:${message.expiresAt.toISOString()}:${id}`,
              },
              expiration: Math.floor(message.expiresAt.getTime() / 1000),
              sound: 'default',
              channelId: 'default',
            })),
          ),
        })
        if (!response.ok)
          return tokens.map(() => ({
            status: 'error' as const,
            code:
              response.status === 429 || response.status >= 500
                ? 'ProviderUnavailable'
                : 'InvalidRequest',
          }))
        const parsed = z.object({ data: z.array(outcomeSchema) }).safeParse(await response.json())
        if (!parsed.success || parsed.data.data.length !== tokens.length) {
          return tokens.map(() => ({ status: 'error' as const, code: 'MalformedResponse' }))
        }
        return parsed.data.data.map(normalize)
      } catch {
        // A timeout or truncated body may occur AFTER provider acceptance.
        // Do not blindly resend an ambiguous request and duplicate the alert.
        return tokens.map(() => ({ status: 'error' as const, code: 'UnknownAcceptance' }))
      }
    },
    async receipts(ids) {
      try {
        const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ids }),
          signal: AbortSignal.timeout(8000),
        })
        if (!response.ok) return {}
        const parsed = z.object({ data: z.record(outcomeSchema) }).safeParse(await response.json())
        if (!parsed.success) return {}
        return Object.fromEntries(
          ids
            .filter((id) => parsed.data.data[id])
            .map((id) => [id, normalize(parsed.data.data[id])]),
        )
      } catch {
        return {}
      }
    },
  }
}
