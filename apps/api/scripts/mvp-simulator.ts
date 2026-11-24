/**
 * Full local API for connected native QA. Uses real OTP, guards, services and
 * sockets; no mock response interception. Never accepts a production database.
 * Run in a clean environment (see INTEGRATION_PROGRESS.md). No email/R2/Stripe
 * credentials are needed. NODE_ENV=test disables background retention workers.
 */
import 'reflect-metadata'
import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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
  let signupEmails = process.env.ANSTOSS_MVP_FRESH_SIGNUP === '1'
    ? Object.fromEntries(['founder', 'player', 'agent'].map((role) => [role, `fresh-${role}-${randomUUID()}@anstoss-simulator.invalid`]))
    : {}
  process.env.REVIEW_LOGIN_EMAILS = [...Object.values(emails), ...Object.values(signupEmails)].join(',')
  const prisma = new PrismaClient()
  await prisma.$connect()
  const resumePath = process.env.ANSTOSS_MVP_RESUME_STATE
  if (resumePath) {
    const state = JSON.parse(readFileSync(resumePath, 'utf8'))
    if (
      state.apiUrl !== 'http://127.0.0.1:3167' ||
      !state.runId ||
      Object.keys(emails).some((role) => state.emails?.[role] !== emails[role])
    ) {
      throw new Error('Resume state is not a local Anstoss simulator fixture')
    }
    const club = await prisma.club.findUnique({ where: { id: state.clubId } })
    const team = await prisma.team.findUnique({ where: { id: state.teamId } })
    if (club?.slug !== `qa-lokal-${state.runId}` || team?.clubId !== club?.id) {
      throw new Error('Resume club/team do not match the original QA fixture')
    }
    for (const [role, email] of Object.entries(emails)) {
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user || user.id !== state.users?.[role]) {
        throw new Error(`Resume user does not match the original QA fixture: ${role}`)
      }
    }
    // Keep the exact allowlisted signup journeys across API restarts. Generating
    // new addresses here would strand users already completing native QA.
    const resumedSignupEmails: Record<string, string> = state.signupEmails ?? {}
    for (const [role, email] of Object.entries(resumedSignupEmails)) {
      if (
        !['founder', 'player', 'agent'].includes(role) ||
        typeof email !== 'string' ||
        !new RegExp(`^fresh-${role}-[a-f0-9-]{36}@anstoss-simulator\\.invalid$`).test(email)
      ) {
        throw new Error('Resume signup address is not a synthetic Anstoss fixture')
      }
    }
    signupEmails = resumedSignupEmails
    process.env.REVIEW_LOGIN_EMAILS = [...Object.values(emails), ...Object.values(signupEmails)].join(',')
    // A restarted API has a new signing key: retain the journeys, not old sessions.
    const journalPath = join(dirname(resumePath), 'journeys.json')
    if (existsSync(journalPath)) {
      const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
      if (journal.runId !== state.runId) throw new Error('QA journal run does not match')
      writeFileSync(journalPath, JSON.stringify({ ...journal, sessions: {} }), { mode: 0o600 })
    }
    const { AppModule } = await import('../src/app.module')
    const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] })
    await app.listen(3167, '127.0.0.1')
    writeFileSync(
      resumePath,
      JSON.stringify({ ...state, signupEmails, otpCode: process.env.REVIEW_LOGIN_CODE }),
      { mode: 0o600 },
    )
    console.log('Updated local simulator API ready; existing fixtures preserved. Sign in again.')
    let stopping = false
    const stop = async () => {
      if (stopping) return
      stopping = true
      await app.close()
      await prisma.$disconnect()
      console.log('Local simulator stopped; resumed QA fixtures retained.')
    }
    process.once('SIGINT', () => void stop())
    process.once('SIGTERM', () => void stop())
    return
  }
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
  // Persist fixture ownership before loading the application: a startup or
  // decorator/compiler failure must not strand seeded rows without a resume
  // manifest. A resumed run revalidates every id and rotates its local secrets.
  const directory = mkdtempSync(join(tmpdir(), 'anstoss-mvp-sim-'))
  const stateFile = join(directory, 'state.json')
  writeFileSync(
    stateFile,
    JSON.stringify({
      apiUrl: 'http://127.0.0.1:3167',
      runId,
      clubId: club.id,
      teamId: team.id,
      users,
      emails,
      signupEmails,
      otpCode: process.env.REVIEW_LOGIN_CODE,
    }),
    { mode: 0o600 },
  )
  console.log(`Local simulator fixtures saved; QA state: ${stateFile}`)
  // Dynamic import only after configuring the isolated environment.
  const { AppModule } = await import('../src/app.module')
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] })
  await app.listen(3167, '127.0.0.1')
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
