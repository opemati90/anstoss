// Real HTTP/auth/Postgres; Expo transport is captured, NOT a physical push test.
require('reflect-metadata')
const assert = require('node:assert/strict')
const { randomBytes, randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NestFactory } = require('@nestjs/core')

async function main() {
  const target = new URL(process.env.PUSH_TEST_DATABASE_URL || '')
  assert.equal(target.hostname, '127.0.0.1')
  assert.ok(target.pathname.endsWith('_test'))
  for (const key of Object.keys(process.env)) {
    assert.ok(
      !/^(RESEND_|STRIPE_|R2_|SENTRY_|UPSTASH_|REDIS_URL|AUTH_|ADMIN_)/.test(key),
      `External configuration: ${key}`,
    )
  }
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: target.toString(),
    LOG_LEVEL: 'silent',
    AUTH_JWT_SECRET: randomBytes(48).toString('hex'),
    AUTH_OTP_PEPPER: randomBytes(48).toString('hex'),
  })
  const { AppModule } = require('../dist/app.module')
  const { PushService } = require('../dist/push/push.service')
  const { signSessionToken } = require('../dist/auth/otp/jwt.util')
  const db = new PrismaClient()
  const roles = ['PLAYER', 'COACH', 'FREE_AGENT', 'CLUB_ADMIN']
  const ids = roles.map(() => `push-http-${randomUUID()}`)
  const tokens = ids.map((id) => `ExponentPushToken[${id}]`)
  const nativeFetch = global.fetch
  const deliveries = []
  let app
  try {
    await db.user.createMany({
      data: ids.map((id, index) => ({
        id,
        name: `Push QA ${roles[index]}`,
        registrationRole: roles[index],
        dateOfBirth: new Date('1990-05-23'),
        preferredLanguage: 'en',
      })),
    })
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
    await app.listen(0, '127.0.0.1')
    const base = await app.getUrl()
    // No other network destinations allowed, even if a future module changes.
    global.fetch = async (url, options) => {
      if (url === 'https://exp.host/--/api/v2/push/send') {
        const messages = JSON.parse(options.body)
        deliveries.push(...messages)
        return new Response(
          JSON.stringify({ data: messages.map(() => ({ status: 'ok', id: randomUUID() })) }),
        )
      }
      assert.ok(String(url).startsWith(`${base}/`), 'Unexpected external request')
      return nativeFetch(url, options)
    }
    const headers = (id) => ({
      Authorization: `Bearer ${signSessionToken(id)}`,
      'Content-Type': 'application/json',
    })
    const request = (id, path, method = 'GET', body) =>
      fetch(`${base}${path}`, {
        method,
        headers: headers(id),
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    assert.equal((await fetch(`${base}/push/register`, { method: 'POST' })).status, 401)
    assert.equal(
      (await request(ids[0], '/push/register', 'POST', { token: 'invalid', platform: 'ios' }))
        .status,
      422,
    )
    const push = app.get(PushService)
    for (const [index, id] of ids.entries()) {
      const platform = index % 2 ? 'android' : 'ios'
      assert.equal(
        (await request(id, '/push/register', 'POST', { token: tokens[index], platform })).status,
        201,
      )
      await push.sendToUserLocalized(
        id,
        'JOIN_APPROVED',
        { clubName: 'QA only' },
        { type: 'join_approved' },
      )
      const inbox = await (await request(id, '/me/notifications')).json()
      assert.equal(inbox.items.length, 1)
      assert.equal(inbox.unreadCount, 1)
      assert.equal(deliveries[index].to, tokens[index])
      assert.equal(deliveries[index].channelId, 'default')
      assert.equal(deliveries[index].data.type, 'join_approved')
      // Another account cannot mark this notification read.
      assert.equal(
        (
          await request(
            ids[(index + 1) % ids.length],
            `/me/notifications/${inbox.items[0].id}/read`,
            'POST',
          )
        ).status,
        404,
      )
      assert.equal(
        (await request(id, `/me/notifications/${inbox.items[0].id}/read`, 'POST')).status,
        200,
      )
      assert.deepEqual(await (await request(id, '/me/notifications/unread-count')).json(), {
        unreadCount: 0,
      })
    }
    // Token reassignment is single-owner; old-account logout must not delete it.
    await request(ids[1], '/push/register', 'POST', { token: tokens[0], platform: 'ios' })
    await request(ids[0], '/push/unregister', 'DELETE', { token: tokens[0] })
    assert.equal((await db.pushToken.findUnique({ where: { token: tokens[0] } })).userId, ids[1])
    await request(ids[1], '/push/unregister', 'DELETE', { token: tokens[0] })
    assert.equal(await db.pushToken.findUnique({ where: { token: tokens[0] } }), null)
    console.log(
      'PASS: player/coach/free-agent/admin registration, Expo payload transport, inbox, ownership, read state, token reassignment and logout. Physical delivery NOT tested.',
    )
  } finally {
    global.fetch = nativeFetch
    if (app) await app.close()
    await db.user.deleteMany({ where: { id: { in: ids } } })
    await db.$disconnect()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
