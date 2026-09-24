import { getAppLanguage, getAppLocale } from '../../i18n'

/** Current app locale (e.g. "de-DE") for Intl formatting in admin screens. */
export function adminLocale(): string {
  return getAppLocale(getAppLanguage())
}

/** Minor units (cents) to a localised currency string: 15000 -> "150,00 €". */
export function formatMoney(cents: number, currency: string | null | undefined, locale = adminLocale()) {
  const code = (currency || 'EUR').toUpperCase()
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`
  }
}

/** "12.10.2026" style date in the app locale. */
export function formatShortDate(iso: string | null | undefined, locale = adminLocale()) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    date,
  )
}

/** "Sa., 27.09. · 15:00" style date + time in the app locale. */
export function formatEventWhen(iso: string | null | undefined, locale = adminLocale()) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const day = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(date)
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
  return `${day} · ${time}`
}

/** Whole days between now and an ISO date (negative = in the past). */
export function daysFromNow(iso: string | null | undefined): number | null {
  if (!iso) return null
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return null
  return Math.round((time - Date.now()) / (24 * 60 * 60 * 1000))
}

export type AdminRoleLabelKey =
  | 'verein.roleLabel.OWNER'
  | 'verein.roleLabel.ADMIN'
  | 'verein.roleLabel.TREASURER'
  | 'verein.roleLabel.SECRETARY'
  | 'verein.roleLabel.BOARD_MEMBER'

/**
 * Human club-office label for the signed-in admin: Kassenwart, Schriftführer,
 * Vorstand. Never a system role name like "SUPER ADMIN".
 */
export function adminRoleLabelKey(
  role: string | null | undefined,
  operationalRoles: string[] | null | undefined,
): AdminRoleLabelKey {
  const ops = operationalRoles ?? []
  if (ops.includes('TREASURER')) return 'verein.roleLabel.TREASURER'
  if (ops.includes('SECRETARY')) return 'verein.roleLabel.SECRETARY'
  if (ops.includes('BOARD_MEMBER')) return 'verein.roleLabel.BOARD_MEMBER'
  return role === 'OWNER' ? 'verein.roleLabel.OWNER' : 'verein.roleLabel.ADMIN'
}

/** "126 Mitglieder · 8 Mannschaften" built from two properly pluralised keys. */
export function clubCountsLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  members: number,
  teams: number,
) {
  return `${t('verein.memberCount', { count: members })} · ${t('verein.teamCount', { count: teams })}`
}
