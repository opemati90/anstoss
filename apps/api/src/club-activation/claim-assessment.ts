import { z } from 'zod'

export const AUTHORITY_PREFIX = 'club_verified_contact:'
export const verifiedContactSchema = z.object({
  email: z.string().email().max(254).transform(value => value.toLowerCase()),
  clubName: z.string().min(2).max(200),
  teamId: z.string().regex(/^[A-Z0-9]{32}$/),
  sourceUrl: z.string().url().max(1000).refine(value => {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  }),
  note: z.string().trim().min(20).max(1000),
  verifiedBy: z.string().min(1),
  expiresAt: z.string().datetime(),
})
export type VerifiedClubContact = z.infer<typeof verifiedContactSchema>

export function fussballTeamId(value: string | null | undefined): string | null {
  try {
    const url = new URL(value || '')
    if (url.protocol !== 'https:' || url.username || url.password ||
      !['www.fussball.de', 'fussball.de', 'next.fussball.de'].includes(url.hostname)) return null
    return url.pathname.match(/^\/mannschaft\/[^/]+\/(?:team-id\/)?([A-Z0-9]{32})(?:\/|$)/i)?.[1].toUpperCase() || null
  } catch { return null }
}

function normalizedName(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('de').replace(/\s+/g, ' ')
}

export function readVerifiedContact(value: string | undefined): VerifiedClubContact | null {
  try {
    const parsed = verifiedContactSchema.safeParse(JSON.parse(value || 'null'))
    return parsed.success ? parsed.data : null
  } catch { return null }
}

type ClaimForAssessment = {
  kind: string; status: string; expiresAt: Date; teamName: string | null;
  teamGroupType: string | null; externalTeamUrl: string | null;
  directoryEntry: { name: string; activeClubId: string | null };
  claimant: { email: string | null };
}

export function assessClubClaim(claim: ClaimForAssessment, contact: VerifiedClubContact | null, now = new Date()) {
  const teamId = fussballTeamId(claim.externalTeamUrl)
  const checks = [
    { key: 'first_claim', label: 'New club application', passed: claim.kind === 'FIRST_CLAIM' },
    { key: 'pending', label: 'Application is active', passed: claim.status === 'SUBMITTED' && claim.expiresAt > now },
    { key: 'team', label: 'Adult team details complete', passed: !!claim.teamName?.trim() && claim.teamGroupType === 'SENIOR' },
    { key: 'link', label: 'FUSSBALL.DE team link recognised', passed: !!teamId },
    { key: 'unclaimed', label: 'Directory club is not already activated', passed: !claim.directoryEntry.activeClubId },
    { key: 'authority', label: 'Account matches an independently verified club contact', passed: !!contact &&
      contact.teamId === teamId && contact.email === claim.claimant.email?.toLowerCase() &&
      normalizedName(contact.clubName) === normalizedName(claim.directoryEntry.name) &&
      new Date(contact.expiresAt) > now },
  ]
  return { eligible: checks.every(check => check.passed), checks, method: 'verified-contact-rules' as const }
}
