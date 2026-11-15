// Runs the compiled API, actual auth/validation and database on loopback only.
// Build first. No provider configuration or production database is accepted.
require('reflect-metadata')
const assert = require('node:assert/strict')
const { randomBytes, randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NestFactory } = require('@nestjs/core')

async function main() {
  const target = new URL(process.env.SUPPORT_TEST_DATABASE_URL || '')
  assert.equal(target.hostname, '127.0.0.1')
  assert.ok(target.pathname.endsWith('_test'))
  for (const key of Object.keys(process.env)) {
    assert.ok(
      !/^(RESEND_|STRIPE_|R2_|SENTRY_|UPSTASH_|REDIS_URL|AUTH_|ADMIN_)/.test(key),
      `External configuration: ${key}`,
    )
  }
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = target.toString()
  process.env.AUTH_JWT_SECRET = randomBytes(48).toString('hex')
  process.env.AUTH_OTP_PEPPER = randomBytes(48).toString('hex')
  process.env.ADMIN_API_KEY = randomBytes(48).toString('hex')
  process.env.LOG_LEVEL = 'silent'
  const { AppModule } = require('../dist/app.module')
  const { signSessionToken } = require('../dist/auth/otp/jwt.util')
  const db = new PrismaClient()
  const ids = [randomUUID(), randomUUID()].map((id) => `support-http-${id}`)
  let app
  let ticketId
  try {
    await db.user.createMany({
      data: ids.map((id) => ({ id, name: 'Support HTTP QA', adultConfirmedAt: new Date() })),
    })
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
    await app.listen(0, '127.0.0.1')
    const base = await app.getUrl()
    const headers = (id) => ({
      Authorization: `Bearer ${signSessionToken(id)}`,
      'Content-Type': 'application/json',
    })
    const staff = { 'X-Admin-Key': process.env.ADMIN_API_KEY, 'Content-Type': 'application/json' }
    assert.equal((await fetch(`${base}/me/support`)).status, 401)
    assert.equal(
      (await fetch(`${base}/admin/support-tickets`, { headers: headers(ids[0]) })).status,
      401,
    )
    const invalid = await fetch(`${base}/me/support`, {
      method: 'POST',
      headers: headers(ids[0]),
      body: JSON.stringify({ subject: 'x' }),
    })
    assert.equal(invalid.status, 422)
    const response = await fetch(`${base}/me/support`, {
      method: 'POST',
      headers: headers(ids[0]),
      body: JSON.stringify({
        requestId: randomUUID(),
        category: 'BUG',
        subject: 'Keyboard HTTP QA',
        body: 'Keyboard history test report.',
        platform: 'ios',
      }),
    })
    assert.equal(response.status, 201)
    const created = await response.json()
    ticketId = created.id
    assert.ok(ticketId)
    assert.equal(created.messages.length, 1)
    assert.equal(
      (await fetch(`${base}/me/support/${ticketId}`, { headers: headers(ids[1]) })).status,
      404,
    )
    const inbox = await (await fetch(`${base}/admin/support-tickets`, { headers: staff })).json()
    assert.ok(inbox.some((ticket) => ticket.id === ticketId))
    const reply = await fetch(`${base}/admin/support-tickets/${ticketId}/replies`, {
      method: 'POST',
      headers: staff,
      body: JSON.stringify({ requestId: randomUUID(), body: 'Please test the next build.' }),
    })
    assert.equal(reply.status, 201)
    const detail = await (
      await fetch(`${base}/me/support/${ticketId}`, { headers: headers(ids[0]) })
    ).json()
    assert.equal(detail.status, 'WAITING')
    assert.equal(detail.messages.length, 2)
    assert.equal(detail.messages[1].fromSupport, true)
    console.log(
      'Support HTTP smoke passed: boot, app/admin auth, validation, ownership, inbox and reply',
    )
  } finally {
    if (app) await app.close()
    if (ticketId)
      await db.auditLog.deleteMany({
        where: { metadata: { path: ['ticketId'], equals: ticketId } },
      })
    await db.user.deleteMany({ where: { id: { in: ids } } })
    await db.$disconnect()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
