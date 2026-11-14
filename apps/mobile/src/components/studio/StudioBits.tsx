import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { FONT_FAMILY_DISPLAY, RADIUS_FULL, SPACING_LG, SPACING_XS } from '../../theme/tokens'
import { STUDIO_ON_WORKSPACE, STUDIO_WORKSPACE_RING } from '../../theme/studio'

const CHIP_HEIGHT = 40
const CHIP_GAP = 6
const CHIP_NUMBER = 17
const SWITCH_WIDTH = 48
const SWITCH_HEIGHT = 28
const SWITCH_PAD = 3
const KNOB = 22

/** The credits glyph: two concentric rings (boards 38–42). */
export function CreditsIcon({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={12} r={4.5} stroke={color} strokeWidth={2} />
    </Svg>
  )
}

/** The AI sparkle on the KI-Variante tile. */
export function SparkleIcon({ size = 22, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Balance chip on Studio home and in the editor; opens the Credits screen. */
export function CreditsChip({ balance, onDark, testID }: { balance: number; onDark?: boolean; testID?: string }) {
  const { t } = useTranslation()
  const c = useClubColors()
  const fg = onDark ? STUDIO_ON_WORKSPACE : c.textPrimary
  return (
    <Pressable
      onPress={() => router.push('/studio/credits' as never)}
      accessibilityRole="button"
      accessibilityLabel={t('studio.creditsA11y', { count: balance })}
      testID={testID ?? 'studio-credits-chip'}
      hitSlop={SPACING_XS}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: onDark ? STUDIO_WORKSPACE_RING : c.borderStrong },
        pressed && styles.pressed,
      ]}
    >
      <CreditsIcon size={16} color={fg} />
      <Text allowFontScaling={false} style={[styles.chipNumber, { color: fg }]}>
        {balance.toLocaleString('de-DE')}
      </Text>
    </Pressable>
  )
}

/** The boards' `.swt` switch: 48 × 28, ink when on. */
export function StudioSwitch({
  value,
  onChange,
  label,
  testID,
}: {
  value: boolean
  onChange?: (next: boolean) => void
  label: string
  testID?: string
}) {
  const c = useClubColors()
  const body = (
    <View
      style={[
        styles.switch,
        { backgroundColor: value ? c.ink : c.borderStrong, justifyContent: value ? 'flex-end' : 'flex-start' },
      ]}
    >
      <View style={[styles.knob, { backgroundColor: value ? c.onInk : c.surface }]} />
    </View>
  )
  if (!onChange) return body
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={SPACING_XS * 2}
      testID={testID}
    >
      {body}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    height: CHIP_HEIGHT,
    borderRadius: RADIUS_FULL,
    borderWidth: 1,
    paddingHorizontal: SPACING_LG - 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: CHIP_GAP,
  },
  chipNumber: { fontFamily: FONT_FAMILY_DISPLAY, fontSize: CHIP_NUMBER, lineHeight: CHIP_NUMBER * 1.15 },
  pressed: { opacity: 0.7 },
  switch: {
    width: SWITCH_WIDTH,
    height: SWITCH_HEIGHT,
    borderRadius: RADIUS_FULL,
    padding: SWITCH_PAD,
    flexDirection: 'row',
  },
  knob: { width: KNOB, height: KNOB, borderRadius: RADIUS_FULL },
})
