import { Image, Pressable, StyleSheet, View } from 'react-native'
import { Icon, Text } from '../ui'
import { HomeRoleChip } from './HomeRoleChip'
import { useClubColors } from '../../context/ClubThemeContext'
import { radius, space } from '../../theme/tokens'

export type HomeHeaderProps = {
  clubName: string
  clubBadgeUrl: string | null
  roleLabel: string
  notificationCount: number
  onNotificationsPress: () => void
}

export function HomeHeader({
  clubName,
  clubBadgeUrl,
  roleLabel,
  notificationCount,
  onNotificationsPress,
}: HomeHeaderProps) {
  const c = useClubColors()
  const hasUnread = notificationCount > 0
  const accessibilityLabel = hasUnread
    ? `Notifications, ${notificationCount} unread`
    : 'Notifications'

  return (
    <View style={styles.root}>
      <View style={styles.left}>
        <View style={[styles.badgeWrap, { backgroundColor: c.surfaceSunken ?? c.surface }]}>
          {clubBadgeUrl ? (
            <Image source={{ uri: clubBadgeUrl }} style={styles.badgeImg} />
          ) : (
            <Icon name="shield.fill" size={18} color="tertiary" />
          )}
        </View>
        <View style={styles.textCol}>
          <Text variant="headline" weight="semibold" color="primary" numberOfLines={1}>
            {clubName}
          </Text>
          <HomeRoleChip label={roleLabel} />
        </View>
      </View>
      <Pressable
        onPress={onNotificationsPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.bell,
          { backgroundColor: c.surface, borderColor: c.borderDefault },
          pressed && { opacity: 0.9 },
        ]}
      >
        <Icon name="bell.fill" size={18} color="primary" />
        {hasUnread ? (
          <View style={[styles.dot, { backgroundColor: c.error }]}>
            <Text variant="caption2" weight="bold" color="inverse" tabular>
              {notificationCount > 9 ? '9+' : notificationCount}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
  },
  badgeWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badgeImg: {
    width: 40,
    height: 40,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  bell: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
