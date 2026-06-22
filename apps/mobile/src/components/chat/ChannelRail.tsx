import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import { api } from '../../api/client'
import type { Channel } from '@anstoss/shared'

export type ChannelRailProps = {
  teamId: string
  selectedChannelId: string | null
  onSelect: (channel: Channel) => void
}

const KIND_PRIORITY: Record<string, number> = {
  TEAM: 0,
  ANNOUNCEMENTS: 1,
  COACHES: 2,
  PARENTS: 3,
  CLUB_NEWS: 4,
  CUSTOM: 5,
}

export function ChannelRail({ teamId, selectedChannelId, onSelect }: ChannelRailProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const [channels, setChannels] = useState<Channel[]>([])
  const scrollRef = useRef<ScrollView>(null)

  function labelFor(ch: Channel): string {
    switch (ch.kind) {
      case 'TEAM':
        return t('chat.channelGeneral', { defaultValue: 'General' })
      case 'ANNOUNCEMENTS':
        return t('chat.channelAnnouncements')
      case 'COACHES':
        return t('chat.channelCoaches')
      case 'PARENTS':
        return t('chat.channelParents')
      case 'CLUB_NEWS':
        return t('chat.channelClubNews')
      case 'CUSTOM':
        return ch.name || t('chat.channelGroup')
      default:
        return ch.name || ch.slug
    }
  }

  useEffect(() => {
    let cancelled = false
    api<Channel[]>(`/teams/${teamId}/channels`)
      .then((data) => {
        if (cancelled) return
        const sorted = (data ?? [])
          .slice()
          .sort(
            (a, b) =>
              (KIND_PRIORITY[a.kind] ?? 99) - (KIND_PRIORITY[b.kind] ?? 99),
          )
        setChannels(sorted)
        if (!selectedChannelId && sorted.length > 0) onSelect(sorted[0])
      })
      .catch(() => {
        // noop
      })
    return () => {
      cancelled = true
    }
  }, [teamId])

  if (channels.length === 0) return null

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      onContentSizeChange={() => {
        // A newly created CUSTOM channel sorts last (KIND_PRIORITY) and would
        // otherwise land off-screen to the right. When it's the selected
        // channel, scroll the rail to the end so its chip is visible — without
        // this, creators "can't find" the group they just made.
        const last = channels[channels.length - 1]
        if (last && last.id === selectedChannelId) {
          scrollRef.current?.scrollToEnd({ animated: true })
        }
      }}
    >
      {channels.map((ch) => {
        const active = ch.id === selectedChannelId
        return (
          <Pressable
            key={ch.id}
            onPress={() => onSelect(ch)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: active ? c.primary : c.surfaceSunken,
                borderColor: active ? c.primary : c.borderDefault,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text
              variant="footnote"
              weight="semibold"
              style={{ color: active ? c.textInverse : c.textPrimary }}
            >
              {labelFor(ch)}
            </Text>
            {active ? (
              <Icon name="info.circle" size={11} color={c.textInverse} />
            ) : ch.unreadCount > 0 ? (
              <View style={[styles.dot, { backgroundColor: c.primary }]} />
            ) : null}
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    gap: space.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
  },
})