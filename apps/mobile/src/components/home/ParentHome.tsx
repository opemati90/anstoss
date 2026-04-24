import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { api } from '../../api/client'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { radius, space, SPACING_MD } from '../../theme/tokens'

type ChildEvent = {
  id: string
  title: string
  date: string
  location?: string | null
  teamName: string
  teamDisplayName: string | null
}

type ChildAnnouncement = { id: string; title: string; body: string }

export function ParentHome() {
  const c = useClubColors()
  const [event, setEvent] = useState<ChildEvent | null>(null)
  const [announcements, setAnnouncements] = useState<ChildAnnouncement[]>([])

  const load = useCallback(async () => {
    const [evs, anns] = await Promise.all([
      api<ChildEvent[]>('/me/children-events?limit=1').catch(() => []),
      api<ChildAnnouncement[]>('/me/children-announcements?limit=3').catch(() => []),
    ])
    setEvent(evs?.[0] ?? null)
    setAnnouncements(anns ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <View style={styles.root}>
      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Next event
      </Text>
      {event ? (
        <Pressable
          onPress={() => router.push('/(tabs)/events' as never)}
          accessibilityRole="button"
          accessibilityLabel={event.title}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
            pressed && { opacity: 0.95 },
          ]}
        >
          <View style={[styles.teamBadge, { backgroundColor: c.primary50 }]}>
            <Text variant="caption2" weight="semibold" color="tint">
              {event.teamDisplayName || event.teamName}
            </Text>
          </View>
          <Text variant="title2" color="primary" weight="semibold">
            {event.title}
          </Text>
          <Text variant="footnote" color="secondary">
            {new Date(event.date).toLocaleString()}
          </Text>
          {event.location ? (
            <View style={styles.metaRow}>
              <Icon name="mappin.circle.fill" size="sm" color="tertiary" />
              <Text variant="footnote" color="secondary">
                {event.location}
              </Text>
            </View>
          ) : null}
        </Pressable>
      ) : (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary">
            No events for your child right now.
          </Text>
        </View>
      )}

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Announcements
      </Text>
      {announcements.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary">
            No announcements.
          </Text>
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          {announcements.map((a) => (
            <View
              key={a.id}
              style={[styles.annRow, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
            >
              <Text variant="callout" color="primary" weight="semibold" numberOfLines={1}>
                {a.title}
              </Text>
              <Text variant="footnote" color="secondary" numberOfLines={2}>
                {a.body}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  section: { marginTop: space.lg },
  card: { padding: space.md, borderRadius: radius.lg, borderWidth: 1, gap: space.sm },
  teamBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING_MD,
    paddingVertical: space.xs,
    borderRadius: 999,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  annRow: { padding: space.md, borderRadius: radius.lg, borderWidth: 1, gap: 4 },
  empty: { padding: space.md, borderRadius: radius.lg, borderWidth: 1 },
})
