import React from 'react'
import { render } from '@testing-library/react-native'
import TeamFamiliesScreen from '../team-families'
import { api } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'

const mockRedirect = jest.fn()
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => { mockRedirect(href); return null },
}))
jest.mock('../../src/api/client', () => ({ api: jest.fn() }))
jest.mock('../../src/context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../src/i18n', () => ({
  getAppLanguage: () => 'de', getAppLocale: () => 'de-DE',
}))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

it('redirects a direct family-management link without mounting or fetching family data', () => {
  render(<TeamFamiliesScreen />)
  expect(mockRedirect).toHaveBeenCalledWith('/(tabs)')
  expect(useAuth).not.toHaveBeenCalled()
  expect(api).not.toHaveBeenCalled()
})
