import { ConflictException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'

export const MAX_CLUB_ADMINISTRATORS = 3

/** Call inside the transaction while holding the owner:<clubId> advisory lock. */
export async function assertClubAdministratorCapacity(
  tx: Pick<Prisma.TransactionClient, 'membership'>,
  clubId: string,
  currentRole: string | null | undefined,
  nextRole: string,
) {
  const isAdministrator = (role: string | null | undefined) => role === 'OWNER' || role === 'ADMIN'
  if (!isAdministrator(nextRole) || isAdministrator(currentRole)) return
  const count = await tx.membership.count({
    where: { clubId, role: { in: ['OWNER', 'ADMIN'] } },
  })
  if (count >= MAX_CLUB_ADMINISTRATORS) {
    throw new ConflictException({
      code: 'CLUB_ADMIN_LIMIT_REACHED',
      message: 'A club can have at most three administrators, including the owner.',
    })
  }
}
