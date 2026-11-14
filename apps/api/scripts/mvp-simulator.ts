/**
 * Full local API for connected native QA. Uses real OTP, guards, services and
 * sockets; no mock response interception. Never accepts a production database.
 * Run in a clean environment (see INTEGRATION_PROGRESS.md). No email/R2/Stripe
 * credentials are needed. NODE_ENV=test disables background retention workers.
 */
import 'reflect-metadata'
import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { NestFactory } from '@nestjs/core'

async function main() {
  const target = new URL(process.env.ANSTOSS_MVP_TEST_DATABASE_URL ?? '')
  if (
    process.env.NODE_ENV !== 'test' ||
    target.hostname !== '127.0.0.1' ||
    target.pathname !== '/anstoss_mvp_sim_test'
  ) {
    throw new Error(
      'Connected simulator requires NODE_ENV=test and the isolated local simulator DB',
    )
  }
  for (const key of Object.keys(process.env)) {
    if (/^(RESEND_|STRIPE_|R2_|SENTRY_|UPSTASH_|REDIS_URL|REVIEW_LOGIN_|AUTH_)/.test(key)) {
      throw new Error(`Start with a clean environment; external configuration present: ${key}`)
    }
  }
  process.env.DATABASE_URL = target.toString()
  process.env.AUTH_JWT_SECRET = randomBytes(48).toString('hex')
  process.env.AUTH_OTP_PEPPER = randomBytes(48).toString('hex')
  process.env.REVIEW_LOGIN_CODE = String(randomInt(100000, 1000000))
  process.env.PINO_PRETTY = 'false'
  process.env.LOG_LEVEL = 'warn'
  const emails = Object.fromEntries(
    ['admin', 'coach', 'player', 'agent', 'founder'].map((role) => [
      role,
      `${role}@anstoss-simulator.invalid`,
    ]),
  )
  process.env.REVIEW_LOGIN_EMAILS = Object.values(emails).join(',')
  const prisma = new PrismaClient()
  await prisma.$connect()
  if (await prisma.club.count()) {
    await prisma.$disconnect()
    throw new Error('Simulator DB is not empty; inspect previous QA fixtures before restarting')
  }
  const runId = randomUUID()
  const users: Record<string, string> = {}
  for (const [role, email] of Object.entries(emails)) {
    const user = await prisma.user.create({
      data: {
        name: role === 'founder' ? 'founder' : `QA ${role}`,
        email,
        dateOfBirth: role === 'founder' ? null : new Date('1990-01-15'),
        preferredLanguage: 'de',
        registrationRole:
          role === 'agent'
            ? 'FREE_AGENT'
            : role === 'admin'
              ? 'CLUB_ADMIN'
              : role === 'coach'
                ? 'COACH'
                : 'PLAYER',
      },
    })
    users[role] = user.id
  }
  const club = await prisma.club.create({
    data: {
      name: 'Anstoss QA Lokal',
      slug: `qa-lokal-${runId}`,
      city: 'Berlin',
      searchText: 'anstoss qa lokal berlin',
      primaryColor: '#1D4F91',
    },
  })
  const group = await prisma.teamGroup.create({
    data: { clubId: club.id, type: 'SENIOR', displayName: 'Herren' },
  })
  const team = await prisma.team.create({
    data: { clubId: club.id, groupId: group.id, name: 'herren', displayName: '1. Herren' },
  })
  await prisma.membership.createMany({
    data: [
      { clubId: club.id, userId: users.admin, role: 'ADMIN' },
      { clubId: club.id, userId: users.coach, role: 'COACH' },
    ],
  })
  await prisma.teamAccess.create({
    data: {
      clubId: club.id,
      teamId: team.id,
      userId: users.coach,
      role: 'HEAD_COACH',
      status: 'ACTIVE',
    },
  })
  // Dynamic import only after configuring the isolated environment.
  const { AppModule } = await import('../src/app.module')
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] })
  await app.listen(3167, '127.0.0.1')
  const directory = mkdtempSync(join(tmpdir(), 'anstoss-mvp-sim-'))
  const stateFile = join(directory, 'state.json')
  writeFileSync(
    stateFile,
    JSON.stringify({
      apiUrl: await app.getUrl(),
      runId,
      clubId: club.id,
      teamId: team.id,
      users,
      emails,
      otpCode: process.env.REVIEW_LOGIN_CODE,
    }),
    { mode: 0o600 },
  )
  console.log(`Local simulator API ready; QA state: ${stateFile}`)

  let stopping = false
  async function stop() {
    if (stopping) return
    stopping = true
    await app.close()
    await prisma.club.delete({ where: { id: club.id } })
    await prisma.otpCode.deleteMany({ where: { email: { in: Object.values(emails) } } })
    await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } })
    await prisma.$disconnect()
    console.log('Local QA fixtures removed; simulator database retained.')
  }
  process.once('SIGINT', () => void stop())
  process.once('SIGTERM', () => void stop())
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Local simulator startup failed')
  process.exitCode = 1
})
