import { memo, useCallback } from 'react'
import { Pressable, StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'
import { hairline, radius, space } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'

export type RsvpStatus = 'YES' | 'MAYBE' | 'NO'

const OPTIONS: Array<{ status: RsvpStatus; icon: string; labelKey: string; fallback: string }> = [
  { status: 'YES', icon: 'checkmark', labelKey: 'event.rsvpYes', fallback: 'Yes' },
  { status: 'MAYBE', icon: 'clock', labelKey: 'event.rsvpMaybe', fallback: 'Maybe' },
  { status: 'NO', icon: 'xmark', labelKey: 'event.rsvpNo', fallback: 'No' },
]

export type RsvpControlProps = {
  value: RsvpStatus | null
  onChange: (status: RsvpStatus) => void
  disabled?: boolean
  /** `compact` drops the icons and shortens the height for dense list rows. */
  size?: 'default' | 'compact'
  style?: StyleProp<ViewStyle>
}

/**
 * The app's single availability control.
 *
 * One accent, deliberately: the selected answer is filled with the club
 * primary and the other two stay neutral. Colour-coding Yes/Maybe/No green /
 * amber / red reads as an alert system rather than a choice, puts three
 * competing hues on the busiest surface in the app, and leaves colour as the
 * only carrier of meaning. The icon plus the fill does that job, accessibly.
 *
 * A selection tick fires on commit — replying is the one interaction in
 * Anstoss that most deserves physical feedback.
 */
export const RsvpControl = memo(function RsvpControl({
  value,
  onChange,
  disabled = false,
  size = 'default',
  style,
}: RsvpControlProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const compact = size === 'compact'

  const handlePress = useCallback(
    (status: RsvpStatus) => {
      if (disabled) return
      Haptics.select()
      onChange(status)
    },
    [disabled, onChange],
  )

  return (
    <View
      style={[
        styles.track,
        compact ? styles.trackCompact : null,
        { backgroundColor: c.surfaceSunken, borderColor: c.borderSubtle },
        disabled && styles.disabled,
        style,
      ]}
      accessibilityRole="radiogroup"
    >
      {OPTIONS.map((option) => {
        const isActive = value === option.status
        const label = t(option.labelKey, { defaultValue: option.fallback })
        return (
          <Pressable
            key={option.status}
            onPress={() => handlePress(option.status)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ selected: isActive, disabled }}
            style={({ pressed }) => [
              styles.option,
              compact ? styles.optionCompact : null,
              isActive
                ? { backgroundColor: c.primary }
                : { backgroundColor: 'transparent' },
              pressed && !isActive && { backgroundColor: hexToRgba(c.primary, 0.1) },
            ]}
          >
            {!compact ? (
              <Icon
                name={option.icon}
                size={14}
                color={isActive ? c.textInverse : c.textSecondary}
              />
            ) : null}
            <Text
              variant="footnote"
              weight={isActive ? 'bold' : 'medium'}
              numberOfLines={1}
              style={{ color: isActive ? c.textInverse : c.textSecondary }}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
})

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: space['2xs'],
    gap: space['2xs'],
  },
  trackCompact: { padding: space['2xs'], gap: space['2xs'] },
  disabled: { opacity: 0.5 },
  option: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: space.xs,
  },
  optionCompact: { minHeight: 34 },
})
