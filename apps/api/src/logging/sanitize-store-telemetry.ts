const SENSITIVE_FIELDS = new Set([
  'authorization', 'cookie', 'reference', 'purchasetoken', 'signedpayload',
  'signedtransactioninfo', 'signedrenewalinfo', 'sealedreference',
  'idtoken', 'id_token', 'authorizationcode', 'client_secret', 'refresh_token',
  'sealedrefreshtoken', 'nonce', 'ticket', 'code',
])

/** Google puts purchase tokens in URL paths; instrumentation must not retain them. */
export function sanitizeStoreTelemetry(value: unknown): unknown {
  const ancestors = new WeakSet<object>()
  let remaining = 10_000
  function visit(child: unknown, depth: number): unknown {
    // Telemetry can contain request/socket cycles or arbitrarily deep SDK data.
    // Bound the work and never return an unsanitized subtree on exhaustion.
    if (remaining-- <= 0 || depth >= 40) return '[Truncated]'
    if (typeof child === 'string') return child.replace(/(\/purchases\/(?:subscriptionsv2|subscriptions\/[^/]+)\/tokens\/)[^\s?"<>]+/g, '$1[REDACTED]')
    // Do not retain executable toJSON hooks, or non-JSON SDK values.
    if (typeof child === 'function' || typeof child === 'symbol' || typeof child === 'bigint') return '[Unsupported]'
    if (!child || typeof child !== 'object') return child
    if (ancestors.has(child)) return '[Circular]'
    ancestors.add(child)
    try {
      if (Array.isArray(child)) {
        const output: unknown[] = []
        for (let index = 0; index < child.length; index++) {
          if (remaining <= 0) { output.push('[Truncated]'); break }
          output.push(visit(child[index], depth + 1))
        }
        return output
      }
      const record = child as Record<string, unknown>
      const sensitiveRequest = typeof record.url === 'string' && /\/auth\/(?:oauth|otp)(?:\/|\?|$)|\/plan\/store|\/billing\/webhooks\/(?:apple|google)/.test(record.url)
      const entries: [string, unknown][] = []
      for (const key in record) {
        if (!Object.prototype.hasOwnProperty.call(record, key)) continue
        if (remaining <= 0) { entries.push(['[Truncated]', '[Truncated]']); break }
        if (SENSITIVE_FIELDS.has(key.toLowerCase()) ||
          (sensitiveRequest && ['data', 'body', 'rawbody'].includes(key.toLowerCase()))) {
          remaining--
          entries.push([key, '[REDACTED]'])
        } else {
          entries.push([key, visit(record[key], depth + 1)])
        }
      }
      return Object.fromEntries(entries)
    } finally {
      ancestors.delete(child)
    }
  }
  try {
    return visit(value, 0)
  } catch {
    // A throwing getter/proxy must not break error reporting or expose secrets.
    return null
  }
}
