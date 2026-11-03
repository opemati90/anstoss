import i18next from 'i18next'
import en from '../en'

it('describes missing check-ins without asserting absence in English plural forms', async () => {
  const i18n = i18next.createInstance()
  await i18n.init({ lng: 'en', resources: { en: { translation: en } } })
  expect(i18n.t('event.checkIn.noShows', { count: 1 })).toBe('1 confirmed, not checked in')
  expect(i18n.t('event.checkIn.noShows', { count: 2 })).toBe('2 confirmed, not checked in')
})
