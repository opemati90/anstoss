import type { TFunction } from 'i18next'
import type { Availability, PositionLine, RsvpAnswer } from './squadModel'

/** "14.10." in German, "10/14" in English — day and month only. */
export function formatDayMonth(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(new Date(iso))
}

/** "Sa., 04.10." — for due dates and events. */
export function formatWeekdayDay(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(iso))
}

/** Short pill copy: "Verletzt · bis 14.10.", "Gesperrt", "Urlaub bis 02.10.". */
export function availabilityPillLabel(
  t: TFunction,
  availability: Availability,
  locale: string,
): string | null {
  switch (availability.kind) {
    case 'INJURED':
      if (availability.until) {
        return t('kader.status.injuredUntil', { date: formatDayMonth(availability.until, locale) })
      }
      if (availability.untilLabel) {
        return t('kader.status.injuredLabel', { label: availability.untilLabel })
      }
      return t('kader.status.injured')
    case 'SUSPENDED':
      return availability.until
        ? t('kader.status.suspendedUntil', { date: formatDayMonth(availability.until, locale) })
        : t('kader.status.suspended')
    case 'UNAVAILABLE':
      return availability.until
        ? t('kader.status.unavailableUntil', { date: formatDayMonth(availability.until, locale) })
        : t('kader.status.unavailable')
    case 'AWAY':
      return availability.until
        ? t('kader.status.awayUntil', { date: formatDayMonth(availability.until, locale) })
        : t('kader.status.away')
    default:
      return null
  }
}

/** L5: "an Herren 2 ausgeliehen bis 30.06." in the source team's Kader. */
export function loanOutLabel(
  t: TFunction,
  member: { loanedOutToTeamName?: string | null; loanedOutUntil?: string | null },
  locale: string,
): string | null {
  if (!member.loanedOutToTeamName && !member.loanedOutUntil) return null
  const team = member.loanedOutToTeamName || t('kader.loan.otherTeam')
  return member.loanedOutUntil
    ? t('kader.loan.outUntil', { team, date: formatDayMonth(member.loanedOutUntil, locale) })
    : t('kader.loan.out', { team })
}

/** H2: why a private chat is not offered, as a localized sentence. */
export function messageBlockedLabel(t: TFunction, reason: string | null | undefined): string | null {
  switch (reason) {
    case 'AGE_UNVERIFIED':
      return t('kader.message.blockedAgeUnverified')
    case 'MINOR_BLOCKED':
    case 'NEEDS_GUARDIAN_LINK':
      return t('kader.message.blockedMinor')
    case 'BLOCKED':
      return t('kader.message.blockedBlocked')
    default:
      return null
  }
}

export function lineLabel(t: TFunction, line: PositionLine | 'COACHES') {
  switch (line) {
    case 'TW':
      return t('kader.lines.goalkeepers')
    case 'ABWEHR':
      return t('kader.lines.defence')
    case 'MITTELFELD':
      return t('kader.lines.midfield')
    case 'STURM':
      return t('kader.lines.attack')
    case 'COACHES':
      return t('kader.lines.coaches')
    default:
      return t('kader.lines.none')
  }
}

export function rsvpLabel(t: TFunction, rsvp: RsvpAnswer | null | undefined) {
  if (rsvp === undefined) return null
  if (rsvp === 'YES') return t('kader.rsvp.yes')
  if (rsvp === 'MAYBE') return t('kader.rsvp.maybe')
  if (rsvp === 'NO') return t('kader.rsvp.no')
  return t('kader.rsvp.none')
}

export function dutyKindLabelKey(kind: string) {
  switch (kind) {
    case 'BIB_CLEANUP':
      return 'kader.duties.kind.bibs'
    case 'LOCKER_ROOM':
      return 'kader.duties.kind.lockerRoom'
    default:
      return 'kader.duties.kind.jerseys'
  }
}
