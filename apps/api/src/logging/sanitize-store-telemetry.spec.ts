import { sanitizeStoreTelemetry } from './sanitize-store-telemetry'

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
