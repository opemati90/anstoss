import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import { Icon } from './ui'
import { Text } from './ui/Text'
import {
  hairline,
  RADIUS_FULL,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
} from '../theme/tokens'

type TabScreenHeaderProps = {
  title: string
  subtitle?: string
  eyebrow?: string
  actionLabel?: string
  onActionPress?: () => void
  actionColor?: string
  actionIcon?: string
  actionAccessibilityLabel?: string
  compact?: boolean
}

export function TabScreenHeader({
  title,
  subtitle,
  eyebrow,
  actionLabel,
  onActionPress,
  actionColor,
  actionIcon,
  actionAccessibilityLabel,
  compact = false,
}: TabScreenHeaderProps) {
  const c = useClubColors()
  const resolvedActionColor = actionColor ?? c.textPrimary
  const hasAction = onActionPress && (actionLabel || actionIcon)

  return (
    <View style={[styles.header, compact && styles.headerCompact]}>
      <View style={styles.copy}>
        {eyebrow ? (
          <Text
            variant="caption1"
            color="tertiary"
            tracking="wide"
            style={styles.eyebrow}
          >
            {eyebrow.toUpperCase()}
          </Text>
        ) : null}
        <Text variant="title2" color="primary">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="subheadline" color="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>

      {hasAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel ?? title}
          onPress={onActionPress}
          style={[
            styles.action,
            { borderColor: resolvedActionColor, backgroundColor: c.surface },
            actionLabel == null && styles.iconAction,
          ]}
        >
          {actionIcon ? (
            <Icon name={actionIcon} size="md" color={resolvedActionColor} />
          ) : null}
          {actionLabel ? (
            <Text
              variant="subheadline"
              weight="medium"
              style={{ color: resolvedActionColor }}
            >
              {actionLabel}
            </Text>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: SPACING_MD,
    marginBottom: SPACING_MD,
  },
  headerCompact: {
    marginBottom: SPACING_SM,
  },
  copy: {
    flex: 1,
    gap: SPACING_XS,
  },
  eyebrow: {
    marginBottom: 2,
  },
  action: {
    minHeight: 44,
    paddingHorizontal: SPACING_MD,
    borderRadius: RADIUS_FULL,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: SPACING_XS,
  },
  iconAction: {
    width: 44,
    paddingHorizontal: 0,
  },
})
