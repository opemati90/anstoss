const SENSITIVE_FIELDS = new Set([
  'authorization', 'cookie', 'reference', 'purchasetoken', 'signedpayload',
  'signedtransactioninfo', 'signedrenewalinfo', 'sealedreference',
  'idtoken', 'id_token', 'authorizationcode', 'client_secret', 'refresh_token',
  'sealedrefreshtoken', 'nonce', 'ticket', 'code',
])

/** Google puts purchase tokens in URL paths; instrumentation must not retain them. */
export function sanitizeStoreTelemetry(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/(\/purchases\/(?:subscriptionsv2|subscriptions\/[^/]+)\/tokens\/)[^\s?"<>]+/g, '$1[REDACTED]')
  if (Array.isArray(value)) return value.map(sanitizeStoreTelemetry)
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  const sensitiveRequest = typeof record.url === 'string' && /\/auth\/(?:oauth|otp)(?:\/|\?|$)/.test(record.url)
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
    SENSITIVE_FIELDS.has(key.toLowerCase()) ||
      (sensitiveRequest && ['data', 'body', 'rawbody'].includes(key.toLowerCase()))
      ? '[REDACTED]' : sanitizeStoreTelemetry(child),
  ]))
}
