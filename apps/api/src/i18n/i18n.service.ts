import { Injectable } from '@nestjs/common'
import { AsyncLocalStorage } from 'async_hooks'
import translations, { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from './translations'

const localeStore = new AsyncLocalStorage<Locale>()

@Injectable()
export class I18nService {
  /**
   * Parse Accept-Language header and return the best matching supported locale.
   */
  static parseLocale(acceptLanguage?: string): Locale {
    if (!acceptLanguage) return DEFAULT_LOCALE

    const preferred = acceptLanguage
      .split(',')
      .map((part) => {
        const [lang, qPart] = part.trim().split(';')
        const q = qPart ? parseFloat(qPart.split('=')[1]) : 1
        return { lang: lang.trim().split('-')[0].toLowerCase(), q }
      })
      .sort((a, b) => b.q - a.q)

    for (const { lang } of preferred) {
      if (SUPPORTED_LOCALES.includes(lang as Locale)) {
        return lang as Locale
      }
    }

    return DEFAULT_LOCALE
  }

  static runWithLocale<T>(locale: Locale, fn: () => T): T {
    return localeStore.run(locale, fn)
  }

  get locale(): Locale {
    return localeStore.getStore() ?? DEFAULT_LOCALE
  }

  t(key: string, fallback?: string): string {
    const locale = this.locale
    return translations[locale]?.[key] ?? translations[DEFAULT_LOCALE]?.[key] ?? fallback ?? key
  }
}
