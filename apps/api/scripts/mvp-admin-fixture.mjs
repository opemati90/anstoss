/** Isolated local fixture only; never reads DATABASE_URL or production secrets. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomBytes, scryptSync } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'))
assert.equal(state.apiUrl, 'http://127.0.0.1:3167')
assert.equal(state.emails.admin, 'admin@anstoss-simulator.invalid')
const db = new PrismaClient({ datasourceUrl: 'postgresql://yemi@127.0.0.1:56541/anstoss_mvp_sim_test' })
try {
  const club = await db.club.findUniqueOrThrow({ where: { id: state.clubId } })
  assert.equal(club.slug, `qa-lokal-${state.runId}`)
  const user = await db.user.findUniqueOrThrow({ where: { id: state.users.admin } })
  assert.equal(user.email, state.emails.admin)
  const salt = randomBytes(16)
  // Public fictional fixture password, scoped to a loopback-only disposable DB.
  const passwordHash = `scrypt$${salt.toString('hex')}$${scryptSync('Anstoss-QA-local-only-2026', salt, 64).toString('hex')}`
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { platformRole: 'PLATFORM_ADMIN' } }),
    db.platformAdminAccount.upsert({
      where: { userId: user.id },
      create: { userId: user.id, loginIdentifier: 'qa-console', passwordHash, mustRotatePassword: false },
      update: { passwordHash, mustRotatePassword: false },
    }),
  ])
  console.log('Local QA console fixture ready; no production credentials changed')
} finally {
  await db.$disconnect()
}
