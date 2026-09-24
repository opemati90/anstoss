import AsyncStorage from '@react-native-async-storage/async-storage'

const mockApi = jest.fn().mockResolvedValue({})
jest.mock('../../api/client', () => ({ api: (...args: unknown[]) => mockApi(...args) }))

import i18n, {
  __resetLanguageSyncForTests,
  noteServerLanguage,
  serializeLanguagePreference,
  setAppLanguage,
  APP_LANGUAGE_STORAGE_KEY,
} from '../index'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

// R9: PATCH /me only when the language really differs from the server's.
describe('language sync with the server', () => {
  beforeEach(async () => {
    mockApi.mockClear()
    __resetLanguageSyncForTests()
    await AsyncStorage.removeItem(APP_LANGUAGE_STORAGE_KEY)
    await i18n.changeLanguage('de')
  })

  it('does not PATCH before /me is known (signed out, e2e bootstrap)', async () => {
    await setAppLanguage('en')
    await flush()
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('does not PATCH when the server already has the same language', async () => {
    await AsyncStorage.setItem(APP_LANGUAGE_STORAGE_KEY, serializeLanguagePreference('de'))
    noteServerLanguage('de')
    await flush()
    await setAppLanguage('de')
    await flush()
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('PATCHes once when the user picks a different language', async () => {
    noteServerLanguage('de')
    await flush()
    await setAppLanguage('fr')
    await flush()
    expect(mockApi).toHaveBeenCalledTimes(1)
    expect(mockApi).toHaveBeenCalledWith('/me', {
      method: 'PATCH',
      body: { preferredLanguage: 'fr' },
    })
  })

  it('adopts the account language on a device without an explicit choice', async () => {
    noteServerLanguage('it')
    await flush()
    await flush()
    expect(i18n.language).toBe('it')
    expect(mockApi).not.toHaveBeenCalled()
  })
})
