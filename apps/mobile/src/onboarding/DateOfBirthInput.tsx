import { useRef, useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '../components/ui'
import { useClubColors } from '../context/ClubThemeContext'
import { fonts, fontSize, hairline, space } from '../theme/tokens'
import { RADIUS_INPUT } from '../theme/spacing'

export type DobParts = { day: string; month: string; year: string }

export type DobValidation =
  | { status: 'incomplete' }
  | { status: 'invalid' }
  | { status: 'future' }
  | { status: 'valid'; iso: string; age: number }

export function ageOn(date: Date, now = new Date()): number {
  let age = now.getFullYear() - date.getFullYear()
  const m = now.getMonth() - date.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < date.getDate())) age -= 1
  return age
}

/** Pure validation so screens and specs agree on what a valid DOB is. */
export function validateDob(parts: DobParts, now = new Date()): DobValidation {
  if (!parts.day || !parts.month || parts.year.length !== 4) return { status: 'incomplete' }
  const day = Number(parts.day)
  const month = Number(parts.month)
  const year = Number(parts.year)
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return { status: 'invalid' }
  }
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    year < now.getFullYear() - 110
  ) {
    return { status: 'invalid' }
  }
  if (date.getTime() > now.getTime()) return { status: 'future' }
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return { status: 'valid', iso, age: ageOn(date, now) }
}

type Segment = 'day' | 'month' | 'year'

// Anstoss serves German clubs: the chosen UI language must not silently
// change the familiar day/month/year order (plain "en" otherwise means en-US).
const DOB_ORDER: readonly Segment[] = ['day', 'month', 'year']

/**
 * Date of birth as three numeric fields (TT · MM · JJJJ) instead of wheels:
 * number pad, auto-advance, works with a screen reader and at 200 % text.
 */
export function DateOfBirthInput({
  value,
  onChange,
  error,
  hint,
  autoFocus,
}: {
  value: DobParts
  onChange: (next: DobParts) => void
  error?: string | null
  hint?: string | null
  autoFocus?: boolean
}) {
  const c = useClubColors()
  const { t } = useTranslation()
  const order = DOB_ORDER
  const refs = {
    day: useRef<TextInput>(null),
    month: useRef<TextInput>(null),
    year: useRef<TextInput>(null),
  }
  const [focused, setFocused] = useState<Segment | null>(null)

  const meta: Record<Segment, { label: string; placeholder: string; max: number }> = {
    day: {
      label: t('onboardingFlow.dob.day'),
      placeholder: t('onboardingFlow.dob.dayPlaceholder'),
      max: 2,
    },
    month: {
      label: t('onboardingFlow.dob.month'),
      placeholder: t('onboardingFlow.dob.monthPlaceholder'),
      max: 2,
    },
    year: {
      label: t('onboardingFlow.dob.year'),
      placeholder: t('onboardingFlow.dob.yearPlaceholder'),
      max: 4,
    },
  }

  function handleChange(segment: Segment, raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, meta[segment].max)
    onChange({ ...value, [segment]: digits })
    if (digits.length === meta[segment].max) {
      const next = order[order.indexOf(segment) + 1]
      if (next) refs[next].current?.focus()
    }
  }

  return (
    <View style={styles.wrap}>
      <Text variant="subheadline" weight="semibold" color="secondary">
        {t('onboardingFlow.dob.label')}
      </Text>
      <View style={styles.row} testID="dob-segments">
        {order.map((segment, index) => (
          <View key={segment} style={segment === 'year' ? styles.yearCell : styles.cell}>
            <TextInput
              ref={refs[segment]}
              value={value[segment]}
              onChangeText={(raw) => handleChange(segment, raw)}
              onKeyPress={({ nativeEvent }) => {
                if (nativeEvent.key === 'Backspace' && value[segment] === '' && index > 0) {
                  refs[order[index - 1]].current?.focus()
                }
              }}
              onFocus={() => setFocused(segment)}
              onBlur={() => setFocused((current) => (current === segment ? null : current))}
              autoFocus={autoFocus && index === 0}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={meta[segment].max}
              placeholder={meta[segment].placeholder}
              placeholderTextColor={c.textTertiary}
              selectionColor={c.primary}
              accessibilityLabel={meta[segment].label}
              testID={`dob-${segment}`}
              style={[
                styles.input,
                {
                  color: c.textPrimary,
                  backgroundColor: c.surface,
                  borderColor: error ? c.error : focused === segment ? c.primary : c.borderDefault,
                  borderWidth: error || focused === segment ? 2 : hairline * 2,
                },
              ]}
            />
            <Text variant="caption1" color="tertiary" style={styles.caption}>
              {meta[segment].label}
            </Text>
          </View>
        ))}
      </View>
      {error ? (
        <Text variant="footnote" color="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" color="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { flexDirection: 'row', gap: space.sm },
  cell: { flex: 2, minWidth: 0 },
  yearCell: { flex: 3, minWidth: 0 },
  input: {
    minHeight: 56,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    fontFamily: fonts.data,
    fontSize: fontSize.xl,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  caption: { marginTop: space.xs, textAlign: 'center' },
})
