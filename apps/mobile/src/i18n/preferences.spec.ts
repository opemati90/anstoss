import {
  parseStoredLanguagePreference,
  resolveDeviceLanguage,
  resolveInitialLanguage,
  serializeLanguagePreference,
} from './preferences'

describe('language preferences', () => {
  it('falls back to German when no stored preference and no device locale', () => {
    expect(resolveInitialLanguage(null)).toBe('de')
  })

  it('restores legacy string values from older app versions', () => {
    expect(parseStoredLanguagePreference('en')).toBe('en')
    expect(resolveInitialLanguage('en')).toBe('en')
    expect(parseStoredLanguagePreference('de')).toBe('de')
    expect(resolveInitialLanguage('de')).toBe('de')
  })

  it('restores an explicit stored user preference', () => {
    const storedValue = serializeLanguagePreference('en')

    expect(parseStoredLanguagePreference(storedValue)).toBe('en')
    expect(resolveInitialLanguage(storedValue)).toBe('en')
  })

  it('falls back to German for malformed stored values when no device locale', () => {
    expect(parseStoredLanguagePreference('{bad-json')).toBeNull()
    expect(resolveInitialLanguage('{bad-json')).toBe('de')
  })

  describe('device locale fallback', () => {
    it('uses device locale when no stored preference', () => {
      expect(resolveInitialLanguage(null, ['de-DE'])).toBe('de')
      expect(resolveInitialLanguage(null, ['fr-FR', 'en-US'])).toBe('fr')
      expect(resolveInitialLanguage(null, ['it'])).toBe('it')
    })

    it('walks the device locale list to the first supported one', () => {
      expect(resolveInitialLanguage(null, ['ja-JP', 'de-DE'])).toBe('de')
      expect(resolveInitialLanguage(null, ['zh-Hant', 'en'])).toBe('en')
    })

    it('falls back to German when no device locale is supported', () => {
      expect(resolveInitialLanguage(null, ['ja', 'zh', 'ko'])).toBe('de')
      expect(resolveInitialLanguage(null, [])).toBe('de')
    })

    it('user preference wins over device locale', () => {
      const stored = serializeLanguagePreference('en')
      expect(resolveInitialLanguage(stored, ['de-DE'])).toBe('en')
    })
  })

  describe('resolveDeviceLanguage', () => {
    it('returns null when nothing matches', () => {
      expect(resolveDeviceLanguage(['ja', 'zh'])).toBeNull()
      expect(resolveDeviceLanguage([])).toBeNull()
      expect(resolveDeviceLanguage(null)).toBeNull()
    })

    it('strips region/script suffixes', () => {
      expect(resolveDeviceLanguage(['en-US'])).toBe('en')
      expect(resolveDeviceLanguage(['pt_BR'])).toBe('pt')
    })
  })
})
