import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient, RegistrationRole } from '@prisma/client'
import { createClerkClient } from '@clerk/backend'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const OUTPUT_PATH = path.join(ROOT_DIR, '.demo-accounts.local.json')

const PERSONAS = [
  {
    userId: 'seed-admin-1',
    role: RegistrationRole.CLUB_ADMIN,
    firstName: 'Sofia',
    lastName: 'Wagner',
  },
  {
    userId: 'seed-coach-2',
    role: RegistrationRole.COACH,
    firstName: 'Lena',
    lastName: 'Schmidt',
  },
  {
    userId: 'seed-player-1',
    role: RegistrationRole.PLAYER,
    firstName: 'Kai',
    lastName: 'Fischer',
  },
  {
    userId: 'seed-parent-1',
    role: RegistrationRole.PARENT,
    firstName: 'Anna',
    lastName: 'Bauer',
  },
  {
    userId: 'seed-free-agent-1',
    role: RegistrationRole.FREE_AGENT,
    firstName: 'Emir',
    lastName: 'Kaya',
  },
]

async function main() {
  loadLocalEnv()

  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error('CLERK_SECRET_KEY is required to provision demo Clerk accounts.')
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to bind demo Clerk accounts to seeded personas.')
  }

  const prisma = new PrismaClient()
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
  const output = []

  try {
    for (const persona of PERSONAS) {
      const existingUsers = await clerk.users.getUserList({
        externalId: [persona.userId],
        limit: 1,
      })

      let clerkUser = existingUsers.data[0]

      if (!clerkUser) {
        const inboxAddress = await requestInboxAddress()

        clerkUser = await clerk.users.createUser({
          externalId: persona.userId,
          emailAddress: [inboxAddress],
          firstName: persona.firstName,
          lastName: persona.lastName,
          publicMetadata: {
            demo: true,
            registrationRole: persona.role,
          },
          skipPasswordChecks: true,
          skipPasswordRequirement: true,
          skipLegalChecks: true,
          legalAcceptedAt: new Date(),
        })
      }

      const primaryEmailAddress =
        clerkUser.emailAddresses.find(
          (address) => address.id === clerkUser.primaryEmailAddressId,
        )?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress

      if (!primaryEmailAddress) {
        throw new Error(`No email address found for demo user ${persona.userId}.`)
      }

      await prisma.user.update({
        where: { id: persona.userId },
        data: {
          clerkId: clerkUser.id,
          email: primaryEmailAddress.toLowerCase(),
          registrationRole: persona.role,
        },
      })

      output.push({
        role: persona.role,
        userId: persona.userId,
        clerkUserId: clerkUser.id,
        email: primaryEmailAddress.toLowerCase(),
      })
    }

    await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8')
    console.log(`Provisioned ${output.length} demo Clerk accounts.`)
    console.log(`Account inventory written to ${OUTPUT_PATH}.`)
  } finally {
    await prisma.$disconnect()
  }
}

async function requestInboxAddress() {
  const response = await fetch(
    'https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1',
  )

  if (!response.ok) {
    throw new Error(`Could not create inbox-backed demo mailbox (${response.status}).`)
  }

  const payload = await response.json()
  const mailbox = Array.isArray(payload) ? payload[0] : null

  if (!mailbox || typeof mailbox !== 'string') {
    throw new Error('Mailbox provider returned an invalid address payload.')
  }

  return mailbox
}

function loadLocalEnv() {
  const envPath = path.join(ROOT_DIR, '.env')

  try {
    const content = readFileSync(envPath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }

      const separatorIndex = trimmed.indexOf('=')
      if (separatorIndex <= 0) {
        continue
      }

      const key = trimmed.slice(0, separatorIndex)
      if (process.env[key]) {
        continue
      }

      const rawValue = trimmed.slice(separatorIndex + 1).trim()
      process.env[key] = rawValue.replace(/^"(.*)"$/, '$1')
    }
  } catch {
    // The repo may rely on shell-provided env vars instead of .env files.
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
