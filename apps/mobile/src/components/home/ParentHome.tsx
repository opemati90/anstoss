import { SPACING_XS } from '../../theme/spacing';
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { api } from '../../api/client'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { radius, space } from '../../theme/tokens'
import { ActionCard } from './ActionCard'

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
      <Text variant="headline" color="primary" weight="semibold">
        Next event
      </Text>
      {event ? (
        <ActionCard
          eyebrow={event.teamDisplayName || event.teamName}
          title={event.title}
          body={[
            new Date(event.date).toLocaleString(),
            event.location ? `· ${event.location}` : null,
          ]
            .filter(Boolean)
            .join(' ')}
          icon="calendar"
          onPress={() => router.push('/(tabs)/events' as never)}
        />
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
  annRow: { padding: space.md, borderRadius: radius.lg, borderWidth: 1, gap: SPACING_XS },
  empty: { padding: space.md, borderRadius: radius.lg, borderWidth: 1 },
})
