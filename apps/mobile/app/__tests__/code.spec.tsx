import { render } from '@testing-library/react-native'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

// Code screen was merged into /phone (single combined screen with
// progressive disclosure). The /code route now just redirects.
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => href,
}))

import Code from '../(auth)/code'

describe('Code (legacy redirect)', () => {
  it('redirects to /(auth)/phone', () => {
    const { toJSON } = render(<Code />)
    expect(toJSON()).toBe('/(auth)/phone')
  })
})
