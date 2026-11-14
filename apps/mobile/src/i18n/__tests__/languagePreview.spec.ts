import { createInstance } from 'i18next'
import de from '../de'
import en from '../en'
import fr from '../fr'
import itLocale from '../it'
import pt from '../pt'
import tr from '../tr'

const locales = { de, en, fr, it: itLocale, pt, tr }
const previewKeys = [
  'onboardingFlow.language.preview',
  'onboardingFlow.language.previewBody',
  'onboardingFlow.language.note',
  'onboardingFlow.language.apply',
  'onboardingFlow.welcome.claim',
  'onboardingFlow.welcome.joinCta',
  ...Object.keys(locales).map((code) => `onboardingFlow.language.names.${code}`),
]

describe('language preview uses the selected locale without fallback', () => {
  for (const [language, locale] of Object.entries(locales)) {
    it(`has all preview copy in ${language}`, async () => {
      const i18n = createInstance()
      await i18n.init({ resources: { [language]: { translation: locale } }, lng: language, fallbackLng: false })
      for (const key of previewKeys) {
        expect(i18n.exists(key)).toBe(true)
        expect(i18n.t(key)).not.toBe(key)
      }
      if (language !== 'de') {
        expect(i18n.t('onboardingFlow.language.previewBody')).not.toContain('Termine, Zusagen')
        expect(i18n.t('onboardingFlow.welcome.joinCta')).not.toBe('Verein beitreten')
      }
    })
  }
})
