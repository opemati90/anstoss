import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import translations, {
  INTL_LOCALE_TAG,
  SUPPORTED_LOCALES,
  resolveLocale,
  type Locale,
} from './translations'
import { PUSH_TEMPLATES, formatPush, type NotificationType } from '../push/push.templates'
import {
  buildContributionReminderEmail,
  buildInviteEmail,
  buildOtpCodeEmail,
  buildOwnershipTransferCodeEmail,
  buildParentHandoffEmail,
  buildPaymentReceiptEmail,
  buildWelcomeEmail,
} from '../email/email-content'
import { buildConsentEmail } from '../consent/consent-email'
import { buildAufnahmeGuardianEmail } from '../clubs/aufnahme-guardian-email'
import { formatDutyAssignedPush } from '../teams/duty-push'
import { rideCancelledCopy, rsvpReminderCopy, squadNominatedCopy } from '../events/event-copy'

/**
 * Server copy must cover every app language (de, en, fr, it, pt, tr).
 * Record<Locale, …> enforces this at compile time; this spec guards the
 * runtime side (no missing keys, no `undefined` in rendered copy) and scans
 * the source for per-locale maps that dodge the Locale type.
 */
const ALL: Locale[] = ['de', 'en', 'fr', 'it', 'pt', 'tr']

const SRC = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [full] : []
  })
}

const SAMPLE: Record<string, unknown> = {
  teamName: 'U17',
  eventType: 'training',
  eventTitle: 'Training',
  date: 'Sa., 04.10.',
  reason: 'Platz gesperrt',
  timeUntil: 'in 1 Stunde',
  location: '',
  userName: 'Tim Weber',
  status: 'YES',
  senderName: 'Lukas Hoffmann',
  messagePreview: 'Hallo',
  kind: 'IMAGE',
  caption: null,
  emoji: '👍',
  clubName: 'SV Albatros',
  planName: 'Jahresbeitrag',
  amountLabel: '120,00 €',
  dueDate: '01.07.2026',
  playerName: 'Tim Weber',
  accepted: true,
  formation: '4-4-2',
  scoreline: 'SV Albatros 2–1 SV Babelsberg 03',
  document: 'Spielerpass',
  childName: 'Mia',
  accessRevoked: true,
  count: 3,
}

describe('server locale coverage', () => {
  it('supports all six app languages with a 24h Intl tag each', () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual([...ALL].sort())
    expect(INTL_LOCALE_TAG).toEqual({
      de: 'de-DE',
      en: 'en-GB',
      fr: 'fr-FR',
      it: 'it-IT',
      pt: 'pt-PT',
      tr: 'tr-TR',
    })
    for (const l of ALL) {
      const time = new Intl.DateTimeFormat(INTL_LOCALE_TAG[l], {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Berlin',
      }).format(new Date('2026-10-04T18:30:00Z'))
      expect(time).toMatch(/20[.:]30/)
      expect(time).not.toMatch(/PM|AM/i)
    }
  })

  it('resolves Turkish in every spelling', () => {
    expect(resolveLocale('tr')).toBe('tr')
    expect(resolveLocale('tr-TR')).toBe('tr')
    expect(resolveLocale('TR_tr')).toBe('tr')
    expect(resolveLocale('ar')).toBe('de')
  })

  it('has every server message key in every locale', () => {
    const keys = Object.keys(translations.en).sort()
    for (const l of ALL) {
      expect(Object.keys(translations[l]).sort()).toEqual(keys)
      for (const value of Object.values(translations[l])) expect(value.trim()).not.toBe('')
    }
  })

  it('renders every push template in every locale', () => {
    for (const type of Object.keys(PUSH_TEMPLATES) as NotificationType[]) {
      const rendered = ALL.map((l) => formatPush(type, SAMPLE as never, l))
      for (const out of rendered) {
        expect(out.title).not.toMatch(/undefined/)
        expect(out.body).not.toMatch(/undefined/)
        expect(`${out.title}${out.body}`.trim()).not.toBe('')
      }
      // A localized template must not hand Turkish readers the German text.
      const localized = new Set(rendered.map((o) => `${o.title}|${o.body}`)).size > 1
      if (localized) {
        const de = rendered[ALL.indexOf('de')]
        const tr = rendered[ALL.indexOf('tr')]
        expect(`${tr.title}|${tr.body}`).not.toBe(`${de.title}|${de.body}`)
      }
    }
  })

  it('renders every email in every locale without gaps', () => {
    const expiresAt = new Date('2026-07-01T10:00:00Z')
    for (const locale of ALL) {
      const club = { clubName: 'SV Albatros', primaryColor: null, badgeUrl: null }
      const emails = [
        buildInviteEmail({ ...club, locale, teamName: 'U17', link: 'https://x', expiresAt, kind: 'MEMBER_INVITE', phase: 'TRIAL', role: 'PLAYER' }),
        buildInviteEmail({ ...club, locale, teamName: 'U17', link: 'https://x', expiresAt, kind: 'PARENT_APPROVAL', phase: 'FULL', role: 'PLAYER', childName: 'Mia' }),
        buildContributionReminderEmail({ ...club, locale, memberName: 'Tim', planName: 'Jahresbeitrag', amountCents: 12000, currency: 'EUR', dueDate: expiresAt, status: 'OVERDUE' }),
        buildPaymentReceiptEmail({ ...club, locale, memberName: 'Tim', planName: 'Jahresbeitrag', amountCents: 12000, currency: 'EUR', paidAt: expiresAt }),
        buildWelcomeEmail({ ...club, locale, memberName: 'Tim', teamName: 'U17', link: 'https://x', roleLabel: 'Spieler' }),
        buildParentHandoffEmail({ locale, childFirstName: '', code: 'AB12' }),
        buildOtpCodeEmail({ locale, code: '123456', expiresInMinutes: 10 }),
        buildOwnershipTransferCodeEmail({ locale, code: '123456', expiresInMinutes: 10 }),
        buildConsentEmail({ ...club, locale, kind: 'request', teamName: 'U13', childName: 'Mia' }),
        buildConsentEmail({ ...club, locale, kind: 'withdrawn_by_club', teamName: 'U13', childName: 'Mia', note: 'Brief' }),
        buildAufnahmeGuardianEmail({ ...club, locale, teamName: 'U17', childName: 'Mia' }),
      ]
      for (const email of emails) {
        expect(email.subject).not.toMatch(/undefined/)
        expect(email.text).not.toMatch(/undefined/)
        expect(email.subject.trim()).not.toBe('')
      }
    }
    // Turkish emails are really Turkish, not the German fallback.
    expect(buildOwnershipTransferCodeEmail({ locale: 'tr', code: '1', expiresInMinutes: 5 }).subject).toContain('onayla')
    expect(buildConsentEmail({ clubName: 'SV Albatros', locale: 'tr', kind: 'request', teamName: 'U13', childName: 'Mia' }).subject).toContain('veli onayı')
  })

  it('renders duty and event copy in every locale', () => {
    for (const l of ALL) {
      expect(formatDutyAssignedPush({ kind: 'JERSEY_CLEANUP', teamName: 'U17', dueDate: new Date() }, l).body).not.toMatch(/undefined/)
      expect(squadNominatedCopy(l, { eventTitle: 'T', date: 'D', childName: 'Mia' }).body).toContain('Mia')
      expect(rideCancelledCopy(l, { driverName: 'Tim', eventTitle: 'T', date: 'D' }).title.trim()).not.toBe('')
      expect(rsvpReminderCopy(l, { event: { title: 'Training', type: 'TRAINING', autoTitle: true }, date: new Date() }).body).not.toMatch(/undefined/)
    }
    expect(formatDutyAssignedPush({ kind: 'JERSEY_CLEANUP', teamName: 'U17', dueDate: null }, 'tr').body).toContain('Forma yıkama')
  })

  it('has no per-locale map in the source without Turkish, and no hardcoded de-DE', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      const rel = relative(SRC, file)
      const count = (key: string) => (text.match(new RegExp(`(^|[{,(\\s])${key}: `, 'gm')) ?? []).length
      const pt = count('pt')
      if (pt > 0 && count('tr') !== pt) offenders.push(`${rel}: pt=${pt} tr=${count('tr')}`)
      if (rel !== join('i18n', 'translations.ts') && /['"`]de-DE['"`]/.test(text)) {
        offenders.push(`${rel}: hardcoded 'de-DE' (use INTL_LOCALE_TAG[locale])`)
      }
      if (/'de' \| 'en' \| 'fr' \| 'it' \| 'pt'(?! \| 'tr')/.test(text)) {
        offenders.push(`${rel}: locale union without 'tr' (use Locale)`)
      }
    }
    expect(offenders).toEqual([])
  })
})
