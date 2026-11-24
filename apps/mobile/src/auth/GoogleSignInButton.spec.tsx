import { fireEvent, render } from '@testing-library/react-native'
import { AppleSignInButton } from './AppleSignInButton'
import { GoogleSignInButton } from './GoogleSignInButton'
import { GOOGLE_SIGN_IN } from '../theme/providerBrand'
const ReactNative: typeof import('react-native') = require('react-native')

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationButton: 'AppleAuthenticationButton',
  AppleAuthenticationButtonType: { CONTINUE: 2 },
  AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 2 },
}))

afterEach(() => jest.restoreAllMocks())

it.each([1, 1.12, 1.6, 2, 3])('matches Apple capsule geometry at font scale %s', fontScale => {
  jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 320, height: 568, scale: 2, fontScale })
  const screen = render(<>
    <AppleSignInButton disabled={false} onPress={jest.fn()} />
    <GoogleSignInButton label="Continue with Google" disabled={false} onPress={jest.fn()} />
  </>)
  const apple = screen.getByTestId('sign-in-apple')
  const google = ReactNative.StyleSheet.flatten(screen.getByTestId('sign-in-google').props.style)
  expect(google.height).toBe(apple.props.style.height)
  expect(google.borderRadius).toBe(apple.props.cornerRadius)
  expect(google.width).toBe('100%')
  expect(screen.getByText('Continue with Google').props.adjustsFontSizeToFit).toBe(true)
  expect(screen.getByText('Continue with Google').props.allowFontScaling).toBe(false)
  expect(ReactNative.StyleSheet.flatten(screen.getByText('Continue with Google').props.style).fontSize).toBe(16 * Math.max(1, Math.min(fontScale, 2)))
})

it.each(['light', 'dark'] as const)('matches Apple filled contrast in %s mode', theme => {
  jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(theme)
  const screen = render(<GoogleSignInButton label="Continue with Google" disabled={false} onPress={jest.fn()} />)
  const button = ReactNative.StyleSheet.flatten(screen.getByTestId('sign-in-google').props.style)
  const label = ReactNative.StyleSheet.flatten(screen.getByText('Continue with Google').props.style)
  expect(button.backgroundColor).toBe(theme === 'dark' ? GOOGLE_SIGN_IN.background : GOOGLE_SIGN_IN.darkBackground)
  expect(label.color).toBe(theme === 'dark' ? GOOGLE_SIGN_IN.foreground : GOOGLE_SIGN_IN.darkForeground)
})

it('exposes the complete localized label and prevents disabled requests', () => {
  const label = 'Continuer avec Google'
  const onPress = jest.fn()
  const screen = render(<GoogleSignInButton label={label} disabled={false} onPress={onPress} />)
  fireEvent.press(screen.getByRole('button', { name: label }))
  expect(onPress).toHaveBeenCalledTimes(1)
  screen.rerender(<GoogleSignInButton label={label} disabled onPress={onPress} />)
  fireEvent.press(screen.getByRole('button', { name: label }))
  expect(onPress).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('sign-in-google').props.accessibilityState.disabled).toBe(true)
})
