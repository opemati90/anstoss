import { render } from '@testing-library/react-native'
import { AppleSignInButton } from './AppleSignInButton'
const ReactNative: typeof import('react-native') = require('react-native')

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationButton: 'AppleAuthenticationButton',
  AppleAuthenticationButtonType: { CONTINUE: 2 },
  AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 2 },
}))

afterEach(() => jest.restoreAllMocks())

it.each(['light', 'dark'] as const)('uses compact native branding in %s mode', scheme => {
  jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme)
  jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 393, height: 852, scale: 3, fontScale: 1 })
  const onPress = jest.fn()
  const screen = render(<AppleSignInButton disabled={false} onPress={onPress} />)
  const button = screen.getByTestId('sign-in-apple')
  expect(button.props.buttonType).toBe(2)
  expect(button.props.buttonStyle).toBe(scheme === 'dark' ? 0 : 2)
  expect(button.props.style).toMatchObject({ height: 44, width: '100%' })
  expect(button.props.cornerRadius).toBe(22)
  button.props.onPress()
  expect(onPress).toHaveBeenCalledTimes(1)
})

it('keeps larger text accessible and blocks presses while busy', () => {
  jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 393, height: 852, scale: 3, fontScale: 2 })
  const onPress = jest.fn()
  const screen = render(<AppleSignInButton disabled onPress={onPress} />)
  const button = screen.getByTestId('sign-in-apple')
  expect(button.props.style).toMatchObject({ height: 88, opacity: 0.5 })
  expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true })
  button.props.onPress()
  expect(onPress).not.toHaveBeenCalled()
})
