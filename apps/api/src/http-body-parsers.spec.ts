import express, { type Request } from 'express'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { defaultHttpBodyParsers, httpBodyParsers } from './http-body-parsers'

type RawRequest = Request & { rawBody?: Buffer }

function makeApp() {
  const app = express()
  app.post('/clubs/:clubId/contributions/imports', ...httpBodyParsers())
  app.use(...defaultHttpBodyParsers())
  app.post('/clubs/:clubId/contributions/imports', (req: RawRequest, res) => {
    res.json({ encodedLength: req.body.contentBase64.length, rawLength: req.rawBody?.length })
  })
  app.post('/clubs/:clubId/contributions/imports/matches/confirm', (_req, res) => {
    res.json({ ok: true })
  })
  app.post('/billing/webhooks/stripe', (req: RawRequest, res) => {
    res.json({ raw: req.rawBody?.toString('utf8') })
  })
  return app
}

async function postJson(path: string, body: unknown) {
  const app = makeApp()
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  const payload = JSON.stringify(body)
  try {
    return await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request(
        { hostname: '127.0.0.1', port, path, method: 'POST', headers: {
          'content-type': 'application/json', 'content-length': Buffer.byteLength(payload),
        } },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }))
        },
      )
      req.on('error', reject)
      req.end(payload)
    })
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

describe('HTTP body parser boundaries', () => {
  it('accepts the 10 MB decoded bank-file envelope on the exact import route', async () => {
    const contentBase64 = Buffer.alloc(10 * 1024 * 1024).toString('base64')
    const response = await postJson('/clubs/c1/contributions/imports', { contentBase64 })
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body).encodedLength).toBe(contentBase64.length)
  })

  it('keeps descendant import actions at the 100 KB default', async () => {
    const response = await postJson('/clubs/c1/contributions/imports/matches/confirm', {
      padding: 'x'.repeat(110 * 1024),
    })
    expect(response.status).toBe(413)
  })

  it('rejects an envelope above the scoped 15 MB transport ceiling', async () => {
    const response = await postJson('/clubs/c1/contributions/imports', {
      contentBase64: 'x'.repeat(16 * 1024 * 1024),
    })
    expect(response.status).toBe(413)
  })

  it('preserves the exact raw JSON body required by Stripe verification', async () => {
    const payload = { id: 'evt_123', type: 'invoice.paid' }
    const response = await postJson('/billing/webhooks/stripe', payload)
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body).raw).toBe(JSON.stringify(payload))
  })
})
