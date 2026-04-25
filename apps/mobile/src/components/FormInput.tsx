import { useState } from 'react'
import {
  View,
  TextInput,
  StyleSheet,
  type TextInputProps,
} from 'react-native'
import { InlineError } from './InlineError'
import { useClubColors } from '../context/ClubThemeContext'
import { Text } from './ui/Text'
import {
  hairline,
  INPUT_HEIGHT,
  INPUT_PADDING_HORIZONTAL,
  RADIUS_INPUT,
  SPACING_XS,
  FONT_FAMILY_REGULAR,
  FONT_SIZE_BODY,
} from '../theme/tokens'

type FormInputProps = TextInputProps & {
  label: string
  error?: string | null
  focusColor?: string
}

export function FormInput({ label, error, focusColor, style, ...rest }: FormInputProps) {
  const c = useClubColors()
  const [focused, setFocused] = useState(false)

  const borderColor = error
    ? c.error
    : focused
      ? focusColor || c.primary
      : c.borderDefault

  return (
    <View>
      <Text variant="subheadline" color="secondary" style={styles.label}>
        {label}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            borderColor,
            color: c.textPrimary,
            backgroundColor: c.surface,
          },
          style,
        ]}
        placeholderTextColor={c.textTertiary}
        onFocus={(e) => {
          setFocused(true)
          rest.onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          rest.onBlur?.(e)
        }}
        {...rest}
      />
      <InlineError message={error} />
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    marginBottom: SPACING_XS,
  },
  input: {
    minHeight: INPUT_HEIGHT,
    borderRadius: RADIUS_INPUT,
    borderWidth: hairline,
    paddingHorizontal: INPUT_PADDING_HORIZONTAL,
    fontFamily: FONT_FAMILY_REGULAR,
    fontSize: FONT_SIZE_BODY,
  },
})
