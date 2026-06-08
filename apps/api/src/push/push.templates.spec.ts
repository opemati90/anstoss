import { formatPush } from './push.templates'
import type { Locale } from '../i18n/translations'

const LOCALES: Locale[] = ['de', 'en', 'fr', 'it', 'pt']

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
      en: { title: 'FC Lichtenberg: contribution due', bodyHas: 'due' },
      fr: { title: 'FC Lichtenberg : cotisation à régler', bodyHas: 'échéance' },
      it: { title: 'FC Lichtenberg: contributo da pagare', bodyHas: 'scadenza' },
      pt: { title: 'FC Lichtenberg: contribuição em aberto', bodyHas: 'vence' },
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
    expect(accepted.body).toContain('activer')

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
    expect(formatPush('GOAL', { scoreline: 'A 1–0 B' }, 'pt').title).toBe('⚽ Golo!')
    expect(formatPush('GOAL', { scoreline: 'A 1–0 B' }, 'pt').body).toBe('A 1–0 B')
    expect(formatPush('FULL_TIME', { scoreline: 'A 1–0 B' }, 'it').title).toBe('Fine partita')
  })

  it('localizes join-request + welcome notifications', () => {
    const req = formatPush('JOIN_REQUEST', { userName: 'Anna', clubName: 'FCL' }, 'de')
    expect(req.title).toBe('Neue Beitrittsanfrage')
    expect(req.body).toBe('Anna möchte FCL beitreten')

    const welcome = formatPush('JOIN_APPROVED', { clubName: 'FCL' }, 'pt')
    expect(welcome.title).toBe('Bem-vindo ao FCL!')
  })
})
