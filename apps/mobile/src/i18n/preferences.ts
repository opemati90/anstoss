export const APP_LANGUAGE_STORAGE_KEY = 'app_language'
// tr/ar were stub locales (onboarding-welcome only) — removed from launch
// to avoid a German fallback after onboarding + missing RTL. Re-add once
// their translations are complete.
export const APP_LANGUAGES = ['de', 'en', 'fr', 'pt', 'it'] as const

export type AppLanguage = (typeof APP_LANGUAGES)[number]

// Final fallback when the device locale is something we don't ship (e.g. 'ja').
// Anstoss is a German-first app for German amateur clubs — German wins.
export const DEFAULT_LANGUAGE: AppLanguage = 'de'

type StoredLanguagePreference = {
  language: AppLanguage
  source: 'user'
}

export function normalizeLanguage(value: string | null | undefined): AppLanguage {
  // Strip region/script suffixes ("en-US" → "en", "zh-Hant" → "zh") so we
  // match against our two-letter language list.
  const head =
    typeof value === 'string'
      ? value.split(/[-_]/)[0]?.toLowerCase()
      : null
  switch (head) {
    case 'de':
    case 'en':
    case 'fr':
    case 'pt':
    case 'it':
      return head
    default:
      return DEFAULT_LANGUAGE
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
    // Ignore malformed values and fall through to caller's default.
  }

  return null
}

/**
 * Pick the first device locale we ship a translation for. Honours the user's
 * full preference list — e.g. ['ja', 'en', 'de'] returns 'en'.
 */
export function resolveDeviceLanguage(
  deviceLocales: ReadonlyArray<string | null | undefined> | null | undefined,
): AppLanguage | null {
  if (!deviceLocales) return null
  for (const tag of deviceLocales) {
    const head =
      typeof tag === 'string' ? tag.split(/[-_]/)[0]?.toLowerCase() : null
    switch (head) {
      case 'de':
      case 'en':
      case 'fr':
      case 'pt':
      case 'it':
        return head
    }
  }
  return null
}

/**
 * Resolution order:
 *   1. User-saved preference (set via setAppLanguage — sticky across launches)
 *   2. Device locale (only if we ship that translation)
 *   3. DEFAULT_LANGUAGE (English)
 */
export function resolveInitialLanguage(
  rawValue: string | null | undefined,
  deviceLocales?: ReadonlyArray<string | null | undefined> | null,
): AppLanguage {
  return (
    parseStoredLanguagePreference(rawValue) ??
    resolveDeviceLanguage(deviceLocales) ??
    DEFAULT_LANGUAGE
  )
}

export function serializeLanguagePreference(language: AppLanguage) {
  return JSON.stringify({
    language: normalizeLanguage(language),
    source: 'user',
  } satisfies StoredLanguagePreference)
}
