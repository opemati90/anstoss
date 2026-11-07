// Opt-in, production HTTP smoke test. Creates only an isolated synthetic club
// and four synthetic adults; never signs in as, or mutates, a real member.
// OTP delivery and physical-device push/media playback are NOT covered.
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { signSessionToken } = require('../dist/auth/otp/jwt.util.js')

const repo = '/Users/yemi/anstoss'
const base = 'https://api.anstoss.io'
const service = '373adb45-3ab1-4076-b2b9-72f1590ba1b3'
const environment = 'c6651cfe-f78d-4c06-aefd-634f5933cc22'
const args = process.argv.slice(2)
const resumeAttendance = args[1] === '--resume-attendance'
const prefix = resumeAttendance ? args[2] : `mvp-qa-${randomUUID()}`
const ids = Object.fromEntries(['admin', 'coach', 'player', 'outsider'].map(role => [role, `${prefix}-${role}`]))
const clubId = `${prefix}-club`
const teamId = `${prefix}-team`
const channelId = `${prefix}-channel`
const ownedKeys = []
let db
let stage = 'preflight'
let created = false
let lastHttp
let mediaStep
let lastStorageStatus

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
function config(...args) {
  return JSON.parse(execFileSync('/opt/homebrew/bin/railway', args, {
    cwd: repo, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, RAILWAY_CALLER: 'skill:use-railway@1.3.7', RAILWAY_AGENT_SESSION: 'anstoss-mvp-20261106' },
  }))
}

async function main() {
  assert(args[0] === '--production-synthetic-only')
  assert(args.length === 1 || (resumeAttendance && args.length === 3))
  assert(/^mvp-qa-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(prefix))
  assert.equal(config('status', '--json').id, 'fc1f6c05-d556-48ad-bc8c-a59b4e7a99b4')
  const api = config('variable', 'list', '--service', service, '--environment', environment, '--json')
  const database = config('variable', 'list', '--service', 'a04d6695-4b78-42c2-947c-0713337a7762', '--environment', environment, '--json')
  assert.equal(api.ANSTOSS_MIGRATION_MAINTENANCE, 'false')
  assert.equal(api.PRIVATE_V1_UPLOAD_RESERVATIONS, 'true')
  assert.notEqual(api.PRIVATE_UPLOAD_CLEANUP_ENABLED, 'true')
  assert.notEqual(api.MEDIA_CUTOVER_FREEZE, 'true')
  assert.notEqual(api.ACCOUNT_MEDIA_DELETION_DISABLED, 'true')
  const a = new URL(api.DATABASE_URL), b = new URL(database.DATABASE_URL), c = new URL(database.DATABASE_PUBLIC_URL)
  for (const field of ['username', 'password', 'pathname']) {
    assert.equal(a[field], b[field]); assert.equal(a[field], c[field])
  }
  assert.equal(a.hostname, b.hostname)
  assert.equal((await (await fetch(`${base}/health`, { signal: AbortSignal.timeout(15000) })).json()).status, 'ok')
  db = new PrismaClient({ datasources: { db: { url: c.toString() } } })
  await db.$connect()
  const tokens = Object.fromEntries(Object.entries(ids).map(([role, id]) =>
    [role, signSessionToken(id, { secret: api.AUTH_JWT_SECRET, ttlSeconds: 900 })]))

  async function call(role, path, method = 'GET', body, status = 200) {
    // Stay below the ordinary per-user write budget; no rate-limit bypass.
    await delay(250)
    const response = await fetch(`${base}${path}`, {
      method, signal: AbortSignal.timeout(30000), redirect: 'error',
      headers: { Authorization: `Bearer ${tokens[role]}`, 'Content-Type': 'application/json',
        'X-Club-Id': clubId, 'X-Expected-Actor-Id': ids[role], 'X-Anstoss-Private-Media': '1',
        'Accept-Language': 'de', 'X-App-Version': '1.0.1' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    // Never print returned presigns, tokens, provider errors or member data.
    lastHttp = { method, status: response.status, expectedStatus: status }
    assert.equal(response.status, status, `${method} ${path} returned ${response.status}, expected ${status}`)
    const text = await response.text()
    return text ? JSON.parse(text) : null
  }

  stage = 'create-isolated-fixture'
  if (!resumeAttendance) {
  await db.$transaction(async tx => {
    assert.equal(await tx.club.count({ where: { id: clubId } }), 0)
    await tx.club.create({ data: { id: clubId, name: '[QA] Anstoss release check', slug: prefix } })
    await tx.user.createMany({ data: Object.entries(ids).map(([role, id]) => ({
      id, name: `[QA] ${role}`, dateOfBirth: new Date('1990-01-01T00:00:00Z'), preferredLanguage: 'de',
    })) })
    const group = await tx.teamGroup.create({ data: { clubId, type: 'SENIOR', displayName: 'Test Erwachsene' } })
    await tx.team.create({ data: { id: teamId, clubId, groupId: group.id, name: 'Testmannschaft', displayName: 'Testmannschaft' } })
    await tx.membership.createMany({ data: [
      { clubId, userId: ids.admin, role: 'ADMIN' }, { clubId, userId: ids.coach, role: 'COACH' },
    ] })
    await tx.teamAccess.create({ data: { clubId, teamId, userId: ids.coach, role: 'HEAD_COACH', phase: 'FULL', status: 'ACTIVE' } })
    await tx.channel.create({ data: { id: channelId, clubId, teamId, kind: 'TEAM', slug: 'team', name: 'Testmannschaft' } })
  })
  created = true
  console.log(JSON.stringify({ stage, syntheticFixture: prefix }))

  stage = 'player-admin-approval'
  const clubPath = `/clubs/${clubId}`
  const request = await call('player', `${clubPath}/join-requests`, 'POST', { role: 'PLAYER', teamId }, 201)
  await call('player', `${clubPath}/join-requests`, 'GET', undefined, 403)
  await call('player', `${clubPath}/join-requests/${request.id}/approve`, 'POST', { revision: request.revision }, 403)
  const pending = await call('admin', `${clubPath}/join-requests`)
  assert(pending.some(row => row.id === request.id))
  await call('admin', `${clubPath}/join-requests/${request.id}/approve`, 'POST', { revision: request.revision }, 201)
  const access = await db.teamAccess.findFirstOrThrow({ where: { clubId, teamId, userId: ids.player } })
  assert.equal(access.phase, 'FULL'); assert.equal(access.status, 'ACTIVE')
  console.log(`PASS ${stage}`)

  stage = 'player-coach-availability'
  const event = await call('coach', `${clubPath}/events`, 'POST', { teamId, type: 'TRAINING',
    title: '[QA] Synchronisierung', date: new Date(Date.now() + 86400000).toISOString() }, 201)
  const eventPath = `${clubPath}/events/${event.id}`
  await call('player', `${eventPath}/rsvp`, 'PUT', { status: 'YES' })
  assert.equal((await call('coach', `${eventPath}/rsvp-summary`)).yes, 1)
  await call('player', `${eventPath}/rsvp`, 'PUT', { status: 'MAYBE' })
  assert.deepEqual(await call('coach', `${eventPath}/rsvp-summary`), { yes: 0, maybe: 1, no: 0 })
  const attendance = await call('coach', `${eventPath}/attendance`)
  assert(attendance.rsvps.some(row => row.userId === ids.player && row.status === 'MAYBE'))
  await call('outsider', `${eventPath}/rsvp-summary`, 'GET', undefined, 403)
  await call('player', `${eventPath}/rsvp`, 'PUT', { status: 'YES' })
  await call('coach', `${eventPath}/squad`, 'PUT', { userIds: [ids.player], publish: true })
  await call('coach', `${eventPath}/remind-rsvp`, 'POST', {})
  console.log(`PASS ${stage}`)

  } else {
    const fixture = await db.club.findUniqueOrThrow({ where: { id: clubId } })
    assert.equal(fixture.slug, prefix)
    assert.equal(fixture.name, '[QA] Anstoss release check')
    assert.equal(await db.user.count({ where: { id: { in: Object.values(ids) }, deletedAt: null, email: null } }), 4)
    assert.equal(await db.membership.count({ where: { clubId, userId: { notIn: Object.values(ids) } } }), 0)
    created = true
  }

  stage = 'coach-recorded-attendance'
  const clubPath = `/clubs/${clubId}`
  const completed = await call('coach', `${clubPath}/events`, 'POST', { teamId, type: 'TRAINING',
    title: '[QA] Anwesenheit', date: new Date(Date.now() + 86400000).toISOString() }, 201)
  // Creating past events is intentionally rejected by the public API. Move only
  // this synthetic event into the attendance window, then test the real API.
  const moved = await db.event.updateMany({ where: { id: completed.id, clubId, teamId, title: '[QA] Anwesenheit' },
    data: { date: new Date(Date.now() - 600000) } })
  assert.equal(moved.count, 1)
  const recordPath = `${clubPath}/events/${completed.id}/coach-attendance`
  const operation = { status: 'PRESENT', expectedVersion: null, operationId: randomUUID(), expectedActorId: ids.coach }
  await call('coach', `${recordPath}/${ids.player}`, 'PUT', operation)
  await call('coach', `${recordPath}/${ids.player}`, 'PUT', operation)
  const records = await call('admin', `${recordPath}?expectedActorId=${ids.admin}`)
  assert(records.some(row => row.userId === ids.player && row.status === 'PRESENT' && row.version === 1))
  console.log(`PASS ${stage}`)

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFZkAAAAASUVORK5CYII=', 'base64')
  const stored = []
  async function media(presignPath, publishPath, readPath, extra) {
    mediaStep = 'presign'
    const upload = await call('player', presignPath, 'POST', { kind: 'image', contentType: 'image/png', sizeBytes: png.length, filename: 'synthetic.png' }, 201)
    assert.equal(upload.enabled, true)
    assert(upload.objectKey.startsWith(`chat/${clubId}/`) || upload.objectKey.startsWith(`dm/${clubId}/`))
    assert.equal(upload.publicUrl, `https://private-media.anstoss.invalid/${upload.objectKey}`)
    ownedKeys.push(upload.objectKey)
    mediaStep = 'storage-origin'
    const storage = new URL(upload.uploadUrl)
    assert.equal(storage.protocol, 'https:')
    assert([`${api.R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com`,
      `${api.R2_QUARANTINE_BUCKET}.${api.R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com`].includes(storage.hostname))
    const put = () => fetch(upload.uploadUrl, { method: 'PUT', redirect: 'error',
      headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' }, body: png, signal: AbortSignal.timeout(30000) })
    mediaStep = 'upload'
    lastStorageStatus = (await put()).status
    assert.equal(lastStorageStatus, 200)
    const input = { messageType: 'IMAGE', attachmentUrl: upload.publicUrl, content: '[QA] Privat', ...extra }
    mediaStep = 'publish'
    const message = await call('player', publishPath, 'POST', input, 201)
    mediaStep = 'publish-idempotency'
    const replay = await call('player', publishPath, 'POST', input, 201)
    assert.equal(replay.id, message.id)
    mediaStep = 'authorized-read'
    const link = await call('coach', readPath(message.id))
    assert.equal(new URL(link.url).hostname, storage.hostname)
    const bytes = await fetch(link.url, { signal: AbortSignal.timeout(30000) })
    assert.equal(bytes.status, 200)
    assert.deepEqual(Buffer.from(await bytes.arrayBuffer()), png)
    mediaStep = 'unauthorized-read'
    await call('outsider', readPath(message.id), 'GET', undefined, 403)
    const unsigned = new URL(link.url); unsigned.search = ''
    assert([400, 401, 403].includes((await fetch(unsigned, { signal: AbortSignal.timeout(15000) })).status))
    stored.push({ key: upload.objectKey, read: readPath(message.id), put, url: link.url })
  }
  stage = 'private-channel-media'
  await media(`/teams/${teamId}/media/presign`, `/teams/${teamId}/messages/media`, id => `/messages/${id}/media-url`, { channelId })
  console.log(`PASS ${stage}`)
  stage = 'private-direct-media'
  const conversation = await call('player', `${clubPath}/conversations`, 'POST', { participantId: ids.coach }, 201)
  const conversationPath = `${clubPath}/conversations/${conversation.id}`
  await media(`${conversationPath}/media/presign`, `${conversationPath}/messages`, id => `${conversationPath}/messages/${id}/media-url`, {})
  console.log(`PASS ${stage}`)

  stage = 'account-erasure-and-media-retirement'
  await call('player', '/me/bound', 'DELETE')
  await call('player', '/me', 'GET', undefined, 401)
  const deleted = await db.user.findUniqueOrThrow({ where: { id: ids.player } })
  assert(deleted.deletedAt); assert.equal(deleted.email, `deleted-${ids.player}@anstoss.io`); assert.equal(deleted.dateOfBirth, null)
  // The worker must remove both durable obligations; never invoke it manually.
  const deadline = Date.now() + 180000
  while (await db.accountMediaDeletion.count({ where: { objectKey: { in: ownedKeys } } })) {
    assert(Date.now() < deadline, 'Production media cleanup did not settle within three minutes')
    await delay(2000)
  }
  for (const item of stored) {
    assert.equal((await item.put()).status, 412, 'An old upload capability must not resurrect removed bytes')
    const response = await fetch(item.url, { signal: AbortSignal.timeout(15000) })
    assert.equal(response.status, 200)
    assert.equal((await response.arrayBuffer()).byteLength, 0)
  }
  console.log(`PASS ${stage}; zero-byte anti-resurrection barriers retained (not full metadata erasure)`)

  stage = 'cleanup-synthetic-fixture'
  for (const role of ['coach', 'admin', 'outsider']) await call(role, '/me/bound', 'DELETE')
  await db.$transaction(async tx => {
    const club = await tx.club.findUniqueOrThrow({ where: { id: clubId } })
    assert.equal(club.slug, prefix)
    assert.equal(await tx.membership.count({ where: { clubId } }), 0)
    assert.equal(await tx.joinRequest.count({ where: { clubId, userId: { notIn: Object.values(ids) } } }), 0)
    assert.equal(await tx.message.count({ where: { clubId, senderId: { notIn: Object.values(ids) } } }), 0)
    await tx.club.delete({ where: { id: clubId } })
    // Retain the API-anonymized users as evidence; no direct account-row purge.
  })
  console.log(JSON.stringify({ result: 'PASS', syntheticFixture: prefix, fixtureClubRemoved: true,
    syntheticAccountsAnonymized: true, liveApi: true, liveStorage: true, otpDeliveryTested: false, physicalDevicesTested: false }))
}

main().catch(error => {
  // Avoid exception messages which can contain connection strings or presigns.
  console.error(JSON.stringify({ result: 'FAIL', stage, syntheticFixture: prefix,
    fixtureCreated: created, preservedForInvestigation: created, trackedSyntheticObjects: ownedKeys.length,
    lastHttp, mediaStep, lastStorageStatus, errorType: error?.constructor?.name,
    errorCode: /^(P\d{4}|ERR_ASSERTION)$/.test(error?.code ?? '') ? error.code : undefined }))
  process.exitCode = 1
}).finally(async () => { await db?.$disconnect() })
