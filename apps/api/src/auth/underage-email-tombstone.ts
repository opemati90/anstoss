import { createHash } from 'node:crypto'

/**
 * Onboarding review fix (B1): when an under-16 self-registration is removed
 * (parent handoff, or under 13), the child's email is remembered as a salted
 * hash for 30 days. During that window the address can't open a fresh
 * self-registered account (re-sign-up with a different birth date) and can't
 * be given as a guardian email. Only the hash is kept; the row lives in
 * AuthIdentityTombstone under its own provider so no schema change is needed.
 */
export const UNDERAGE_EMAIL_PROVIDER = 'email-underage'
export const UNDERAGE_EMAIL_BLOCK_DAYS = 30
const BLOCK_MS = UNDERAGE_EMAIL_BLOCK_DAYS * 24 * 60 * 60 * 1000

export type UnderageTombstoneReason = 'underage_parent_handoff' | 'underage_blocked'

type TombstoneDb = {
  authIdentityTombstone: {
    upsert: (args: any) => Promise<unknown>
    findUnique: (args: any) => Promise<{ createdAt: Date } | null>
  }
}

export function normalizeTombstoneEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase()
  return normalized && normalized.includes('@') ? normalized : null
}

export function hashUnderageEmail(email: string): string {
  const pepper = (process.env.AUTH_OTP_PEPPER ?? '').trim()
  return createHash('sha256').update(`${UNDERAGE_EMAIL_PROVIDER}:${pepper}:${email}`).digest('hex')
}

export async function tombstoneUnderageEmail(
  db: Pick<TombstoneDb, 'authIdentityTombstone'>,
  rawEmail: string | null | undefined,
  deletedUserId: string,
  reason: UnderageTombstoneReason,
  now = new Date(),
): Promise<void> {
  const email = normalizeTombstoneEmail(rawEmail)
  if (!email) return
  const subjectHash = hashUnderageEmail(email)
  await db.authIdentityTombstone.upsert({
    where: { provider_subjectHash: { provider: UNDERAGE_EMAIL_PROVIDER, subjectHash } },
    // A repeat restarts the 30-day window.
    update: { deletedUserId, reason, createdAt: now },
    create: { provider: UNDERAGE_EMAIL_PROVIDER, subjectHash, deletedUserId, reason, createdAt: now },
  })
}

/** True while the address is inside its 30-day block window. */
export async function isUnderageEmailBlocked(
  db: Partial<Pick<TombstoneDb, 'authIdentityTombstone'>>,
  rawEmail: string | null | undefined,
  now = new Date(),
): Promise<boolean> {
  const email = normalizeTombstoneEmail(rawEmail)
  if (!email || !db.authIdentityTombstone?.findUnique) return false
  const row = await db.authIdentityTombstone.findUnique({
    where: {
      provider_subjectHash: { provider: UNDERAGE_EMAIL_PROVIDER, subjectHash: hashUnderageEmail(email) },
    },
    select: { createdAt: true },
  })
  return !!row && now.getTime() - row.createdAt.getTime() < BLOCK_MS
}

