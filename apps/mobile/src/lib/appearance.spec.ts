import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Appearance } from 'react-native'
import {
  APPEARANCE_STORAGE_KEY,
  getAppearancePreference,
  restoreAppearancePreference,
  setAppearancePreference,
} from './appearance'

describe('appearance preferences and release configuration', () => {
  const setColorScheme = jest.spyOn(Appearance, 'setColorScheme')

  beforeEach(async () => {
    jest.clearAllMocks()
    await AsyncStorage.clear()
  })

  it.each(['Info.plist', 'Info-Release.plist'])(
    '%s follows device appearance instead of forcing light mode',
    (filename) => {
      const plist = readFileSync(resolve(__dirname, '../../ios/Anstoss', filename), 'utf8')
      expect(plist).toMatch(/<key>UIUserInterfaceStyle<\/key>\s*<string>Automatic<\/string>/)
    },
  )

  it('defaults to system and clears an existing native override at startup', async () => {
    expect(await getAppearancePreference()).toBe('system')
    await restoreAppearancePreference()
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified')
  })

  it.each(['light', 'dark'] as const)('restores an explicit %s choice', async (preference) => {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, preference)
    await restoreAppearancePreference()
    expect(setColorScheme).toHaveBeenLastCalledWith(preference)
  })

  it('switches back from dark to the system and persists that choice', async () => {
    await setAppearancePreference('dark')
    expect(setColorScheme).toHaveBeenLastCalledWith('dark')
    await setAppearancePreference('system')
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified')
    expect(await getAppearancePreference()).toBe('system')
  })

  it('falls back to system for an invalid saved value', async () => {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'invalid')
    await restoreAppearancePreference()
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified')
  })
})
