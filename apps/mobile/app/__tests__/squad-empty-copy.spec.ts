import { getSquadEmptyCopy } from '../../src/lib/squadEmptyCopy'
import de from '../../src/i18n/de'
import en from '../../src/i18n/en'
import fr from '../../src/i18n/fr'
import itLocale from '../../src/i18n/it'
import pt from '../../src/i18n/pt'
import tr from '../../src/i18n/tr'

describe('squad empty-state copy', () => {
  it('does not tell a player to manage or invite the roster', () => {
    expect(getSquadEmptyCopy('ACTIVE', false)).toEqual(expect.objectContaining({
      title: 'No players to show yet',
      body: 'Your coach is still setting up this squad.',
      titleKey: 'squad.empty.memberTitle',
    }))
  })

  it('gives managers a direct setup instruction', () => {
    expect(getSquadEmptyCopy('ACTIVE', true)).toEqual(expect.objectContaining({
      title: 'Build your squad',
      body: 'Invite players or let them claim an open roster slot.',
      titleKey: 'squad.empty.title',
    }))
  })

  it('keeps secondary buckets role-aware', () => {
    expect(getSquadEmptyCopy('TRIAL', false).body).toBe(
      'Your coach has not added any trial players.',
    )
    expect(getSquadEmptyCopy('INACTIVE', true).body).toBe(
      'Players you deactivate will remain available here.',
    )
  })

  it('localizes every role-aware empty state in each supported language', () => {
    const locales = { de, en, fr, it: itLocale, pt, tr } as const
    const keys = [
      'memberTitle',
      'memberBody',
      'trialTitle',
      'trialManagerBody',
      'trialMemberBody',
      'inactiveTitle',
      'inactiveManagerBody',
      'inactiveMemberBody',
    ] as const

    for (const dictionary of Object.values(locales)) {
      const empty = (
        dictionary as unknown as { squad: { empty: Record<string, string> } }
      ).squad.empty
      for (const key of keys) {
        expect(empty[key]).toBeTruthy()
      }
    }
  })
})
