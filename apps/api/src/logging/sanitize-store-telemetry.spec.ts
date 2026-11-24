import { sanitizeStoreTelemetry } from './sanitize-store-telemetry'

it('handles request/socket and array cycles while retaining redaction', () => {
  const request: Record<string, unknown> = { authorization: 'private-cycle-secret' }
  const socket = { request }
  request.socket = socket
  const array: unknown[] = [request]
  array.push(array)
  const output = sanitizeStoreTelemetry({ request, array })
  expect(() => JSON.stringify(output)).not.toThrow()
  expect(JSON.stringify(output)).toContain('[Circular]')
  expect(JSON.stringify(output)).not.toContain('private-cycle-secret')
  expect(request.socket).toBe(socket)
})

it('bounds deeply nested non-cyclic input without exposing the omitted subtree', () => {
  let input: unknown = { authorization: 'private-deep-secret' }
  for (let i = 0; i < 10_000; i++) input = { nested: input }
  const output = JSON.stringify(sanitizeStoreTelemetry(input))
  expect(output).toContain('[Truncated]')
  expect(output).not.toContain('private-deep-secret')
})

it('sanitizes repeated shared objects independently instead of mutating or dropping them', () => {
  const shared = { status: 'active', authorization: 'private-shared-secret' }
  expect(sanitizeStoreTelemetry({ first: shared, second: shared })).toEqual({
    first: { status: 'active', authorization: '[REDACTED]' },
    second: { status: 'active', authorization: '[REDACTED]' },
  })
  expect(shared.authorization).toBe('private-shared-secret')
})

it('fails closed when telemetry contains a throwing getter', () => {
  const input = Object.defineProperty({}, 'data', {
    enumerable: true,
    get() { throw new Error('private-getter-secret') },
  })
  expect(sanitizeStoreTelemetry(input)).toBeNull()
})

it('does not execute serialization hooks or retain non-JSON values', () => {
  const toJSON = jest.fn(() => ({ authorization: 'private-hook-secret' }))
  const output = sanitizeStoreTelemetry({ toJSON, bigint: BigInt(1), symbol: Symbol('private-symbol') })
  expect(() => JSON.stringify(output)).not.toThrow()
  expect(JSON.stringify(output)).not.toContain('private')
  expect(toJSON).not.toHaveBeenCalled()
})

it('bounds wide arrays and objects without evaluating getters past the budget', () => {
  const output = sanitizeStoreTelemetry(Array(20_000).fill(0)) as unknown[]
  expect(output.length).toBeLessThanOrEqual(10_000)
  expect(output.at(-1)).toBe('[Truncated]')
  const getter = jest.fn(() => 'private-unvisited-value')
  const object = Object.fromEntries(Array.from({ length: 10_000 }, (_, i) => [String(i), 0]))
  Object.defineProperty(object, 'last', { enumerable: true, get: getter })
  expect(JSON.stringify(sanitizeStoreTelemetry(object))).toContain('[Truncated]')
  expect(getter).not.toHaveBeenCalled()
})

it('consumes the node budget when a wide array reaches the depth limit', () => {
  let input: unknown = Array(20_000).fill('private-depth-secret')
  for (let i = 0; i < 39; i++) input = { nested: input }
  let output = sanitizeStoreTelemetry(input)
  for (let i = 0; i < 39; i++) output = (output as { nested: unknown }).nested
  expect(Array.isArray(output)).toBe(true)
  expect((output as unknown[]).length).toBeLessThanOrEqual(10_000)
  expect(JSON.stringify(output)).not.toContain('private-depth-secret')
})

it.each(['/clubs/team/plan/store/verify', '/billing/webhooks/apple', '/billing/webhooks/google'])(
  'redacts serialized store request bodies in every telemetry hook for %s', (path) => {
    const request = { url: `https://api.example.com${path}`, data: '{"purchaseToken":"private-store-secret"}', body: 'private-store-secret', rawBody: 'private-store-secret' }
    const output = sanitizeStoreTelemetry({ request, spans: [{ request }] })
    expect(JSON.stringify(output)).not.toContain('private-store-secret')
    expect(request.data).toContain('private-store-secret')
  },
)

it.each(['{"idToken":"synthetic-secret"}', 'idToken=synthetic-secret', { idToken: 'synthetic-secret' }])(
  'removes serialized and structured OAuth request bodies from events and transactions', (data) => {
    const request = { url: 'https://api.example.com/auth/oauth/google', data, body: data, rawBody: data }
    const output = sanitizeStoreTelemetry({ request, spans: [{ request }] })
    expect(JSON.stringify(output)).not.toContain('synthetic-secret')
    expect(request.data).toEqual(data)
  },
)

it.each(['purchaseToken', 'signedPayload', 'signedTransactionInfo', 'signedRenewalInfo', 'sealedReference', 'authorization', 'cookie', 'reference',
  'idToken', 'id_token', 'authorizationCode', 'client_secret', 'refresh_token', 'sealedRefreshToken', 'nonce', 'ticket', 'code'])(
  'redacts %s regardless of field casing, including nested arrays', (field) => {
    const variants = [field, field.toLowerCase(), field.toUpperCase()]
    const input = variants.map((key) => ({ nested: { [key]: 'private-verification-value', status: 'active' } }))
    const output = sanitizeStoreTelemetry(input)
    expect(output).toEqual(variants.map((key) => ({ nested: { [key]: '[REDACTED]', status: 'active' } })))
    expect(JSON.stringify(input)).toContain('private-verification-value')
  },
)

it('redacts purchase verification payloads and Google token URL paths, including spans', () => {
  const input = {
    request: { headers: { Authorization: 'Bearer secret' }, data: { reference: 'secret-token', signedPayload: 'jws-secret' } },
    spans: [{ description: 'GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.renuirug.anstoss/purchases/subscriptionsv2/tokens/secret-token' }],
  }
  const output = JSON.stringify(sanitizeStoreTelemetry(input))
  expect(output).not.toContain('secret')
  expect(output).toContain('[REDACTED]')
  expect(input.request.data.reference).toBe('secret-token')
})
