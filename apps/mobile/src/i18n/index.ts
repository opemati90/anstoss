import AsyncStorage from '@react-native-async-storage/async-storage'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  APP_LANGUAGE_STORAGE_KEY,
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  resolveInitialLanguage,
  serializeLanguagePreference,
  type AppLanguage,
} from './preferences'
import de from './de'
import en from './en'

export {
  APP_LANGUAGES,
  APP_LANGUAGE_STORAGE_KEY,
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  resolveInitialLanguage,
  serializeLanguagePreference,
  type AppLanguage,
} from './preferences'

void i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    escapeValue: false,
  },
})

let initializationPromise: Promise<void> | null = null

export async function initializeI18n() {
  if (initializationPromise) {
    return initializationPromise
  }

  initializationPromise = (async () => {
    const storedLanguage = resolveInitialLanguage(
      await AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY),
    )

    if (i18n.resolvedLanguage !== storedLanguage) {
      await i18n.changeLanguage(storedLanguage)
    }
  })()

  return initializationPromise
}

export async function setAppLanguage(language: AppLanguage) {
  const nextLanguage = normalizeLanguage(language)
  await AsyncStorage.setItem(
    APP_LANGUAGE_STORAGE_KEY,
    serializeLanguagePreference(nextLanguage),
  )
  await i18n.changeLanguage(nextLanguage)
}

export function getAppLanguage(): AppLanguage {
  return normalizeLanguage(i18n.resolvedLanguage || i18n.language)
}

export function getAppLocale(language: AppLanguage) {
  return language === 'de' ? 'de-DE' : 'en-US'
}

export function getLanguageLabel(language: AppLanguage) {
  return language === 'de' ? 'Deutsch' : 'English'
}

export default i18n
