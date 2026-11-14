import { createInstance } from 'i18next'
import de from '../de'
import en from '../en'
import fr from '../fr'
import itLocale from '../it'
import pt from '../pt'
import tr from '../tr'

const locales = { de, en, fr, it: itLocale, pt, tr }
const keys = [
  'title', 'subtitle', 'later', 'done', 'qrA11y', 'noCode', 'share',
  'copy', 'copied', 'createCode', 'addRosterBody', 'byEmail', 'byEmailBody',
]

describe('invite sharing translations', () => {
  for (const [language, locale] of Object.entries(locales)) {
    it(`resolves every share-screen label in ${language} without fallback`, async () => {
      const i18n = createInstance()
      await i18n.init({
        resources: { [language]: { translation: locale } },
        lng: language,
        fallbackLng: false,
      })
      for (const suffix of keys) {
        const key = `invite.shareScreen.${suffix}`
        expect(i18n.exists(key)).toBe(true)
        expect(i18n.t(key)).not.toBe(key)
      }
      for (const count of [1, 14]) {
        const key = 'invite.shareScreen.validDays'
        expect(i18n.exists(key, { count })).toBe(true)
        expect(i18n.t(key, { count })).toContain(String(count))
      }
      // The older campaign button still uses this scalar key.
      expect(typeof i18n.t('invite.share')).toBe('string')
    })
  }
})
