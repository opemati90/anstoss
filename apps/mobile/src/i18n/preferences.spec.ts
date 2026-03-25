import {
  parseStoredLanguagePreference,
  resolveInitialLanguage,
  serializeLanguagePreference,
} from './preferences'

describe('language preferences', () => {
  it('defaults to German when there is no stored preference', () => {
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

  it('falls back to German for malformed stored values', () => {
    expect(parseStoredLanguagePreference('{bad-json')).toBeNull()
    expect(resolveInitialLanguage('{bad-json')).toBe('de')
  })
})
