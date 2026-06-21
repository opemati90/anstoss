import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'

export const AUTH_IDENTITY_PROVIDER_CLERK = 'clerk'

export function hashAuthSubject(subject: string) {
  return createHash('sha256').update(subject).digest('hex')
}

export async function lockAuthSubject(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  subject: string,
) {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${AUTH_IDENTITY_PROVIDER_CLERK}),
      hashtext(${subject})
    )
  `
}
