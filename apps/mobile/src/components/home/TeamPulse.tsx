import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Icon, PressableScale, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'
import { hairline, radius, space } from '../../theme/tokens'
import type { HomeAnnouncement, HomeChannel } from '../../hooks/usePlayerHome'

export type TeamPulseProps = {
  channel: HomeChannel | null
  announcements: HomeAnnouncement[]
}

/**
 * What the rest of the team has been saying.
 *
 * One grouped surface rather than the two separate bordered cards this used to
 * be — chat and announcements are the same idea (things other people posted)
 * and giving each its own card was what made home feel like a pile.
 */
export function TeamPulse({ channel, announcements }: TeamPulseProps) {
  const c = useClubColors()
  const { t } = useTranslation()

  if (!channel && announcements.length === 0) return null

  return (
    <View style={styles.section}>
      <Text variant="caption2" tracking="wide" weight="bold" color="tertiary">
        {t('home.player.pulseTitle', { defaultValue: 'From your team' }).toUpperCase()}
      </Text>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        {channel ? (
          <PressableScale
            onPress={() => router.push('/(tabs)/chat')}
            accessibilityRole="button"
            accessibilityLabel={t('home.teamChat', { defaultValue: 'Team chat' })}
            haptic="tapLight"
            style={styles.row}
          >
            <View style={[styles.iconWell, { backgroundColor: hexToRgba(c.primary, 0.12) }]}>
              <Icon name="bubble" size={16} color={c.primary} />
            </View>
            <View style={styles.rowText}>
              <Text variant="callout" weight="semibold" color="primary" numberOfLines={1}>
                {t('home.teamChat', { defaultValue: 'Team chat' })}
              </Text>
              <Text variant="footnote" color="secondary" numberOfLines={1}>
                {channel.lastMessage
                  ? `${channel.lastMessage.senderName}: ${channel.lastMessage.contentPreview}`
                  : t('home.teamChatEmpty', { defaultValue: 'Say hi to your teammates' })}
              </Text>
            </View>
            {channel.unreadCount > 0 ? (
              <View style={[styles.badge, { backgroundColor: c.primary }]}>
                <Text variant="caption2" weight="bold" tabular style={{ color: c.textInverse }}>
                  {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
                </Text>
              </View>
            ) : (
              <Icon name="chevron.right" size={14} color="tertiary" />
            )}
          </PressableScale>
        ) : null}

        {announcements.map((announcement, index) => (
          <View
            key={announcement.id}
            style={[
              styles.row,
              styles.announcementRow,
              (channel || index > 0) && {
                borderTopWidth: hairline,
                borderTopColor: c.borderSubtle,
              },
            ]}
          >
            <View style={[styles.iconWell, { backgroundColor: c.surfaceSunken }]}>
              <Icon name="megaphone" size={16} color={c.textSecondary} />
            </View>
            <View style={styles.rowText}>
              <Text variant="callout" weight="semibold" color="primary" numberOfLines={1}>
                {announcement.title}
              </Text>
              <Text variant="footnote" color="secondary" numberOfLines={2}>
                {announcement.body}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  announcementRow: { alignItems: 'flex-start' },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: space['2xs'] },
  badge: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: space.xs + 1,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
