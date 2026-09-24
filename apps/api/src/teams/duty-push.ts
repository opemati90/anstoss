/**
 * Kader fix M2: push copy for "you're up for a team duty". Kept next to the
 * rota instead of push.templates.ts so the Kader slice does not collide with
 * the chat/events agents editing that file; same shape (title + body per
 * locale, all six app languages via the shared `Locale`).
 */
import { INTL_LOCALE_TAG, resolveLocale, type Locale } from '../i18n/translations'

/** Alias of the shared server `Locale` (kept for existing imports). */
export type DutyPushLocale = Locale

export type DutyPushKind = 'JERSEY_CLEANUP' | 'LOCKER_ROOM' | 'BIB_CLEANUP'

const DUTY_LABEL: Record<DutyPushLocale, Record<DutyPushKind, string>> = {
  de: { JERSEY_CLEANUP: 'Trikotwäsche', LOCKER_ROOM: 'Kabinendienst', BIB_CLEANUP: 'Leibchen waschen' },
  en: { JERSEY_CLEANUP: 'Kit washing', LOCKER_ROOM: 'Changing room duty', BIB_CLEANUP: 'Bib washing' },
  fr: { JERSEY_CLEANUP: 'Lavage des maillots', LOCKER_ROOM: 'Rangement du vestiaire', BIB_CLEANUP: 'Lavage des chasubles' },
  it: { JERSEY_CLEANUP: 'Lavaggio divise', LOCKER_ROOM: 'Turno spogliatoio', BIB_CLEANUP: 'Lavaggio casacche' },
  pt: { JERSEY_CLEANUP: 'Lavagem dos equipamentos', LOCKER_ROOM: 'Arrumação do balneário', BIB_CLEANUP: 'Lavagem dos coletes' },
  tr: { JERSEY_CLEANUP: 'Forma yıkama', LOCKER_ROOM: 'Soyunma odası görevi', BIB_CLEANUP: 'Yelek yıkama' },
}

export function resolveDutyPushLocale(language?: string | null): DutyPushLocale {
  return resolveLocale(language, 'de')
}

export function formatDutyAssignedPush(
  input: { kind: string; teamName: string; dueDate: Date | null },
  locale: DutyPushLocale,
): { title: string; body: string } {
  const kind = (input.kind in DUTY_LABEL.de ? input.kind : 'JERSEY_CLEANUP') as DutyPushKind
  const duty = DUTY_LABEL[locale][kind]
  const intlLocale = INTL_LOCALE_TAG[locale]
  const date = input.dueDate
    ? new Intl.DateTimeFormat(intlLocale, {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        timeZone: 'Europe/Berlin',
      }).format(input.dueDate)
    : null
  const body: Record<DutyPushLocale, string> = date
    ? {
        de: `Du bist dran: ${duty} bis ${date}.`,
        en: `You're up: ${duty} by ${date}.`,
        fr: `C’est ton tour : ${duty} d’ici le ${date}.`,
        it: `Tocca a te: ${duty} entro ${date}.`,
        pt: `É a tua vez: ${duty} até ${date}.`,
        tr: `Sıra sende: ${date} tarihine kadar ${duty}.`,
      }
    : {
        de: `Du bist dran: ${duty}.`,
        en: `You're up: ${duty}.`,
        fr: `C’est ton tour : ${duty}.`,
        it: `Tocca a te: ${duty}.`,
        pt: `É a tua vez: ${duty}.`,
        tr: `Sıra sende: ${duty}.`,
      }
  return { title: input.teamName, body: body[locale] }
}
