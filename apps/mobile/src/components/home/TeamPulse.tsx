import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { radius, space } from '../../theme/tokens'
import { HomeCard, HomeRow, HomeSection } from './HomeKit'
import type { HomeAnnouncement, HomeChannel } from '../../hooks/usePlayerHome'

export type TeamPulseProps = {
  channel: HomeChannel | null
  announcements: HomeAnnouncement[]
  /** Coaches get an "Announce" action in the section header. */
  onAnnounce?: () => void
}

/**
 * "Team": what the rest of the team has been saying.
 *
 * Team chat (with its unread count) and the latest announcement, in one
 * grouped surface. Only the newest announcement shows; the chat tab keeps the
 * rest. Hidden entirely when there is nothing to show and nothing to do.
 */
export function TeamPulse({ channel, announcements, onAnnounce }: TeamPulseProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const latest = announcements[0] ?? null

  if (!channel && !latest && !onAnnounce) return null

  const unread = channel?.unreadCount ?? 0

  return (
    <HomeSection
      title={t('homeHub.team', { defaultValue: 'Team' })}
      actionLabel={onAnnounce ? t('homeHub.announce', { defaultValue: 'Announce' }) : undefined}
      actionIcon="megaphone"
      onAction={onAnnounce}
    >
      <HomeCard>
        {channel ? (
          <HomeRow
            icon="bubble"
            tone={unread > 0 ? 'accent' : 'neutral'}
            title={t('home.teamChat', { defaultValue: 'Team chat' })}
            detail={
              channel.lastMessage
                ? `${channel.lastMessage.senderName}: ${channel.lastMessage.contentPreview}`
                : t('home.teamChatEmpty', { defaultValue: 'Say hi to your teammates' })
            }
            accessibilityLabel={
              unread > 0
                ? t('homeHub.chatUnreadA11y', {
                    defaultValue: 'Team chat, {{count}} unread',
                    count: unread,
                  })
                : t('home.teamChat', { defaultValue: 'Team chat' })
            }
            trailing={
              unread > 0 ? (
                <View style={[styles.badge, { backgroundColor: c.primary }]}>
                  <Text variant="caption1" weight="bold" tabular style={{ color: c.onPrimary }}>
                    {unread > 99 ? '99+' : String(unread)}
                  </Text>
                </View>
              ) : null
            }
            onPress={() => router.push('/(tabs)/chat')}
          />
        ) : null}
        {latest ? (
          <HomeRow
            icon="megaphone"
            title={latest.title}
            detail={latest.body}
            showDivider={Boolean(channel)}
          />
        ) : null}
        {!channel && !latest ? (
          <View style={styles.empty}>
            <Text variant="footnote" color="secondary">
              {t('homeHub.coach.noAnnouncements', {
                defaultValue: "No announcements yet. Let the team know what's coming up.",
              })}
            </Text>
          </View>
        ) : null}
      </HomeCard>
    </HomeSection>
  )
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 26,
    height: 24,
    paddingHorizontal: space.sm - 2,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { padding: space.md },
})
