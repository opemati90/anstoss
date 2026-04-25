import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { api } from '../../api/client'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { radius, space } from '../../theme/tokens'

type EventItem = {
  id: string
  type: string
  title: string
  date: string
  location?: string | null
  myRsvp: 'YES' | 'MAYBE' | 'NO' | null
  yesCount: number
  maybeCount: number
  noCount: number
}

type ChatPreview = { preview: string; author: string }
type Announcement = { id: string; title: string; body: string }

export type PlayerHomeProps = {
  clubId: string
  teamId: string | null
}

export function PlayerHome({ clubId, teamId }: PlayerHomeProps) {
  const c = useClubColors()
  const [event, setEvent] = useState<EventItem | null>(null)
  const [chat, setChat] = useState<ChatPreview | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  const load = useCallback(async () => {
    if (!teamId) return
    const [evs, chatPreview, anns] = await Promise.all([
      api<EventItem[]>(`/clubs/${clubId}/events?teamId=${teamId}&scope=upcoming`).catch(() => []),
      api<ChatPreview | null>(`/clubs/${clubId}/teams/${teamId}/chat/latest`).catch(() => null),
      api<Announcement[]>(`/clubs/${clubId}/announcements?limit=3`).catch(() => []),
    ])
    setEvent(evs?.[0] ?? null)
    setChat(chatPreview ?? null)
    setAnnouncements(anns ?? [])
  }, [clubId, teamId])

  useEffect(() => {
    void load()
  }, [load])

  const onRsvp = useCallback(
    async (status: 'YES' | 'MAYBE' | 'NO') => {
      if (!event) return
      setEvent({ ...event, myRsvp: status })
      try {
        await api(`/clubs/${clubId}/events/${event.id}/rsvp`, {
          method: 'PUT',
          body: { status },
        })
      } catch {
        // Optimistic update already applied; a full refetch happens on next focus.
      }
    },
    [clubId, event],
  )

  return (
    <View style={styles.root}>
      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Next event
      </Text>
      {event ? (
        <View style={[styles.hero, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="title1" color="primary" weight="semibold">
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
          <View style={styles.rsvpRow}>
            {(['YES', 'MAYBE', 'NO'] as const).map((status) => {
              const active = event.myRsvp === status
              const tone =
                status === 'YES' ? c.success : status === 'MAYBE' ? c.warning : c.error
              return (
                <Pressable
                  key={status}
                  onPress={() => onRsvp(status)}
                  accessibilityRole="button"
                  accessibilityLabel={rsvpLabel(status)}
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.rsvpButton,
                    { backgroundColor: active ? tone : (c.surfaceSunken ?? c.surface) },
                  ]}
                >
                  <Text
                    variant="footnote"
                    weight="semibold"
                    color={active ? 'inverse' : 'primary'}
                  >
                    {rsvpLabel(status)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ) : (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary">
            No upcoming events.
          </Text>
        </View>
      )}

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Team chat
      </Text>
      {chat ? (
        <Pressable
          onPress={() => router.push('/(tabs)/chat' as never)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.chatRow,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
            pressed && { opacity: 0.92 },
          ]}
        >
          <Icon name="bubble.left.fill" size={18} color="tertiary" />
          <View style={{ flex: 1 }}>
            <Text variant="callout" color="primary" weight="semibold" numberOfLines={1}>
              {chat.author}
            </Text>
            <Text variant="footnote" color="secondary" numberOfLines={2}>
              {chat.preview}
            </Text>
          </View>
        </Pressable>
      ) : (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary">
            No messages yet.
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

function rsvpLabel(status: 'YES' | 'MAYBE' | 'NO'): string {
  if (status === 'YES') return 'Yes'
  if (status === 'MAYBE') return 'Maybe'
  return 'No'
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  section: { marginTop: space.lg },
  hero: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.sm,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rsvpRow: { flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  rsvpButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  annRow: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 4,
  },
  empty: { padding: space.md, borderRadius: radius.lg, borderWidth: 1 },
})
