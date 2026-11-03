/**
 * Event copy rendered on the server (push bodies, chat notices, reminders) in
 * the recipient's language. Covers all six app languages (the shared
 * `Locale`); callers that know the recipient's `preferredLanguage` resolve it
 * with {@link resolveEventLocale}.
 *
 * Derived titles (Event.autoTitle) are never stored in one language: a match
 * reads "Heimspiel gegen X" in German and "Home vs X" in English, a Training
 * "Training" / "Antrenman".
 */

import { INTL_LOCALE_TAG, resolveLocale, type Locale } from '../i18n/translations'

/** Alias of the shared server `Locale` (kept for existing imports). */
export type EventLocale = Locale

export const EVENT_LOCALES: readonly EventLocale[] = ['de', 'en', 'fr', 'it', 'pt', 'tr']

const INTL_TAG: Record<EventLocale, string> = INTL_LOCALE_TAG

const TIME_ZONE = 'Europe/Berlin'

/** ISO-639-1 language (User.preferredLanguage) → event locale; German fallback. */
export function resolveEventLocale(language?: string | null): EventLocale {
  return resolveLocale(language, 'de')
}

/** Short date for push bodies in the reader's language: "Sa., 04.10." / "Sat 04/10". */
export function formatEventDateFor(date: Date, locale: EventLocale): string {
  return new Intl.DateTimeFormat(INTL_TAG[locale], {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: TIME_ZONE,
  }).format(date)
}

const MATCH_TITLE: Record<EventLocale, { HOME: string; AWAY: string; NONE: string }> = {
  de: { HOME: 'Heimspiel gegen {o}', AWAY: 'Auswärtsspiel bei {o}', NONE: 'Spiel gegen {o}' },
  en: { HOME: 'Home vs {o}', AWAY: 'Away at {o}', NONE: 'Match vs {o}' },
  fr: {
    HOME: 'Match à domicile contre {o}',
    AWAY: 'Match à l’extérieur contre {o}',
    NONE: 'Match contre {o}',
  },
  it: { HOME: 'In casa contro {o}', AWAY: 'In trasferta contro {o}', NONE: 'Partita contro {o}' },
  pt: { HOME: 'Jogo em casa contra {o}', AWAY: 'Jogo fora contra {o}', NONE: 'Jogo contra {o}' },
  tr: { HOME: 'İç saha: {o}', AWAY: 'Deplasman: {o}', NONE: 'Maç: {o}' },
}

const TRAINING_TITLE: Record<EventLocale, string> = {
  de: 'Training',
  en: 'Training',
  fr: 'Entraînement',
  it: 'Allenamento',
  pt: 'Treino',
  tr: 'Antrenman',
}

/** Every language's automatic Training title (older rows stored one of these). */
export const DEFAULT_TRAINING_TITLES = new Set(Object.values(TRAINING_TITLE))

/** The language-neutral value stored in Event.title for a derived Training title. */
export const TRAINING_TITLE_FALLBACK = 'Training'

export type TitledEvent = {
  title: string
  type: 'TRAINING' | 'MATCH' | 'OTHER' | string
  opponent?: string | null
  homeAway?: 'HOME' | 'AWAY' | string | null
  autoTitle?: boolean | null
}

export function matchTitleFor(
  opponent: string,
  homeAway: TitledEvent['homeAway'],
  locale: EventLocale,
): string {
  const table = MATCH_TITLE[locale]
  const pattern = homeAway === 'HOME' ? table.HOME : homeAway === 'AWAY' ? table.AWAY : table.NONE
  return pattern.replace('{o}', opponent.trim())
}

/** The title a reader in `locale` sees. A typed title is shown as typed. */
export function eventTitleFor(event: TitledEvent, locale: EventLocale): string {
  const opponent = event.opponent?.trim()
  if (
    event.type === 'MATCH' &&
    opponent &&
    (event.autoTitle || isLegacyMatchTitle(event.title, opponent))
  ) {
    return matchTitleFor(opponent, event.homeAway, locale)
  }
  if (event.type === 'TRAINING' && (event.autoTitle || DEFAULT_TRAINING_TITLES.has(event.title))) {
    return TRAINING_TITLE[locale]
  }
  return event.title
}

function isLegacyMatchTitle(title: string, opponent: string): boolean {
  return title === `vs. ${opponent}` || title === `@ ${opponent}` || title === opponent
}

/**
 * What to store for a title. A Training without a typed title, or a match
 * with an opponent and no own title (or the old "vs. X" / "@ X" one), gets a
 * derived title: `autoTitle` and a neutral fallback in `title`.
 */
export function resolveStoredTitle(input: {
  type: string
  title?: string | null
  opponent?: string | null
}): { title: string; autoTitle: boolean } | null {
  const typed = input.title?.trim() || ''
  const opponent = input.opponent?.trim() || ''
  if (input.type === 'MATCH' && opponent && (!typed || isLegacyMatchTitle(typed, opponent))) {
    return { title: opponent, autoTitle: true }
  }
  if (input.type === 'TRAINING' && (!typed || DEFAULT_TRAINING_TITLES.has(typed))) {
    return { title: TRAINING_TITLE_FALLBACK, autoTitle: true }
  }
  if (typed.length >= 2) return { title: typed, autoTitle: false }
  return null
}

const SQUAD_SELF: Record<EventLocale, string> = {
  de: 'Du bist im Kader für {t} am {d}.',
  en: 'You’re in the squad for {t} on {d}.',
  fr: 'Tu es convoqué pour {t} le {d}.',
  it: 'Sei tra i convocati per {t} il {d}.',
  pt: 'Estás convocado para {t}, {d}.',
  tr: 'Kadroya seçildin. {t}, {d}.',
}

const SQUAD_CHILD: Record<EventLocale, string> = {
  de: '{c} ist im Kader für {t} am {d}.',
  en: '{c} is in the squad for {t} on {d}.',
  fr: '{c} est convoqué pour {t} le {d}.',
  it: '{c} è tra i convocati per {t} il {d}.',
  pt: '{c} está convocado para {t}, {d}.',
  tr: '{c} kadroya seçildi. {t}, {d}.',
}

function fill(pattern: string, values: Record<string, string>): string {
  return (
    pattern
      .replace(/\{(\w)\}/g, (_, key: string) => values[key] ?? '')
      // A German date ends with a dot ("Sa., 10.10."); do not double it at
      // the end of a sentence.
      .replace(/\.\.(?=\s|$)/g, '.')
  )
}

/** SQUAD_NOMINATED: to the player ("Du bist im Kader") or a guardian ("Mia ist im Kader"). */
export function squadNominatedCopy(
  locale: EventLocale,
  data: { eventTitle: string; date: string; childName?: string | null },
): { title: string; body: string } {
  const body = data.childName
    ? fill(SQUAD_CHILD[locale], { c: data.childName, t: data.eventTitle, d: data.date })
    : fill(SQUAD_SELF[locale], { t: data.eventTitle, d: data.date })
  return { title: data.eventTitle, body }
}

const RIDE_CANCELLED_TITLE: Record<EventLocale, string> = {
  de: 'Fahrt abgesagt',
  en: 'Lift cancelled',
  fr: 'Covoiturage annulé',
  it: 'Passaggio annullato',
  pt: 'Boleia cancelada',
  tr: 'Araç paylaşımı iptal',
}

const RIDE_CANCELLED_SELF: Record<EventLocale, string> = {
  de: '{n} fährt nicht mehr zu {t} am {d}. Such dir eine andere Mitfahrgelegenheit.',
  en: '{n} is no longer driving to {t} on {d}. Find another lift.',
  fr: '{n} ne fait plus le trajet pour {t} le {d}. Trouve un autre covoiturage.',
  it: '{n} non guida più per {t} il {d}. Cerca un altro passaggio.',
  pt: '{n} já não dá boleia para {t} ({d}). Procura outra boleia.',
  tr: '{n}, {t} ({d}) için araç paylaşımını iptal etti. Kendine başka bir araç bul.',
}

const RIDE_CANCELLED_CHILD: Record<EventLocale, string> = {
  de: '{n} fährt nicht mehr zu {t} am {d}. {c} braucht eine andere Mitfahrgelegenheit.',
  en: '{n} is no longer driving to {t} on {d}. {c} needs another lift.',
  fr: '{n} ne fait plus le trajet pour {t} le {d}. {c} a besoin d’un autre covoiturage.',
  it: '{n} non guida più per {t} il {d}. {c} ha bisogno di un altro passaggio.',
  pt: '{n} já não dá boleia para {t} ({d}). {c} precisa de outra boleia.',
  tr: '{n}, {t} ({d}) için araç paylaşımını iptal etti. {c} için başka bir araç gerekiyor.',
}

/** CARPOOL ride withdrawn: to a rider, or to the guardian of a child rider. */
export function rideCancelledCopy(
  locale: EventLocale,
  data: { driverName: string; eventTitle: string; date: string; childName?: string | null },
): { title: string; body: string } {
  const values = { n: data.driverName, t: data.eventTitle, d: data.date, c: data.childName ?? '' }
  return {
    title: RIDE_CANCELLED_TITLE[locale],
    body: fill(data.childName ? RIDE_CANCELLED_CHILD[locale] : RIDE_CANCELLED_SELF[locale], values),
  }
}

const RSVP_REMINDER_QUESTION: Record<EventLocale, string> = {
  de: 'Hast du schon zu- oder abgesagt?',
  en: 'Have you replied yet?',
  fr: 'As-tu déjà répondu ?',
  it: 'Hai già dato la tua disponibilità?',
  pt: 'Já respondeste?',
  tr: 'Katılım durumunu bildirdin mi?',
}

const RSVP_REMINDER_CHILD: Record<EventLocale, string> = {
  de: 'Bitte gib die Verfügbarkeit für {c} an.',
  en: 'Please reply with availability for {c}.',
  fr: 'Merci d’indiquer la disponibilité de {c}.',
  it: 'Indica la disponibilità di {c}.',
  pt: 'Indica a disponibilidade de {c}.',
  tr: 'Lütfen {c} için katılım durumunu bildir.',
}

/** Manual "Erinnerung" from the coach to players who have not answered. */
export function rsvpReminderCopy(
  locale: EventLocale,
  data: { event: TitledEvent; date: Date; location?: string | null; childName?: string },
): { title: string; body: string } {
  const when = new Intl.DateTimeFormat(INTL_TAG[locale], {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  }).format(data.date)
  const place = data.location?.trim() ? ` · ${data.location.trim()}` : ''
  return {
    title: eventTitleFor(data.event, locale),
    body: `${when}${place}. ${data.childName
      ? fill(RSVP_REMINDER_CHILD[locale], { c: data.childName })
      : RSVP_REMINDER_QUESTION[locale]}`,
  }
}
