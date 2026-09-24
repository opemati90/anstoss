import { formatPush } from './push.templates'
import type { Locale } from '../i18n/translations'

const LOCALES: Locale[] = ['de', 'en', 'fr', 'it', 'pt', 'tr']

describe('formatPush localization', () => {
  it('localizes the contribution-due notification across all locales', () => {
    const data = {
      clubName: 'FC Lichtenberg',
      planName: 'Jahresbeitrag',
      amountLabel: '120,00 €',
      dueDate: '01.07.2026',
    }
    const expected: Record<Locale, { title: string; bodyHas: string }> = {
      de: { title: 'FC Lichtenberg: Beitrag fällig', bodyHas: 'fällig am' },
      en: { title: 'FC Lichtenberg: fee due', bodyHas: 'due' },
      fr: { title: 'FC Lichtenberg : cotisation à régler', bodyHas: 'échéance' },
      it: { title: 'FC Lichtenberg: quota da pagare', bodyHas: 'scadenza' },
      pt: { title: 'FC Lichtenberg: quota por pagar', bodyHas: 'até' },
      tr: { title: 'FC Lichtenberg: aidat ödemesi', bodyHas: 'son ödeme tarihi' },
    }
    for (const l of LOCALES) {
      const out = formatPush('CONTRIBUTION_DUE', data, l)
      expect(out.title).toBe(expected[l].title)
      expect(out.body).toContain(expected[l].bodyHas)
      expect(out.body).toContain('120,00 €')
      expect(out.channelId).toBe('events')
    }
  })

  it('defaults to German when no locale is given', () => {
    const out = formatPush('FULL_TIME', { scoreline: 'A 2–1 B' })
    expect(out.title).toBe('Schlusspfiff')
    expect(out.body).toBe('A 2–1 B')
  })

  it('branches the trial-response title + body on accepted', () => {
    const accepted = formatPush(
      'TRIAL_RESPONSE',
      { playerName: 'Max', accepted: true, teamName: 'U17' },
      'fr',
    )
    expect(accepted.title).toContain('a accepté')
    expect(accepted.body).toContain('confirmée')

    const declined = formatPush(
      'TRIAL_RESPONSE',
      { playerName: 'Max', accepted: false, teamName: 'U17' },
      'fr',
    )
    expect(declined.title).toContain('a refusé')
    expect(declined.body).toContain('nouvelle invitation')
  })

  it('keeps passthrough notifications locale-agnostic', () => {
    for (const l of LOCALES) {
      const out = formatPush(
        'CHAT_MESSAGE',
        { senderName: 'Max', teamName: 'U17', messagePreview: 'hi' },
        l,
      )
      expect(out.title).toBe('Max · U17')
      expect(out.body).toBe('hi')
    }
  })

  it('localizes goal + full-time titles, passes scoreline through', () => {
    expect(formatPush('GOAL', { scoreline: 'A 1–0 B' }, 'pt').title).toBe('Golo!')
    expect(formatPush('GOAL', { scoreline: 'A 1–0 B' }, 'tr').title).toBe('Gol!')
    expect(formatPush('GOAL', { scoreline: 'A 1–0 B' }, 'pt').body).toBe('A 1–0 B')
    expect(formatPush('FULL_TIME', { scoreline: 'A 1–0 B' }, 'it').title).toBe('Fischio finale')
    expect(formatPush('FULL_TIME', { scoreline: 'A 1–0 B' }, 'tr').title).toBe('Maç sona erdi')
  })

  it('localizes join-request + welcome notifications', () => {
    const req = formatPush('JOIN_REQUEST', { userName: 'Anna', clubName: 'FCL' }, 'de')
    expect(req.title).toBe('Neue Beitrittsanfrage')
    expect(req.body).toBe('Anna möchte FCL beitreten')

    const welcome = formatPush('JOIN_APPROVED', { clubName: 'FCL' }, 'pt')
    expect(welcome.title).toBe('Bem-vindo ao FCL!')
  })

  it('renders Turkish copy without suffixes glued to variables', () => {
    const join = formatPush('JOIN_REQUEST', { userName: 'Tim Weber', clubName: 'SV Albatros' }, 'tr')
    expect(join.title).toBe('Yeni üyelik başvurusu')
    expect(join.body).toBe('Tim Weber, SV Albatros kulübüne katılmak istiyor')
    const offer = formatPush('TRIAL_OFFER', { clubName: 'SV Albatros', teamName: 'U19' }, 'tr')
    expect(offer.body).toContain('lisans başvurusu')
    const rsvp = formatPush(
      'RSVP_UPDATE',
      { userName: 'Lukas', status: 'YES', eventTitle: 'Antrenman' },
      'tr',
    )
    expect(rsvp.body).toBe('Katılıyor · Antrenman')
  })

  it('localizes RSVP answers instead of leaking the enum', () => {
    const body = (l: Locale) =>
      formatPush('RSVP_UPDATE', { userName: 'Tim', status: 'NO', eventTitle: 'Training' }, l).body
    expect(body('de')).toBe('Absage · Training')
    expect(body('en')).toBe('Not going · Training')
    for (const l of LOCALES) expect(body(l)).not.toMatch(/^NO /)
  })

  it('keeps emoji out of every title', () => {
    const emoji = /\p{Extended_Pictographic}/u
    const samples = {
      EVENT_CREATED: { teamName: 'U17', eventType: 'training', eventTitle: 'Training', date: 'Sa., 04.10.' },
      EVENT_UPDATED: { teamName: 'U17', eventTitle: 'Training', date: 'Sa., 04.10.' },
      EVENT_CANCELLED: { teamName: 'U17', eventTitle: 'Training', date: 'Sa., 04.10.', reason: '' },
      EVENT_REMINDER: { eventTitle: 'Training', timeUntil: 'in 1 Stunde' },
      GOAL: { scoreline: 'A 1–0 B' },
    } as const
    for (const l of LOCALES) {
      for (const [type, data] of Object.entries(samples)) {
        expect(formatPush(type as keyof typeof samples, data as never, l).title).not.toMatch(emoji)
      }
    }
  })
})
