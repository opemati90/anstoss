import { Image, Pressable, StyleSheet, View, useColorScheme, useWindowDimensions } from 'react-native'
import { Text } from '../components/ui'
import { GOOGLE_SIGN_IN } from '../theme/providerBrand'
import { socialButtonLayout } from './socialButtonLayout'

/** Use Google's approved filled treatments with the same contrast as Apple.
 * Brand font/logo are intentionally independent of a club's theme.
 * https://developers.google.com/identity/branding-guidelines
 */
export function GoogleSignInButton({ label, onPress, disabled }: {
  label: string
  onPress: () => void
  disabled: boolean
}) {
  const { fontScale } = useWindowDimensions()
  const lightButton = useColorScheme() === 'dark'
  const { height, cornerRadius, fontSize } = socialButtonLayout(fontScale)
  return (
    <Pressable
      testID="sign-in-google"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => { if (!disabled) onPress() }}
      style={({ pressed }) => [styles.button, {
        height, borderRadius: cornerRadius, opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        backgroundColor: lightButton ? GOOGLE_SIGN_IN.background : GOOGLE_SIGN_IN.darkBackground,
        borderColor: lightButton ? GOOGLE_SIGN_IN.border : GOOGLE_SIGN_IN.darkBorder,
      }]}
    >
      <View style={styles.content} pointerEvents="none" accessible={false}>
        <Image
          source={require('../../assets/provider-brand/google-g.png')}
          style={styles.logo}
          resizeMode="contain"
          accessible={false}
        />
        <Text
          style={[styles.label, {
            fontSize, lineHeight: fontSize * 1.2,
            color: lightButton ? GOOGLE_SIGN_IN.foreground : GOOGLE_SIGN_IN.darkForeground,
          }]}
          // Scale the whole control once. Fit long localized labels rather
          // than truncating them or making Google taller than native Apple.
          allowFontScaling={false}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          numberOfLines={1}
        >{label}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: '100%', backgroundColor: GOOGLE_SIGN_IN.background, borderColor: GOOGLE_SIGN_IN.border, borderWidth: 1,
    borderCurve: 'continuous', paddingHorizontal: GOOGLE_SIGN_IN.horizontalPadding, justifyContent: 'center', alignItems: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: GOOGLE_SIGN_IN.logoGap, maxWidth: '100%' },
  logo: { width: GOOGLE_SIGN_IN.logoSize, height: GOOGLE_SIGN_IN.logoSize, flexShrink: 0 },
  label: { fontFamily: GOOGLE_SIGN_IN.fontFamily, fontWeight: '500', color: GOOGLE_SIGN_IN.foreground, textAlign: 'center', flexShrink: 1 },
})
