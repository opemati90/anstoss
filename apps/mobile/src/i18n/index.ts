import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Localization from 'expo-localization'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  APP_LANGUAGE_STORAGE_KEY,
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  parseStoredLanguagePreference,
  resolveInitialLanguage,
  serializeLanguagePreference,
  type AppLanguage,
} from './preferences'
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
  // every device — but only when it differs from what the server already has
  // (R9: this used to PATCH /me on every launch, e.g. from the e2e bootstrap
  // and before sign-in, where the request could only 401).
  void syncPreferredLanguage().catch(() => undefined)
}

// ── Server language sync (R9) ──────────────────────────────────────────────
// `undefined` = /me not loaded yet (signed out or still loading): never PATCH.
// `null` = the server has no preference stored.
let serverLanguage: string | null | undefined
let syncInFlight: Promise<void> | null = null

/**
 * Called by AuthContext after every /me load (and with `undefined` on sign-out).
 * Adopts the server language when this device has no explicit choice yet, and
 * otherwise pushes the device's explicit choice if it differs.
 */
export function noteServerLanguage(value: string | null | undefined) {
  serverLanguage = value === undefined ? undefined : value ? normalizeLanguage(value) : null
  if (serverLanguage === undefined) return
  void reconcileWithServer().catch(() => undefined)
}

async function reconcileWithServer() {
  const stored = await AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY).catch(() => null)
  const explicitChoice = parseStoredLanguagePreference(stored)
  if (!explicitChoice && serverLanguage) {
    // Fresh install on a second device: follow the account's language.
    if (getAppLanguage() !== serverLanguage) {
      await i18n.changeLanguage(serverLanguage)
    }
    return
  }
  if (explicitChoice) await syncPreferredLanguage()
}

/** PATCH /me only when signed in and the choice differs from the server. */
export async function syncPreferredLanguage(): Promise<void> {
  if (serverLanguage === undefined) return
  const current = getAppLanguage()
  if (serverLanguage === current) return
  if (syncInFlight) return syncInFlight
  syncInFlight = (async () => {
    try {
      await persistPreferredLanguage(current)
      serverLanguage = current
    } finally {
      syncInFlight = null
    }
  })()
  return syncInFlight
}

/** Test hook: forget the server language between specs. */
export function __resetLanguageSyncForTests() {
  serverLanguage = undefined
  syncInFlight = null
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
    case 'tr':
      return 'tr-TR'
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
    case 'tr':
      return 'Türkçe'
    default:
      return 'English'
  }
}

export default i18n
