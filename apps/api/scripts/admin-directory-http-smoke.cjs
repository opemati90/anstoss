// Real HTTP/auth/database coverage, restricted to an isolated loopback test DB.
require('reflect-metadata')
const assert = require('node:assert/strict')
const { randomBytes, randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NestFactory } = require('@nestjs/core')

async function main() {
  const target = new URL(process.env.DIRECTORY_TEST_DATABASE_URL || '')
  assert.equal(target.hostname, '127.0.0.1')
  assert.ok(target.pathname.endsWith('_test'))
  for (const key of Object.keys(process.env))
    assert.ok(
      !/^(RESEND_|STRIPE_|R2_|SENTRY_|UPSTASH_|REDIS_URL|AUTH_|ADMIN_)/.test(key),
      `External configuration: ${key}`,
    )
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = target.toString()
  process.env.AUTH_JWT_SECRET = randomBytes(48).toString('hex')
  process.env.AUTH_OTP_PEPPER = randomBytes(48).toString('hex')
  // Deliberately public QA-only key. This server binds loopback, never production.
  process.env.ADMIN_API_KEY = 'directory-local-qa-not-a-production-key'
  process.env.LOG_LEVEL = 'silent'
  const { AppModule } = require('../dist/app.module')
  const { signSessionToken } = require('../dist/auth/otp/jwt.util')
  const db = new PrismaClient()
  const prefix = `directory-${randomUUID()}`
  const clubIds = [0, 1, 2].map((i) => `${prefix}-club-${i}`)
  const userIds = Array.from({ length: 39 }, (_, i) => `${prefix}-user-${i}`)
  const teamIds = [0, 1, 2].map((i) => `${prefix}-team-${i}`)
  let app
  try {
    for (let i = 0; i < 3; i++)
      await db.club.create({
        data: {
          id: clubIds[i],
          name: ['QA Spreewiese', 'QA Nordstern', 'QA New club'][i],
          city: 'Berlin',
          slug: `${prefix}-${i}`,
        },
      })
    for (let i = 0; i < 2; i++)
      await db.teamGroup.create({
        data: {
          id: `${prefix}-group-${i}`,
          clubId: clubIds[i],
          type: 'SENIOR',
          displayName: 'Senior teams',
        },
      })
    for (let i = 0; i < 3; i++)
      await db.team.create({
        data: {
          id: teamIds[i],
          clubId: clubIds[i === 1 ? 1 : 0],
          groupId: `${prefix}-group-${i === 1 ? 1 : 0}`,
          name: `Team ${i}`,
          displayName: ['First team', 'Second team', 'New team'][i],
        },
      })
    await db.user.createMany({
      data: userIds.map((id, i) => ({
        id,
        name:
          i < 32
            ? `QA Player ${String(i + 1).padStart(2, '0')}`
            : [
                'QA Coach',
                'QA Club owner',
                'QA Free-agent player',
                'QA Platform admin',
                'QA Deleted player',
                'QA Revoked player',
                'QA Free-agent coach',
              ][i - 32],
        email: `${id}@example.invalid`,
        adultConfirmedAt: new Date(),
        registrationRole: [34, 38].includes(i) ? 'FREE_AGENT' : 'PLAYER',
        platformRole: i === 35 ? 'PLATFORM_ADMIN' : 'NONE',
        deletedAt: i === 36 ? new Date() : null,
      })),
    })
    for (let i = 0; i < 39; i++) {
      if ([34, 35, 38].includes(i)) continue
      const clubId = clubIds[i === 31 ? 1 : 0]
      await db.membership.create({
        data: {
          userId: userIds[i],
          clubId,
          role: i === 32 ? 'COACH' : i === 33 ? 'OWNER' : 'PLAYER',
        },
      })
      if (i === 33) continue
      await db.teamAccess.create({
        data: {
          userId: userIds[i],
          clubId,
          teamId: teamIds[i === 31 ? 1 : 0],
          role: i === 32 ? 'HEAD_COACH' : 'PLAYER',
          status: i === 37 ? 'REVOKED' : 'ACTIVE',
        },
      })
    }
    for (const i of [34, 38])
      await db.freeAgentProfile.create({
        data: { userId: userIds[i], recruitmentRole: i === 38 ? 'COACH' : 'PLAYER' },
      })
    await db.teamAccess.create({ data: { userId: userIds[0], clubId: clubIds[0], teamId: teamIds[0], role: 'PARENT', status: 'ACTIVE' } })
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
    await app.listen(process.env.DIRECTORY_QA_SERVE ? 3178 : 0, '127.0.0.1')
    const base = await app.getUrl()
    const headers = { 'X-Admin-Key': process.env.ADMIN_API_KEY }
    const get = async (params) => {
      const response = await fetch(`${base}/admin/directory?${new URLSearchParams(params)}`, {
        headers,
      })
      assert.equal(response.status, 200)
      return response.json()
    }
    assert.equal((await fetch(`${base}/admin/directory`)).status, 401)
    assert.equal(
      (
        await fetch(`${base}/admin/directory`, {
          headers: { Authorization: `Bearer ${signSessionToken(userIds[0])}` },
        })
      ).status,
      401,
    )
    for (const params of [
      { limit: 101 },
      { offset: -1 },
      { limit: 'NaN' },
      { kind: 'unknown' },
      { kind: 'clubs', state: 'deleted' },
      { search: 'a'.repeat(121) },
    ]) {
      assert.equal(
        (await fetch(`${base}/admin/directory?${new URLSearchParams(params)}`, { headers })).status,
        400,
      )
    }
    const first = await get({ kind: 'players', clubId: clubIds[0], state: 'active', limit: 25 })
    const second = await get({
      kind: 'players',
      clubId: clubIds[0],
      state: 'active',
      limit: 25,
      offset: 25,
    })
    assert.equal(first.total, 32)
    assert.equal(first.rows.length, 25)
    assert.equal(second.rows.length, 7)
    assert.equal(new Set([...first.rows, ...second.rows].map((r) => r.id)).size, 32)
    const team = await get({ kind: 'players', teamId: teamIds[0], state: 'active' })
    assert.equal(team.total, 31) // Revoked access is not current squad membership.
    const memberCount = await get({ kind: 'teams', teamId: teamIds[0] })
    assert.equal(memberCount.rows[0]._count.access, 32) // Unique people; excludes deleted account, not multiple roles.
    assert.equal((await get({ kind: 'players', clubId: clubIds[1], teamId: teamIds[0] })).total, 0)
    assert.equal(
      (await get({ kind: 'teams', clubId: clubIds[0], state: 'empty' })).rows[0].id,
      teamIds[2],
    )
    assert.equal(
      (await get({ kind: 'clubs', search: prefix, state: 'empty' })).rows[0].id,
      clubIds[2],
    )
    assert.equal((await get({ kind: 'users', search: prefix, role: 'coach' })).total, 2)
    assert.equal((await get({ kind: 'users', search: prefix, role: 'club_admin' })).total, 1)
    assert.equal((await get({ kind: 'users', search: prefix, role: 'free_agent' })).total, 2)
    assert.equal((await get({ kind: 'users', search: prefix, role: 'platform_admin' })).total, 1)
    assert.equal((await get({ kind: 'players', search: prefix })).total, 35)
    assert.equal((await get({ kind: 'players', search: prefix, state: 'deleted' })).total, 1)
    const exact = await get({ kind: 'users', search: `${userIds[33]}@example.invalid` })
    assert.equal(exact.total, 1)
    assert.equal(exact.rows[0].memberships[0].role, 'OWNER')
    assert.ok(!Object.hasOwn(exact.rows[0], 'dateOfBirth'))
    console.log(
      'PASS: directory HTTP auth, validation, server paging, linked club/team filters, roles, deleted state and revoked access',
    )
    if (process.env.DIRECTORY_QA_SERVE) {
      console.log('Local browser QA API ready at http://127.0.0.1:3178; synthetic fixtures only')
      await new Promise((resolve) => {
        process.once('SIGINT', resolve)
        process.once('SIGTERM', resolve)
      })
    }
  } finally {
    if (app) await app.close()
    await db.club.deleteMany({ where: { id: { in: clubIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.$disconnect()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
