import { ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

// Keep the lock and lookup on the same PostgreSQL normalization. This also
// covers historical rows without a directory entry or populated searchText.
export function registrationNameSql(value: Prisma.Sql) {
  return Prisma.sql`lower(btrim(regexp_replace(normalize(${value}, NFKC), '[[:space:]]+', ' ', 'g')))`
}

export async function assertClubNameAvailable(
  tx: Prisma.TransactionClient,
  name: string,
  exceptClubId: string | null = null,
) {
  const key = registrationNameSql(Prisma.sql`${name}::text`)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('club-registration:' || ${key}))`
  // Public club identity only: intentionally global, never reads membership
  // or other tenant-private records. Parameterized, including the exclusion.
  const matches = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Club"
    WHERE ${registrationNameSql(Prisma.sql`"name"`)} = ${key}
      AND (${exceptClubId}::text IS NULL OR "id" <> ${exceptClubId})
    LIMIT 1
  `
  if (matches.length) {
    throw new ConflictException({
      code: 'CLUB_ALREADY_REGISTERED',
      message: 'This club is already registered. Request access or contact support to review an incorrect registration.',
    })
  }
}

export async function assertTeamNameAvailable(
  tx: Prisma.TransactionClient,
  clubId: string,
  displayName: string,
) {
  const key = registrationNameSql(Prisma.sql`${displayName}::text`)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('team-registration:' || ${clubId} || ':' || ${key}))`
  const matches = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Team"
    WHERE "clubId" = ${clubId}
      AND ${registrationNameSql(Prisma.sql`"displayName"`)} = ${key}
    LIMIT 1
  `
  if (matches.length) {
    throw new ConflictException({
      code: 'TEAM_ALREADY_REGISTERED',
      message: 'This team already exists in your club. Open the existing team instead.',
    })
  }
}
