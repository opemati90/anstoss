export const APP_LANGUAGE_STORAGE_KEY = 'app_language'
export const APP_LANGUAGES = ['de', 'en', 'fr', 'pt', 'it'] as const

export type AppLanguage = (typeof APP_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: AppLanguage = 'de'

type StoredLanguagePreference = {
  language: AppLanguage
  source: 'user'
}

export function normalizeLanguage(value: string | null | undefined): AppLanguage {
  switch (value) {
    case 'en':
    case 'fr':
    case 'pt':
    case 'it':
      return value
    default:
      return 'de'
  }
}

export function parseStoredLanguagePreference(
  rawValue: string | null | undefined,
): AppLanguage | null {
  if (!rawValue) {
    return null
  }

  if (
    rawValue === 'de' ||
    rawValue === 'en' ||
    rawValue === 'fr' ||
    rawValue === 'pt' ||
    rawValue === 'it'
  ) {
    return rawValue
  }

  try {
    const parsed = JSON.parse(rawValue) as StoredLanguagePreference

    if (
      parsed &&
      parsed.source === 'user' &&
      (
        parsed.language === 'de' ||
        parsed.language === 'en' ||
        parsed.language === 'fr' ||
        parsed.language === 'pt' ||
        parsed.language === 'it'
      )
    ) {
      return parsed.language
    }
  } catch {
    // Ignore malformed values and fall back to German.
  }

  return null
}

export function resolveInitialLanguage(
  rawValue: string | null | undefined,
): AppLanguage {
  return parseStoredLanguagePreference(rawValue) ?? DEFAULT_LANGUAGE
}

export function serializeLanguagePreference(language: AppLanguage) {
  return JSON.stringify({
    language: normalizeLanguage(language),
    source: 'user',
  } satisfies StoredLanguagePreference)
}
