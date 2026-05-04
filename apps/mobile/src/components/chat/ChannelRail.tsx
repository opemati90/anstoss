/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'
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

  function labelFor(ch: Channel): string {
    switch (ch.kind) {
      case 'TEAM':
        return t('chat.channelGeneral', { defaultValue: 'General' })
      case 'ANNOUNCEMENTS':
        return t('chat.channelAnnouncements', { defaultValue: 'Ankündigungen' })
      case 'COACHES':
        return t('chat.channelCoaches', { defaultValue: 'Trainer' })
      case 'PARENTS':
        return t('chat.channelParents', { defaultValue: 'Eltern' })
      case 'CLUB_NEWS':
        return t('chat.channelClubNews', { defaultValue: 'Vereinsnews' })
      case 'CUSTOM':
        return ch.name || t('chat.channelGroup', { defaultValue: 'Gruppe' })
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
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
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
              style={[
                styles.label,
                { color: active ? c.surface : c.textPrimary },
              ]}
            >
              {labelFor(ch)}
            </Text>
            {ch.unreadCount > 0 && !active ? (
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
    paddingVertical: 6,
    gap: space.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  label: {
    fontFamily: fonts.label,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
})