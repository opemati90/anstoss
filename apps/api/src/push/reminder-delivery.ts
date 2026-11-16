import { z } from 'zod'

const MINUTE = 60_000
export const RECEIPT_WAIT_MS = 15 * MINUTE
const RECEIPT_TIMEOUT_MS = 20 * MINUTE
const MAX_ATTEMPTS = 5
const deliverySchema = z.object({
  tokenId: z.string(),
  status: z.enum(['pending', 'receipt', 'accepted', 'failed', 'unknown']),
  attempts: z.number().int().min(0).max(MAX_ATTEMPTS),
  nextAt: z.number(),
  attemptedAt: z.number().optional(),
  ticketId: z.string().optional(),
  receiptDeadline: z.number().optional(),
  error: z.string().optional(),
})
const stateSchema = z.object({ eventDate: z.string(), devices: z.array(deliverySchema).max(100) })
export function hasPendingReminderReceipts(saved: unknown): boolean {
  const parsed = stateSchema.safeParse(saved)
  return parsed.success && parsed.data.devices.some((row) => row.status === 'receipt')
}
type DeviceDelivery = z.infer<typeof deliverySchema>
export type ReminderDeliveryState = z.infer<typeof stateSchema>
export type PushOutcome = { status: 'ok'; id?: string } | { status: 'error'; code: string }
export interface ReminderTransport {
  send(tokens: { id: string; token: string }[]): Promise<PushOutcome[]>
  receipts(ids: string[]): Promise<Record<string, PushOutcome>>
}

const terminal = (row: DeviceDelivery) => ['accepted', 'failed', 'unknown'].includes(row.status)
const retryable = (code: string) =>
  ['MessageRateExceeded', 'ProviderUnavailable', 'NetworkError'].includes(code)

function failed(row: DeviceDelivery, code: string, now: number): DeviceDelivery {
  const retry = retryable(code) && row.attempts < MAX_ATTEMPTS
  return {
    tokenId: row.tokenId,
    attempts: row.attempts,
    error: code,
    status: ['UnknownAcceptance', 'MalformedResponse'].includes(code)
      ? 'unknown'
      : retry
        ? 'pending'
        : 'failed',
    nextAt: now + Math.min(8 * MINUTE, MINUTE * 2 ** Math.max(0, row.attempts - 1)),
  }
}

/** Persist the returned state in the locked preference transaction. Restarting
 * a worker resumes receipt polling instead of blindly resending accepted pushes.
 * 'accepted' means APNs/FCM accepted it, NEVER that the phone displayed it.
 */
export async function advanceReminderDelivery(input: {
  saved: unknown
  eventDate: Date
  now: number
  tokens: { id: string; token: string }[]
  canSend: boolean
  transport: ReminderTransport
}): Promise<{
  state: ReminderDeliveryState
  complete: boolean
  nextAt: Date
  deadTokens: { id: string; attemptedAt: number }[]
}> {
  const { now, eventDate, tokens, transport, canSend } = input
  const parsed = stateSchema.safeParse(input.saved)
  // An opted-in rescheduled event is a new notification, not an old receipt.
  const previous =
    parsed.success && parsed.data.eventDate === eventDate.toISOString() ? parsed.data.devices : []
  let devices: DeviceDelivery[] = tokens.map(
    (token) =>
      previous.find((row) => row.tokenId === token.id) ?? {
        tokenId: token.id,
        status: 'pending',
        attempts: 0,
        nextAt: now,
      },
  )
  const deadTokens: { id: string; attemptedAt: number }[] = []
  const waiting = devices.filter(
    (row) => row.status === 'receipt' && row.ticketId && row.nextAt <= now,
  )
  const receipts = waiting.length
    ? await transport.receipts(waiting.map((row) => row.ticketId!))
    : {}
  devices = devices.map((row) => {
    if (!waiting.includes(row)) return row
    const receipt = receipts[row.ticketId!]
    if (receipt?.status === 'ok') return { ...row, status: 'accepted' }
    if (receipt?.status === 'error') {
      if (receipt.code === 'DeviceNotRegistered' && row.attemptedAt !== undefined) {
        deadTokens.push({ id: row.tokenId, attemptedAt: row.attemptedAt })
      }
      return failed(row, receipt.code, now)
    }
    // Missing receipts are ambiguous. Re-poll durably, then stop without
    // resending an already accepted notification and causing a duplicate.
    return {
      ...row,
      status: now >= (row.receiptDeadline ?? now) ? 'unknown' : 'receipt',
      nextAt: now + MINUTE,
    }
  })
  if (now >= eventDate.getTime()) {
    devices = devices.map((row) =>
      row.status === 'pending' ? { ...row, status: 'failed', error: 'EventExpired' } : row,
    )
  }
  const sending =
    canSend && now < eventDate.getTime()
      ? devices.filter((row) => row.status === 'pending' && row.nextAt <= now)
      : []
  if (sending.length) {
    const outcomes = await transport.send(
      sending.map((row) => tokens.find((token) => token.id === row.tokenId)!),
    )
    devices = devices.map((row) => {
      const index = sending.indexOf(row)
      if (index < 0) return row
      const attempted = { ...row, attempts: row.attempts + 1, attemptedAt: now }
      const result = outcomes[index]
      if (result?.status === 'ok' && result.id)
        return {
          ...attempted,
          status: 'receipt',
          ticketId: result.id,
          nextAt: now + RECEIPT_WAIT_MS,
          receiptDeadline: now + RECEIPT_TIMEOUT_MS,
        }
      const code = result?.status === 'error' ? result.code : 'MalformedResponse'
      if (code === 'DeviceNotRegistered') deadTokens.push({ id: row.tokenId, attemptedAt: now })
      return failed(attempted, code, now)
    })
  }
  const pending = devices.filter((row) => !terminal(row))
  return {
    state: { eventDate: eventDate.toISOString(), devices },
    complete: devices.length > 0 && pending.length === 0,
    nextAt: new Date(
      Math.max(
        now + MINUTE,
        pending.length ? Math.min(...pending.map((row) => row.nextAt)) : now + MINUTE,
      ),
    ),
    deadTokens,
  }
}
