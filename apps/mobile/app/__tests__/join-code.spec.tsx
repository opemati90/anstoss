import { fireEvent, render } from '@testing-library/react-native'
import JoinCodeScreen from '../join-code'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn() },
}))

jest.mock('react-i18next', () => {
  const t = (key: string) => {
    const map: Record<string, string> = {
      'joinCode.title': 'Enter your invite code',
      'joinCode.placeholder': 'Invite code',
      'joinCode.continue': 'Continue',
      'joinCode.invalid': 'Enter at least 4 characters.',
    }
    return map[key] ?? key
  }
  const translation = { t }
  return {
    useTranslation: () => translation,
    initReactI18next: { type: '3rdParty', init: () => {} },
  }
})

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

describe('JoinCodeScreen', () => {
  beforeEach(() => jest.clearAllMocks())

  it('blocks continue until code >= 4 chars', () => {
    const { getByText, getByPlaceholderText } = render(<JoinCodeScreen />)
    fireEvent.changeText(getByPlaceholderText('Invite code'), 'abc')
    fireEvent.press(getByText('Continue'))
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('replaces to /join/{code} on valid submit', () => {
    const { getByText, getByPlaceholderText } = render(<JoinCodeScreen />)
    fireEvent.changeText(getByPlaceholderText('Invite code'), 'ABCD1234')
    fireEvent.press(getByText('Continue'))
    expect(mockReplace).toHaveBeenCalledWith('/join/ABCD1234')
  })

  it('preserves case for legacy campaign codes and trims before routing', () => {
    const { getByText, getByPlaceholderText } = render(<JoinCodeScreen />)
    fireEvent.changeText(getByPlaceholderText('Invite code'), '  ab12xy  ')
    fireEvent.press(getByText('Continue'))
    expect(mockReplace).toHaveBeenCalledWith('/join/ab12xy')
  })
})
