import React from 'react'
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import type { ClubTheme } from '../../theme/club-theme'
import {
  hairline,
  RADIUS_LG,
  SPACING_SM,
  SPACING_XS,
  SPACING_MD,
} from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'

export type BannerTone = 'info' | 'success' | 'warning' | 'error' | 'tint'

export interface BannerProps {
  tone?: BannerTone
  icon?: IconName
  title: string
  description?: string
  action?: {
    label: string
    onPress: () => void
  }
  onDismiss?: () => void
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function Banner({
  tone = 'info',
  icon,
  title,
  description,
  action,
  onDismiss,
  style,
  testID,
}: BannerProps) {
  const c = useClubColors()
  const palette = resolvePalette(tone, c)
  const resolvedIcon = icon ?? defaultIconFor(tone)

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
        style,
      ]}
      accessibilityRole="alert"
      testID={testID}
    >
      {resolvedIcon ? (
        <View style={styles.iconSlot}>
          <Icon name={resolvedIcon} size="md" color={palette.fg} />
        </View>
      ) : null}

      <View style={styles.body}>
        <Text variant="subheadline" weight="semibold" color="primary">
          {title}
        </Text>
        {description ? (
          <Text variant="footnote" color="secondary" style={styles.description}>
            {description}
          </Text>
        ) : null}
        {action ? (
          <Pressable
            onPress={() => {
              Haptics.tap()
              action.onPress()
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={({ pressed }) => [
              styles.actionPressable,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text variant="subheadline" weight="semibold" color={palette.fg}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={({ pressed }) => [styles.dismiss, pressed && { opacity: 0.5 }]}
        >
          <Icon name="xmark" size="sm" color="tertiary" />
        </Pressable>
      ) : null}
    </View>
  )
}

interface Palette {
  bg: string
  border: string
  fg: string
}

function resolvePalette(tone: BannerTone, c: ClubTheme): Palette {
  switch (tone) {
    case 'success':
      return { bg: c.successBg, border: c.success, fg: c.success }
    case 'warning':
      return { bg: c.warningBg, border: c.warning, fg: c.warning }
    case 'error':
      return { bg: c.errorBg, border: c.error, fg: c.error }
    case 'tint':
      return { bg: c.primary50, border: c.primary, fg: c.primary }
    case 'info':
    default:
      return { bg: c.infoBg, border: c.info, fg: c.info }
  }
}

function defaultIconFor(tone: BannerTone): IconName {
  switch (tone) {
    case 'success':
      return 'checkmark.circle.fill'
    case 'warning':
      return 'exclamationmark.triangle.fill'
    case 'error':
      return 'exclamationmark.circle.fill'
    case 'tint':
      return 'star.fill'
    case 'info':
    default:
      return 'info.circle.fill'
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING_SM,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM + 2,
    borderRadius: RADIUS_LG,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  iconSlot: {
    paddingTop: 2,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  description: {
    marginTop: 2,
  },
  actionPressable: {
    marginTop: SPACING_XS,
    alignSelf: 'flex-start',
  },
  dismiss: {
    paddingTop: 2,
    marginLeft: SPACING_XS,
  },
})
