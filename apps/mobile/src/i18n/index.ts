import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Localization from 'expo-localization'
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
import ar from './ar'
import de from './de'
import en from './en'
import fr from './fr'
import it from './it'
import pt from './pt'
import tr from './tr'

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
    fr: { translation: fr },
    pt: { translation: pt },
    it: { translation: it },
    tr: { translation: tr },
    ar: { translation: ar },
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
    // Locale resolution: stored user preference wins; otherwise pick the
    // first supported language from the device's preference list; English
    // as the final fallback for unsupported locales.
    const stored = await AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
    const deviceLocales = Localization.getLocales().map(
      (l) => l.languageTag ?? l.languageCode,
    )
    const initialLanguage = resolveInitialLanguage(stored, deviceLocales)

    if (i18n.resolvedLanguage !== initialLanguage) {
      await i18n.changeLanguage(initialLanguage)
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
  // Persist to server so chat translation targets the user's choice on
  // every device. Best-effort — server falls back to Accept-Language header.
  void persistPreferredLanguage(nextLanguage).catch(() => undefined)
}

/**
 * Lazy-required to avoid a circular dep between api/client and i18n —
 * api/client imports i18n synchronously, so requiring it eagerly here would
 * deadlock module init. Using `require` (CommonJS) sidesteps the dynamic
 * `import()` ESM flag check.
 */
async function persistPreferredLanguage(language: AppLanguage): Promise<void> {
  const { api } = require('../api/client') as typeof import('../api/client')
  await api('/me', { method: 'PATCH', body: { preferredLanguage: language } })
}

export function getAppLanguage(): AppLanguage {
  return normalizeLanguage(i18n.resolvedLanguage || i18n.language)
}

export function getAppLocale(language: AppLanguage) {
  switch (language) {
    case 'de':
      return 'de-DE'
    case 'fr':
      return 'fr-FR'
    case 'pt':
      return 'pt-PT'
    case 'it':
      return 'it-IT'
    default:
      return 'en-GB'
  }
}

export function getLanguageLabel(language: AppLanguage) {
  switch (language) {
    case 'de':
      return 'Deutsch'
    case 'fr':
      return 'Français'
    case 'pt':
      return 'Português'
    case 'it':
      return 'Italiano'
    default:
      return 'English'
  }
}

export default i18n
