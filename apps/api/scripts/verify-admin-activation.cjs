// Explicitly opt-in: real production HTTP, isolated synthetic adults/club only.
// No real club authority is inferred. Credentials and response bodies stay private.
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { randomUUID } = require('node:crypto')
const { resolve } = require('node:path')
const { PrismaClient } = require('@prisma/client')
const { signSessionToken } = require('../dist/auth/otp/jwt.util.js')
const repo = resolve(__dirname, '../../..')
const environment = 'c6651cfe-f78d-4c06-aefd-634f5933cc22'
const project = 'fc1f6c05-d556-48ad-bc8c-a59b4e7a99b4'
const base = 'https://api.anstoss.io'
const prefix = `admin-qa-${randomUUID()}`
const teamReference = randomUUID().replaceAll('-', '').toUpperCase()
const userIds = [0, 1].map(n => `${prefix}-${n}`)
const name = `[QA] ${prefix}`
let db, clubId, stage = 'preflight'
const directoryIds = []
function railway(...args) {
  return JSON.parse(execFileSync('/opt/homebrew/bin/railway', args, {
    cwd: repo, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, RAILWAY_CALLER: 'skill:use-railway@1.3.7', RAILWAY_AGENT_SESSION: 'anstoss-admin-20261107' },
  }))
}
async function request(token, path, method = 'GET', body, expected = 200) {
  await new Promise(resolve => setTimeout(resolve, 300))
  const response = await fetch(`${base}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  assert.equal(response.status, expected, `${method} request returned unexpected status`)
  return response.json()
}
async function main() {
  assert.equal(process.argv[2], '--production-synthetic-only')
  assert(process.argv[3], 'Supply the private admin credential-file path')
  assert.equal(railway('status', '--json').id, project)
  const api = railway('variable', 'list', '--service', '373adb45-3ab1-4076-b2b9-72f1590ba1b3', '--environment', environment, '--json')
  const pg = railway('variable', 'list', '--service', 'a04d6695-4b78-42c2-947c-0713337a7762', '--environment', environment, '--json')
  const configured = new URL(api.DATABASE_URL), target = new URL(pg.DATABASE_PUBLIC_URL)
  for (const field of ['username', 'password', 'pathname']) assert.equal(configured[field], target[field])
  assert.notEqual(api.ANSTOSS_MIGRATION_MAINTENANCE, 'true')
  db = new PrismaClient({ datasources: { db: { url: target.toString() } } })
  const credential = readFileSync(process.argv[3], 'utf8')
  const password = credential.match(/^Temporary password: (.+)$/m)[1]
  // Exercise the repaired email alias rather than only the stored "admin" login.
  const login = await request(null, '/admin/auth/login', 'POST', { username: 'admin@anstoss.io', password }, 201)
  const operator = login.token
  await request(operator, '/admin/auth/me')
  console.log('PASS real admin email-alias login')
  stage = 'create-synthetic-adults'
  await db.user.createMany({ data: userIds.map(id => ({ id, email: `${id}@example.com`, name: '[QA] Club applicant', dateOfBirth: new Date('1990-01-01'), preferredLanguage: 'de' })) })
  const tokens = userIds.map(id => signSessionToken(id, { secret: api.AUTH_JWT_SECRET, ttlSeconds: 900 }))
  const input = { clubName: name, teamName: 'Senior', teamGroupType: 'SENIOR', teamRoles: ['HEAD_COACH'],
    externalTeamUrl: `https://www.fussball.de/mannschaft/-/team-id/${teamReference}/tab/overview/` }
  stage = 'submit-and-reject-unverified'
  const claim = await request(tokens[0], '/club-claims/first', 'POST', input, 201)
  directoryIds.push(claim.directoryEntryId)
  const queue = await request(operator, '/admin/club-claims')
  const row = queue.find(item => item.id === claim.id)
  assert.equal(row.assessment.eligible, false)
  assert.equal(row.assessment.checks.find(check => check.key === 'authority').passed, false)
  const verification = { email: `${userIds[0]}@example.com`, sourceUrl: 'https://example.org/anstoss-synthetic-test',
    note: 'Fictional QA application: the operator created and controls this isolated synthetic identity. Not real club authority evidence.' }
  await request(tokens[0], `/admin/club-claims/${claim.id}/verify-contact`, 'POST', verification, 401)
  await request(operator, `/admin/club-claims/${claim.id}/verify-contact`, 'POST', { ...verification, email: 'mismatch@example.com' }, 400)
  console.log('PASS public link alone and ordinary app tokens cannot grant authority')
  stage = 'verify-and-activate'
  const approved = await request(operator, `/admin/club-claims/${claim.id}/verify-contact`, 'POST', verification, 201)
  clubId = approved.club.id
  assert.equal(approved.club.name, name)
  assert.equal(approved.claim.status, 'APPROVED')
  const mine = await request(tokens[0], '/club-claims/mine')
  assert(mine.some(item => item.id === claim.id && item.status === 'APPROVED'))
  const membership = await db.membership.findFirstOrThrow({ where: { clubId, userId: userIds[0] } })
  assert.equal(membership.role, 'OWNER')
  await request(tokens[0], `/clubs/${clubId}/events`)
  assert.equal(await db.teamAccess.count({ where: { clubId, userId: userIds[0], role: 'HEAD_COACH', status: 'ACTIVE' } }), 1)
  assert.equal(await db.auditLog.count({ where: { clubId, type: 'club.claim_auto_approved' } }), 1)
  console.log('PASS verified contact activates owner/coach access through the live API')
  stage = 'duplicate-protection'
  const duplicate = await request(tokens[1], '/club-claims/first', 'POST', { ...input, clubName: `${name} duplicate` }, 201)
  directoryIds.push(duplicate.directoryEntryId)
  await request(operator, `/admin/club-claims/${duplicate.id}/verify-contact`, 'POST', { ...verification, email: `${userIds[1]}@example.com` }, 409)
  assert.equal(await db.membership.count({ where: { userId: userIds[1] } }), 0)
  assert.equal((await db.clubClaim.findUniqueOrThrow({ where: { id: duplicate.id } })).status, 'SUBMITTED')
  console.log('PASS duplicate team activation blocked; no extra membership granted')
  stage = 'cleanup'
  await db.$transaction(async tx => {
    assert.equal((await tx.club.findUniqueOrThrow({ where: { id: clubId } })).name, name)
    assert.equal(await tx.membership.count({ where: { clubId, userId: { notIn: userIds } } }), 0)
    assert.equal(await tx.clubClaim.count({ where: { directoryEntryId: { in: directoryIds }, claimantUserId: { notIn: userIds } } }), 0)
    await tx.platformSetting.deleteMany({ where: { key: `club_verified_contact:${teamReference}` } })
    await tx.clubClaim.deleteMany({ where: { claimantUserId: { in: userIds } } })
    await tx.club.delete({ where: { id: clubId } })
    await tx.clubDirectoryEntry.deleteMany({ where: { id: { in: directoryIds }, activeClubId: null } })
    await tx.user.deleteMany({ where: { id: { in: userIds }, email: { endsWith: '@example.com' } } })
  })
  console.log(JSON.stringify({ result: 'PASS', syntheticFixture: prefix, syntheticDataRemoved: true, auditEvidenceRetained: true }))
}
main().catch(error => {
  console.error(JSON.stringify({ result: 'FAIL', stage, syntheticFixture: prefix, clubId, directoryIds,
    errorType: error?.constructor?.name, assertion: error?.code === 'ERR_ASSERTION',
    actual: typeof error?.actual === 'number' ? error.actual : undefined,
    expected: typeof error?.expected === 'number' ? error.expected : undefined }))
  process.exitCode = 1
}).finally(async () => db?.$disconnect())
