import { View, useColorScheme, useWindowDimensions } from 'react-native'
import { socialButtonLayout } from './socialButtonLayout'

/** Render only after native availability is confirmed. The OS owns the logo,
 * localized title and approved button treatment. Old binaries never import it. */
export function AppleSignInButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  const dark = useColorScheme() === 'dark'
  const { fontScale } = useWindowDimensions()
  // Native Apple typography scales with the control's height (56pt produces
  // a 24pt title). Use its compact 44pt treatment, retaining larger type access.
  const { height, cornerRadius } = socialButtonLayout(fontScale)
  const Apple: typeof import('expo-apple-authentication') = require('expo-apple-authentication')
  return <View pointerEvents={disabled ? 'none' : 'auto'}>
    <Apple.AppleAuthenticationButton
      accessibilityState={{ disabled, busy: disabled }}
      buttonType={Apple.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={dark ? Apple.AppleAuthenticationButtonStyle.WHITE : Apple.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={cornerRadius}
      style={{ height, width: '100%', opacity: disabled ? 0.5 : 1 }}
      onPress={() => { if (!disabled) onPress() }}
      testID="sign-in-apple"
    />
  </View>
}
