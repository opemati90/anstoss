import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, hairline, radius, space } from '../../theme/tokens'

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
  const { t, i18n } = useTranslation()
  const [event, setEvent] = useState<ChildEvent | null>(null)
  const [upcoming, setUpcoming] = useState<ChildEvent[]>([])
  const [announcements, setAnnouncements] = useState<ChildAnnouncement[]>([])

  const load = useCallback(async () => {
    const [evs, anns] = await Promise.all([
      api<ChildEvent[]>('/me/children-events?limit=5').catch(() => []),
      api<ChildAnnouncement[]>('/me/children-announcements?limit=3').catch(() => []),
    ])
    setEvent(evs?.[0] ?? null)
    setUpcoming(evs?.slice(1, 5) ?? [])
    setAnnouncements(anns ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <View style={styles.root}>
      {/* Hero — next event for child */}
      {event ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/event-detail',
              params: { eventId: event.id },
            } as never)
          }
          accessibilityRole="button"
          accessibilityLabel={event.title}
          style={({ pressed }) => [
            styles.hero,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
            pressed && { opacity: 0.96 },
          ]}
        >
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {[event.teamDisplayName || event.teamName, formatEyebrow(event.date, i18n.language)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text variant="title2" color="primary" weight="semibold" style={styles.heroTitle}>
            {event.title}
          </Text>
          {event.location ? (
            <View style={styles.metaRow}>
              <Icon name="mappin.circle" size={14} color="tertiary" />
              <Text variant="footnote" color="secondary" numberOfLines={1}>
                {event.location}
              </Text>
            </View>
          ) : null}
        </Pressable>
      ) : (
        <EmptyCard
          message={t('home.parent.noEvents', {
            defaultValue: 'No events for your child right now.',
          })}
        />
      )}

      {/* Upcoming list */}
      {upcoming.length > 0 ? (
        <>
          <Text variant="footnote" color="secondary" style={styles.sectionLabel}>
            {t('home.parent.upcoming', { defaultValue: 'Upcoming' }).toUpperCase()}
          </Text>
          <View style={styles.list}>
            {upcoming.map((ev) => (
              <Pressable
                key={ev.id}
                onPress={() =>
                  router.push({
                    pathname: '/event-detail',
                    params: { eventId: ev.id },
                  } as never)
                }
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                  pressed && { opacity: 0.96 },
                ]}
              >
                <View
                  style={[
                    styles.dayChip,
                    {
                      backgroundColor: c.surfaceSunken ?? c.background,
                      borderColor: c.borderDefault,
                    },
                  ]}
                >
                  <Text variant="caption2" color="secondary" style={styles.dayChipDow}>
                    {formatWeekday(ev.date, i18n.language).toUpperCase()}
                  </Text>
                  <Text variant="callout" color="primary" weight="semibold" tabular>
                    {String(new Date(ev.date).getDate()).padStart(2, '0')}
                  </Text>
                </View>
                <View style={styles.rowBody}>
                  <Text variant="callout" color="primary" numberOfLines={1}>
                    {ev.title}
                  </Text>
                  <Text variant="caption2" color="secondary">
                    {ev.teamDisplayName || ev.teamName}
                    {ev.location ? ` · ${ev.location}` : ''}
                  </Text>
                </View>
                <Icon name="chevron.right" size={14} color="tertiary" />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {/* Announcements */}
      <Text variant="footnote" color="secondary" style={styles.sectionLabel}>
        {t('home.announcements', { defaultValue: 'Announcements' }).toUpperCase()}
      </Text>
      {announcements.length === 0 ? (
        <EmptyCard
          message={t('announcements.empty', { defaultValue: 'No announcements.' })}
        />
      ) : (
        <View style={styles.list}>
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

function formatWeekday(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { weekday: 'short' })
}

function formatEyebrow(iso: string, locale: string): string {
  const d = new Date(iso)
  const dow = d.toLocaleDateString(locale, { weekday: 'short' })
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  return `${dow.toUpperCase()} · ${time}`
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  hero: {
    padding: space.md + 2,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: space.sm,
  },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heroTitle: { letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  sectionLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.4,
    marginTop: space.sm,
    marginBottom: -space.xs,
  },
  list: { gap: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  dayChip: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipDow: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 0.8,
    marginBottom: -2,
  },
  rowBody: { flex: 1, gap: 1 },

  annRow: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    gap: 4,
  },
  empty: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
})
