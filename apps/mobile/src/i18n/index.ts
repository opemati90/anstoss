import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getLocales } from 'expo-localization'
import de from './de'
import en from './en'

const deviceLanguage = getLocales()[0]?.languageCode ?? 'de'

i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  lng: deviceLanguage === 'de' ? 'de' : 'en',
  fallbackLng: 'de', // German is the primary market
  interpolation: {
    escapeValue: false, // React already escapes
  },
})

export default i18n
