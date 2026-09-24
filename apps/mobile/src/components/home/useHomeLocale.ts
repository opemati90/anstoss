import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getAppLanguage, getAppLocale } from '../../i18n'

/**
 * The one BCP-47 locale every home surface formats dates, times and money
 * with: de-DE, en-GB, fr-FR, it-IT, pt-PT, tr-TR. Recomputed when the
 * language changes, so a switch needs no remount. The formatters in HomeKit
 * force a 24-hour clock on top of it.
 */
export function useHomeLocale(): string {
  const { i18n } = useTranslation()
  const language = i18n?.resolvedLanguage || i18n?.language
  // `language` is the trigger; getAppLanguage reads the live i18n instance.
  return useMemo(() => getAppLocale(getAppLanguage()), [language])
}
