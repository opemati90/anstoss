import { I18nService } from './i18n.service'

describe('I18nService', () => {
  let service: I18nService

  beforeEach(() => {
    service = new I18nService()
  })

  describe('parseLocale', () => {
    it('returns en for empty header', () => {
      expect(I18nService.parseLocale(undefined)).toBe('en')
    })

    it('parses simple locale', () => {
      expect(I18nService.parseLocale('de')).toBe('de')
    })

    it('parses locale with region', () => {
      expect(I18nService.parseLocale('de-DE')).toBe('de')
    })

    it('respects quality values', () => {
      expect(I18nService.parseLocale('en;q=0.5, de;q=0.9')).toBe('de')
    })

    it('falls back to en for unsupported locale', () => {
      expect(I18nService.parseLocale('ja')).toBe('en')
    })
  })

  describe('t', () => {
    it('returns English translation by default', () => {
      expect(service.t('error.not_found')).toBe('Resource not found')
    })

    it('returns German in de context', () => {
      const result = I18nService.runWithLocale('de', () => service.t('error.not_found'))
      expect(result).toBe('Ressource nicht gefunden')
    })

    it('returns key as fallback for unknown key', () => {
      expect(service.t('unknown.key')).toBe('unknown.key')
    })

    it('returns custom fallback for unknown key', () => {
      expect(service.t('unknown.key', 'custom')).toBe('custom')
    })
  })
})
