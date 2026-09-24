import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, space } from '../../theme/tokens'
import { RADIUS_INPUT } from '../../theme/spacing'

const LENGTH = 6
const CELL_HEIGHT = 56

export type OtpCellInputProps = {
  value: string
  onChange: (next: string) => void
  /**
   * Fired once the full 6-digit code is entered (typed or SMS-autofilled).
   * Lets the caller auto-verify without a separate button tap.
   */
  onComplete?: (code: string) => void
  autoFocus?: boolean
  /** Paints every cell in the error colour (wrong code). */
  hasError?: boolean
  /** Bump to put the caret back into the field (after a wrong code clears). */
  refocusKey?: number
  /** Screen-reader label; defaults to the localized "6-stelliger Code". */
  accessibilityLabel?: string
}

export function OtpCellInput({
  value,
  onChange,
  onComplete,
  autoFocus = true,
  hasError = false,
  refocusKey,
  accessibilityLabel,
}: OtpCellInputProps) {
  const colors = useClubColors()
  const { t } = useTranslation()
  const inputRef = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)
  const cells = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '')
  const activeIndex = Math.min(value.length, LENGTH - 1)
  const label = accessibilityLabel ?? t('onboardingFlow.code.otpA11y')

  useEffect(() => {
    if (!autoFocus) return
    const id = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(id)
  }, [autoFocus])

  useEffect(() => {
    if (refocusKey === undefined) return
    inputRef.current?.focus()
  }, [refocusKey])

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={styles.wrapper}
      accessibilityRole="none"
      accessibilityLabel={label}
    >
      <View style={styles.row} pointerEvents="none">
        {cells.map((d, i) => {
          const isActive = focused && i === activeIndex
          const isFilled = !!d
          return (
            <View
              key={i}
              testID="otp-cell"
              style={[
                styles.cell,
                {
                  borderColor: hasError
                    ? colors.error
                    : isActive
                      ? colors.primary
                      : isFilled
                        ? colors.textPrimary
                        : colors.border,
                  borderWidth: isActive ? 2 : 1.5,
                  backgroundColor: colors.surfaceSunken,
                },
              ]}
            >
              <Text
                style={[styles.digit, { color: colors.textPrimary }]}
                // Six cells must fit a 320pt phone at 200 % text: the digits
                // grow up to 1.6x, the cell grows in height, never in width.
                maxFontSizeMultiplier={1.6}
              >
                {d}
              </Text>
              {isActive && !isFilled ? (
                <View style={[styles.caret, { backgroundColor: colors.primary }]} />
              ) : null}
            </View>
          )
        })}
      </View>
      <TextInput
        ref={inputRef}
        testID="otp-input"
        value={value}
        onChangeText={(raw) => {
          const next = raw.replace(/\D/g, '').slice(0, LENGTH)
          // Fire onComplete only when crossing from incomplete to complete.
          // Using the current `value` (the previous state) as the baseline
          // means an SMS-autofill re-paste over an already-full code, or a
          // single-digit edit while still 6 long, won't re-trigger verify.
          const justCompleted = value.length < LENGTH && next.length === LENGTH
          onChange(next)
          if (justCompleted) onComplete?.(next)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        importantForAutofill="yes"
        accessibilityLabel={label}
        maxLength={LENGTH}
        autoFocus={autoFocus}
        caretHidden
        returnKeyType="done"
        style={styles.hidden}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  row: {
    flexDirection: 'row',
    gap: space.sm,
    justifyContent: 'center',
  },
  cell: {
    flex: 1,
    minWidth: 0,
    maxWidth: 52,
    minHeight: CELL_HEIGHT,
    paddingVertical: space.xs,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    fontFamily: fonts.data,
    fontSize: fontSize['2xl'],
    lineHeight: fontSize['2xl'] * 1.3,
    fontWeight: '700',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  caret: {
    position: 'absolute',
    width: 2,
    height: 24,
    borderRadius: 1,
  },
  hidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    color: 'transparent',
  },
})
