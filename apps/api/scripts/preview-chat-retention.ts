import { PrismaClient } from '@prisma/client'
import { ChatRetentionWorker } from '../src/chat/chat-retention.worker'
import type { PrismaService } from '../src/prisma/prisma.service'
import type { R2Provider } from '../src/assets/r2.provider'

/** No application bootstrap: no workers, notifications or storage clients start. */
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  const prisma = new PrismaClient({ log: [] })
  try {
    const preview = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`
      const worker = new ChatRetentionWorker(tx as unknown as PrismaService, {} as R2Provider)
      return worker.previewExpired(new Date())
    }, { isolationLevel: 'RepeatableRead', timeout: 30_000 })
    // Counts and club identifiers only; never print credentials, messages or URLs.
    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`)
  } finally {
    await prisma.$disconnect()
  }
}

void main().catch(() => {
  // Database errors can include connection details. Fail without echoing them.
  process.stderr.write('Retention preview failed; no changes were made. Check database access.\n')
  process.exitCode = 1
})
