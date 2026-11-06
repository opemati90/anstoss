import de from '../de'
import en from '../en'
import fr from '../fr'
import italian from '../it'
import pt from '../pt'
import tr from '../tr'
import { onboardingFlowDe } from '../onboardingFlow/de'
import { onboardingFlowEn } from '../onboardingFlow/en'

describe('match status translations', () => {
  it.each([['de', de], ['en', en], ['fr', fr], ['it', italian], ['pt', pt], ['tr', tr]] as const)(
    'provides live and final labels in %s',
    (_language, translations) => {
      expect(translations.matches.watchLive.trim()).not.toBe('')
      expect(translations.matches.fullTime.trim()).not.toBe('')
    },
  )

  it('renders the live action in German rather than English', () => {
    expect(de.matches.watchLive).toBe('Live ansehen')
    expect(de.matches.watchLive).not.toBe(en.matches.watchLive)
  })

  it('describes the club administrator as the reviewer of player requests', () => {
    expect(onboardingFlowDe.pending.body).toContain('Vereinsverwaltung')
    expect(onboardingFlowEn.pending.body).toContain('administrator')
    expect(onboardingFlowDe.pending.body).not.toContain('Trainer')
  })
})
