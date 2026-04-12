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
import { hairline, space } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'

/**
 * Inline notice bar used at the top of a screen body. Replaces the
 * legacy beige "Needs review" / warning boxes. Follows Apple's inline
 * banner pattern: tinted background, hairline border, symbol, short
 * title + optional body, optional action.
 *
 * Example:
 *   <Banner
 *     tone="warning"
 *     icon="exclamationmark.triangle.fill"
 *     title="1 trial player to review"
 *     description="Approve or deny to keep the roster tidy."
 *     action={{ label: 'Review', onPress: openReview }}
 *   />
 */
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
      return {
        bg: hexWithAlpha(c.success, 0.1),
        border: hexWithAlpha(c.success, 0.2),
        fg: c.success,
      }
    case 'warning':
      return {
        bg: hexWithAlpha(c.warning, 0.1),
        border: hexWithAlpha(c.warning, 0.2),
        fg: c.warning,
      }
    case 'error':
      return {
        bg: hexWithAlpha(c.error, 0.1),
        border: hexWithAlpha(c.error, 0.2),
        fg: c.error,
      }
    case 'tint':
      return {
        bg: c.clubPrimaryLight,
        border: hexWithAlpha(c.clubPrimary, 0.2),
        fg: c.clubPrimary,
      }
    case 'info':
    default:
      return {
        bg: hexWithAlpha(c.info, 0.1),
        border: hexWithAlpha(c.info, 0.2),
        fg: c.info,
      }
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

function hexWithAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex
  if (!hex.startsWith('#')) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: 12,
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
    marginTop: space.xs,
    alignSelf: 'flex-start',
  },
  dismiss: {
    paddingTop: 2,
    marginLeft: space.xs,
  },
})
