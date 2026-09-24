import { z } from 'zod'

// ── Club admin "Aufgaben" inbox + compliance records ─────────────────────
// Shared contract for GET /clubs/:clubId/admin-inbox, the compliance
// (Führungszeugnis & member documents) endpoints and the admin member
// summary. Owned by the club-admin revamp.

export const COMPLIANCE_KINDS = [
  'FUEHRUNGSZEUGNIS',
  'SPIELERPASS',
  'MEDICAL_CHECK',
  'VACCINATION_TETANUS',
  'FIRST_AID_CERT',
  'SEPA_MANDATE',
  'DATA_CONSENT',
] as const
export type ComplianceKind = (typeof COMPLIANCE_KINDS)[number]

/** Führungszeugnis validity used when an admin marks one as presented. */
export const FUEHRUNGSZEUGNIS_VALIDITY_YEARS = 5
/** A certificate expiring within this many days counts as "expiring". */
export const COMPLIANCE_EXPIRING_WINDOW_DAYS = 60

export type ComplianceRecordStatus = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING'

const COMPLIANCE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * Status of a recorded certificate from its expiry. One implementation for
 * the API (inbox, member sheet) and the app (Mannschaften, Führungszeugnisse)
 * so the "läuft ab" window never drifts between them.
 */
export function complianceStatus(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): Exclude<ComplianceRecordStatus, 'MISSING'> {
  if (!expiresAt) return 'VALID'
  const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
  const ms = expiry.getTime()
  if (Number.isNaN(ms)) return 'VALID'
  const remaining = ms - now.getTime()
  if (remaining < 0) return 'EXPIRED'
  if (remaining <= COMPLIANCE_EXPIRING_WINDOW_DAYS * COMPLIANCE_DAY_MS) return 'EXPIRING'
  return 'VALID'
}

/**
 * §72a(5) SGB VIII: Führungszeugnis data must be deleted at the latest three
 * months after the activity with children ends. Used by the retention sweep.
 */
export const COMPLIANCE_RETENTION_DAYS = 90

/** One reminder per member + document kind per club within this window. */
export const COMPLIANCE_REMINDER_COOLDOWN_HOURS = 24

export type RemindComplianceResult =
  | { sent: true }
  | { sent: false; reason: 'cooldown'; retryAfter: string }
  | { sent: false; reason: 'delivery_failed' }

export interface ComplianceItem {
  id: string
  memberUserId: string
  memberName: string
  role: 'OWNER' | 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT'
  kind: ComplianceKind
  /** Null for documents without an expiry (SEPA mandate, data consent). */
  expiresAt: string | null
  issuedAt: string | null
  documentUrl: string | null
  note: string | null
}

export const upsertComplianceRecordSchema = z
  .object({
    memberUserId: z.string().min(1),
    kind: z.enum(COMPLIANCE_KINDS),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
export type UpsertComplianceRecordInput = z.infer<typeof upsertComplianceRecordSchema>

export const updateComplianceRecordSchema = z
  .object({
    issuedAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
export type UpdateComplianceRecordInput = z.infer<typeof updateComplianceRecordSchema>

export const remindComplianceSchema = z
  .object({
    memberUserId: z.string().min(1),
    kind: z.enum(COMPLIANCE_KINDS),
  })
  .strict()
export type RemindComplianceInput = z.infer<typeof remindComplianceSchema>

/**
 * Offices the inbox asks the club to fill (Kassenwart = TREASURER,
 * Schriftführer = SECRETARY). These are customary, not a statutory duty: BGB
 * §26 only requires a Vorstand. Copy must not claim a legal requirement.
 */
export const REQUIRED_CLUB_OFFICES = ['TREASURER', 'SECRETARY'] as const
export type RequiredClubOffice = (typeof REQUIRED_CLUB_OFFICES)[number]

export interface AdminInboxSection<T> {
  count: number
  /** Top items (at most 3), most urgent first. */
  items: T[]
}

export interface AdminInboxJoinRequest {
  id: string
  revision: number
  role: string
  message: string | null
  createdAt: string
  user: { id: string; name: string; avatarUrl: string | null }
}

export interface AdminInboxStaffRequest {
  id: string
  desiredRole: string
  createdAt: string
  claimant: { id: string; name: string; avatarUrl: string | null }
}

export interface AdminInboxOverdueDue {
  memberUserId: string
  name: string
  /** Minor units (cents). */
  amount: number
  dueDate: string | null
}

export interface AdminInboxTeamWithoutCoach {
  teamId: string
  teamName: string
  groupName: string | null
}

export interface AdminInboxSafeguardingItem {
  memberUserId: string
  name: string
  teamNames: string[]
  status: Exclude<ComplianceRecordStatus, 'VALID'>
  expiresAt: string | null
  recordId: string | null
}

export interface AdminInboxOffice {
  office: RequiredClubOffice
}

export interface AdminInbox {
  generatedAt: string
  /** Sum of every section count; drives "n offene Aufgaben". */
  totalOpen: number
  memberCount: number
  teamCount: number
  joinRequests: AdminInboxSection<AdminInboxJoinRequest>
  staffAccessRequests: AdminInboxSection<AdminInboxStaffRequest>
  overdueDues: AdminInboxSection<AdminInboxOverdueDue> & {
    /** Total overdue amount in minor units. */
    amount: number
    currency: string
  }
  teamsWithoutHeadCoach: AdminInboxSection<AdminInboxTeamWithoutCoach>
  safeguarding: AdminInboxSection<AdminInboxSafeguardingItem>
  unfilledOffices: AdminInboxSection<AdminInboxOffice>
}

// ── Paginated member list ────────────────────────────────────────────────

export const MEMBER_LIST_FILTERS = ['all', 'active', 'passive', 'youth'] as const
export type MemberListFilter = (typeof MEMBER_LIST_FILTERS)[number]

export const memberListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100),
  offset: z.coerce.number().int().min(0).default(0),
  filter: z.enum(MEMBER_LIST_FILTERS).default('all'),
  q: z.string().trim().max(120).optional(),
})
export type MemberListQuery = z.infer<typeof memberListQuerySchema>

export interface MemberListPage<T = unknown> {
  items: T[]
  total: number
  offset: number
  limit: number
  /** Counts per filter over the whole club (ignores q/offset). */
  counts: Record<MemberListFilter, number>
}

// ── Admin member summary (member sheet) ─────────────────────────────────

export interface AdminMemberSummary {
  userId: string
  name: string
  email: string | null
  avatarUrl: string | null
  role: 'OWNER' | 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT'
  operationalRoles: string[]
  isYouth: boolean
  teams: Array<{ teamId: string; teamName: string; role: string }>
  contribution: {
    status: 'PENDING' | 'PAID' | 'PARTIAL' | 'WAIVED' | 'EXEMPT' | 'OVERDUE'
    amount: number
    currency: string
    dueDate: string | null
    planName: string | null
  } | null
  sepaMandate: { issuedAt: string | null } | null
  dataConsent: { issuedAt: string | null; source: 'RECORD' | 'PARENTAL_CONSENT' } | null
  /** Null when the member needs no Führungszeugnis (no youth staff role). */
  safeguarding: { status: ComplianceRecordStatus; expiresAt: string | null; recordId: string | null } | null
}

// ── Member export (GET /clubs/:clubId/members/export) ───────────────────

/** Query: emails are only included when explicitly requested. */
export const memberExportQuerySchema = z
  .object({
    includeEmails: z
      .enum(['true', 'false', '1', '0'])
      .optional()
      .transform((value) => value === 'true' || value === '1'),
  })
  .strict()
export type MemberExportQuery = z.infer<typeof memberExportQuerySchema>

export interface MemberExportResult {
  fileName: string
  /** UTF-8 CSV with BOM, `;`-separated, CRLF line endings. */
  csv: string
  rowCount: number
  includeEmails: boolean
}

// ── Accent-insensitive member search ─────────────────────────────────────

const GERMAN_TRANSLITERATION: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
}

/** Lower-case, strip diacritics (José → jose, Müller → muller, ß → ss). */
export function foldSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * True when `query` matches `value` ignoring case and accents. German
 * transliterations also match (Mueller finds Müller), so members can type
 * names the way they would on a keyboard without umlauts.
 */
export function matchesSearchText(value: string | null | undefined, query: string): boolean {
  const needle = foldSearchText(query)
  if (!needle) return true
  if (!value) return false
  if (foldSearchText(value).includes(needle)) return true
  const transliterated = value
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => GERMAN_TRANSLITERATION[char] ?? char)
  return foldSearchText(transliterated).includes(needle)
}
