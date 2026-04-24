import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { api } from '../../api/client'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, radius, space } from '../../theme/tokens'

type EventItem = {
  id: string
  type: string
  title: string
  date: string
  location?: string | null
}

type RosterSnapshot = { active: number; trial: number }

export type CoachHomeProps = {
  clubId: string
  teamId: string | null
}

export function CoachHome({ clubId, teamId }: CoachHomeProps) {
  const c = useClubColors()
  const [nextMatch, setNextMatch] = useState<EventItem | null>(null)
  const [thisWeek, setThisWeek] = useState<EventItem[]>([])
  const [roster, setRoster] = useState<RosterSnapshot | null>(null)

  const load = useCallback(async () => {
    if (!teamId) return
    const base = `/clubs/${clubId}/events?teamId=${teamId}`
    const [match, week, r] = await Promise.all([
      api<EventItem[]>(`${base}&scope=nextMatch`).catch(() => []),
      api<EventItem[]>(`${base}&scope=thisWeek`).catch(() => []),
      api<RosterSnapshot>(`/clubs/${clubId}/teams/${teamId}/roster/snapshot`).catch(() => null),
    ])
    setNextMatch(match?.[0] ?? null)
    setThisWeek(week ?? [])
    setRoster(r)
  }, [clubId, teamId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <View style={styles.root}>
      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Next match
      </Text>
      {nextMatch ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/event-detail',
              params: { eventId: nextMatch.id },
            } as never)
          }
          accessibilityRole="button"
          accessibilityLabel={nextMatch.title}
          style={({ pressed }) => [
            styles.matchCard,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
            pressed && { opacity: 0.95 },
          ]}
        >
          <Text variant="title1" color="primary" weight="semibold">
            {nextMatch.title}
          </Text>
          <Text style={[styles.kickoff, { color: c.textPrimary }]} tabular>
            {formatKickoff(nextMatch.date)}
          </Text>
          {nextMatch.location ? (
            <View style={styles.metaRow}>
              <Icon name="mappin.circle.fill" size="sm" color="tertiary" />
              <Text variant="footnote" color="secondary">
                {nextMatch.location}
              </Text>
            </View>
          ) : null}
        </Pressable>
      ) : (
        <EmptyCard message="No match scheduled this week." />
      )}

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        This week
      </Text>
      {thisWeek.length === 0 ? (
        <EmptyCard message="Nothing scheduled yet." />
      ) : (
        <View style={{ gap: space.sm }}>
          {thisWeek.map((ev) => (
            <View
              key={ev.id}
              style={[styles.weekRow, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
            >
              <Icon name="calendar.fill" size={16} color="tertiary" />
              <Text variant="callout" color="primary" numberOfLines={1} style={{ flex: 1 }}>
                {ev.title}
              </Text>
              <Text variant="caption2" color="secondary" tabular>
                {formatDay(ev.date)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Roster
      </Text>
      <View style={styles.rosterRow}>
        <RosterTile label="Active" value={roster?.active ?? 0} />
        <RosterTile label="Trial" value={roster?.trial ?? 0} />
      </View>
    </View>
  )
}

function RosterTile({ label, value }: { label: string; value: number }) {
  const c = useClubColors()
  return (
    <View style={[styles.rosterTile, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
      <Text variant="dataLarge" color="primary" tabular>
        {String(value)}
      </Text>
      <Text variant="footnote" color="secondary">
        {label}
      </Text>
    </View>
  )
}

function EmptyCard({ message }: { message: string }) {
  const c = useClubColors()
  return (
    <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
      <Text variant="footnote" color="secondary">
        {message}
      </Text>
    </View>
  )
}

function formatKickoff(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' })
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  section: { marginTop: space.lg },
  matchCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.sm,
  },
  kickoff: {
    fontFamily: fonts.data,
    fontSize: 44,
    lineHeight: 48,
    marginTop: space.xs,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  rosterRow: { flexDirection: 'row', gap: space.sm },
  rosterTile: {
    flex: 1,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.xs,
  },
  empty: { padding: space.md, borderRadius: radius.lg, borderWidth: 1 },
})
