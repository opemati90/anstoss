import {
  resolveEmailLocale,
  buildInviteEmail,
  buildContributionReminderEmail,
} from './email-content'

describe('resolveEmailLocale', () => {
  it('passes through supported locales', () => {
    for (const l of ['de', 'en', 'fr', 'it', 'pt'] as const) {
      expect(resolveEmailLocale(l)).toBe(l)
    }
  })

  it('strips region subtags', () => {
    expect(resolveEmailLocale('de-DE')).toBe('de')
    expect(resolveEmailLocale('pt-BR')).toBe('pt')
  })

  it('falls back to German for unknown / empty languages', () => {
    expect(resolveEmailLocale('es')).toBe('de')
    expect(resolveEmailLocale(null)).toBe('de')
    expect(resolveEmailLocale(undefined)).toBe('de')
  })

  it('honors an explicit fallback', () => {
    expect(resolveEmailLocale('zz', 'en')).toBe('en')
  })
})

describe('buildInviteEmail', () => {
  const base = {
    clubName: 'FC Lichtenberg',
    primaryColor: '#1E66F5',
    badgeUrl: null,
    teamName: 'U17',
    link: 'https://anstoss.io/join/fc-lichtenberg/ABCD1234',
    expiresAt: new Date('2026-07-01T10:00:00Z'),
  }

  it('localizes a member invitation (German)', () => {
    const out = buildInviteEmail({
      ...base,
      locale: 'de',
      kind: 'MEMBER_INVITE',
      phase: 'FULL',
      role: 'PLAYER',
    })
    expect(out.subject).toContain('Einladung zu U17')
    expect(out.html).toContain('<!DOCTYPE html>')
    expect(out.html).toContain('Du bist eingeladen')
    expect(out.html).toContain(base.link)
    // PLAYER gets the under-16 parental-consent note.
    expect(out.text).toContain('16 Jahre')
  })

  it('localizes a member invitation (French)', () => {
    const out = buildInviteEmail({
      ...base,
      locale: 'fr',
      kind: 'MEMBER_INVITE',
      phase: 'FULL',
      role: 'COACH',
    })
    expect(out.subject).toContain('Invitation à rejoindre')
    expect(out.html).toContain('Vous êtes invité')
    // COACH does not get the under-16 note.
    expect(out.text).not.toMatch(/16 ans/)
  })

  it('uses trial wording for trial invites', () => {
    const out = buildInviteEmail({
      ...base,
      locale: 'en',
      kind: 'MEMBER_INVITE',
      phase: 'TRIAL',
      role: 'PLAYER',
    })
    expect(out.subject).toContain('Trial session')
    expect(out.html).toContain('Trial session invitation')
  })

  it('renders a parent-approval invite with the child name', () => {
    const out = buildInviteEmail({
      ...base,
      locale: 'de',
      kind: 'PARENT_APPROVAL',
      phase: 'FULL',
      role: 'PLAYER',
      childName: 'Max',
    })
    expect(out.subject).toContain('Bitte bestätige Max')
    expect(out.html).toContain('Anmeldung bestätigen')
    expect(out.html).toContain('Max')
  })

  it('escapes HTML in club-controlled values (XSS guard)', () => {
    const out = buildInviteEmail({
      ...base,
      clubName: '<script>alert(1)</script>',
      locale: 'en',
      kind: 'MEMBER_INVITE',
      phase: 'FULL',
      role: 'OTHER',
    })
    expect(out.html).not.toContain('<script>alert(1)</script>')
    expect(out.html).toContain('&lt;script&gt;')
  })
})

describe('buildContributionReminderEmail', () => {
  const base = {
    clubName: 'FC Lichtenberg',
    primaryColor: '#1E66F5',
    badgeUrl: null,
    memberName: 'Anna',
    planName: 'Jahresbeitrag',
    amountCents: 12000,
    currency: 'EUR',
    dueDate: new Date('2026-07-01T10:00:00Z'),
  }

  it('localizes amount + status (German, overdue)', () => {
    const out = buildContributionReminderEmail({ ...base, locale: 'de', status: 'OVERDUE' })
    expect(out.subject).toBe('FC Lichtenberg: Jahresbeitrag fällig')
    expect(out.html).toContain('Beitrag überfällig')
    expect(out.html).toContain('Überfällig')
    // Localized currency formatting (German uses comma + € suffix).
    expect(out.html).toMatch(/120,00/)
  })

  it('localizes status for outstanding (Italian)', () => {
    const out = buildContributionReminderEmail({ ...base, locale: 'it', status: 'OUTSTANDING' })
    expect(out.html).toContain('Contributo da pagare')
    expect(out.html).toContain('Da pagare')
    expect(out.text).toContain('Ciao Anna')
  })

  it('always returns an HTML + text pair', () => {
    const out = buildContributionReminderEmail({ ...base, locale: 'pt', status: 'OUTSTANDING' })
    expect(out.html).toContain('<!DOCTYPE html>')
    expect(out.text.length).toBeGreaterThan(0)
  })
})
