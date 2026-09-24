import { Injectable } from '@nestjs/common'
import type { MemberExportResult } from '@anstoss/shared'
import { AuditService } from '../audit/audit.service'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from './users.service'
import { INTL_LOCALE_TAG, resolveLocale, type Locale } from '../i18n/translations'

// ── club-admin review fixes (H1/H2): server-side member export ─────────────
// The export used to be assembled on the device from GET /members, which put
// every member's email into a CSV by default, didn't neutralise spreadsheet
// formulas and left no trace. Now: ADMIN-only route, emails opt-in, formula
// cells neutralised, every export audited (who, when, rows, emails or not).

type ExportLocale = Locale

const LABELS: Record<
  ExportLocale,
  {
    columns: { name: string; email: string; role: string; teams: string; status: string; joined: string }
    roles: Record<string, string>
    active: string
    passive: string
    fileStem: string
  }
> = {
  de: {
    columns: { name: 'Name', email: 'E-Mail', role: 'Rolle', teams: 'Mannschaften', status: 'Status', joined: 'Eintritt' },
    roles: { OWNER: 'Vorstand', ADMIN: 'Vereinsverwaltung', COACH: 'Trainer', PLAYER: 'Spieler', PARENT: 'Elternteil' },
    active: 'Aktiv',
    passive: 'Passiv',
    fileStem: 'mitglieder',
  },
  en: {
    columns: { name: 'Name', email: 'Email', role: 'Role', teams: 'Teams', status: 'Status', joined: 'Joined' },
    roles: { OWNER: 'Board', ADMIN: 'Club admin', COACH: 'Coach', PLAYER: 'Player', PARENT: 'Parent' },
    active: 'Active',
    passive: 'Passive',
    fileStem: 'members',
  },
  fr: {
    columns: { name: 'Nom', email: 'E-mail', role: 'Rôle', teams: 'Équipes', status: 'Statut', joined: 'Adhésion' },
    roles: { OWNER: 'Bureau', ADMIN: 'Administration du club', COACH: 'Entraîneur', PLAYER: 'Joueur', PARENT: 'Parent' },
    active: 'Actif',
    passive: 'Passif',
    fileStem: 'membres',
  },
  it: {
    columns: { name: 'Nome', email: 'E-mail', role: 'Ruolo', teams: 'Squadre', status: 'Stato', joined: 'Iscrizione' },
    roles: { OWNER: 'Direttivo', ADMIN: 'Amministrazione società', COACH: 'Allenatore', PLAYER: 'Giocatore', PARENT: 'Genitore' },
    active: 'Attivo',
    passive: 'Non praticante',
    fileStem: 'soci',
  },
  pt: {
    columns: { name: 'Nome', email: 'E-mail', role: 'Função', teams: 'Equipas', status: 'Estado', joined: 'Adesão' },
    roles: { OWNER: 'Direção', ADMIN: 'Administração do clube', COACH: 'Treinador', PLAYER: 'Jogador', PARENT: 'Encarregado de educação' },
    active: 'Ativo',
    passive: 'Não praticante',
    fileStem: 'socios',
  },
  tr: {
    columns: { name: 'Ad', email: 'E-posta', role: 'Rol', teams: 'Takımlar', status: 'Durum', joined: 'Katılım' },
    roles: { OWNER: 'Yönetim kurulu', ADMIN: 'Kulüp yönetimi', COACH: 'Antrenör', PLAYER: 'Oyuncu', PARENT: 'Veli' },
    active: 'Aktif',
    passive: 'Pasif',
    fileStem: 'uyeler',
  },
}

function exportLocale(language: string | null | undefined): ExportLocale {
  return resolveLocale(language, 'de')
}

/** First characters a spreadsheet may interpret as a formula (CSV injection). */
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r'])

/**
 * One CSV cell: formula triggers are neutralised with a leading apostrophe
 * (OWASP CSV injection guidance), then the value is always quoted with inner
 * quotes doubled, so `;`, quotes and line breaks stay inside the cell.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (text.length > 0 && FORMULA_TRIGGERS.has(text[0])) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

/** UTF-8 BOM so Excel opens umlauts correctly; `;` for German Excel; CRLF. */
export function buildCsv(rows: unknown[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`
}

function formatJoined(value: unknown, locale: ExportLocale): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(INTL_LOCALE_TAG[locale], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  }).format(date)
}

@Injectable()
export class MemberExportService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async exportMembers(
    clubId: string,
    actorUserId: string,
    options: { includeEmails: boolean },
    now: Date = new Date(),
  ): Promise<MemberExportResult> {
    const [page, actor, club] = await Promise.all([
      this.users.listClubMembersPage(clubId, actorUserId, {
        limit: Number.MAX_SAFE_INTEGER,
        offset: 0,
        filter: 'all',
      }),
      this.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { preferredLanguage: true },
      }),
      this.prisma.club.findUnique({ where: { id: clubId }, select: { slug: true } }),
    ])
    const locale = exportLocale(actor?.preferredLanguage)
    const labels = LABELS[locale]
    const rows = page.items as Array<{
      role: string
      createdAt?: Date | string | null
      isActive?: boolean
      teamNames?: string[]
      user?: { name?: string | null; email?: string | null } | null
    }>

    const header = [
      labels.columns.name,
      ...(options.includeEmails ? [labels.columns.email] : []),
      labels.columns.role,
      labels.columns.teams,
      labels.columns.status,
      labels.columns.joined,
    ]
    const body = rows.map((row) => [
      row.user?.name ?? '',
      ...(options.includeEmails ? [row.user?.email ?? ''] : []),
      labels.roles[row.role] ?? row.role,
      (row.teamNames ?? []).join(', '),
      row.isActive ? labels.active : labels.passive,
      formatJoined(row.createdAt, locale),
    ])

    await this.audit.log({
      clubId,
      type: 'members.exported',
      actorType: 'user',
      actorId: actorUserId,
      actorLabel: null,
      summary: options.includeEmails
        ? `Exported ${rows.length} members including email addresses.`
        : `Exported ${rows.length} members.`,
      metadata: {
        rowCount: rows.length,
        includeEmails: options.includeEmails,
        exportedAt: now.toISOString(),
      },
    })

    const stem = (club?.slug || 'verein').replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'verein'
    return {
      fileName: `${stem}-${labels.fileStem}-${now.toISOString().slice(0, 10)}.csv`,
      csv: buildCsv([header, ...body]),
      rowCount: rows.length,
      includeEmails: options.includeEmails,
    }
  }
}
