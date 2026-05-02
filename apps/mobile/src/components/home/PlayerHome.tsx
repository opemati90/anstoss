import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ImportedFixture } from '@anstoss/shared'
import { api } from '../../api/client'
import { Text } from '../ui'
import { LiveStatusPill } from '../match'
import { useAuth } from '../../context/AuthContext'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'
import { TEXT_WHITE } from '../../theme/colors'
import { getAppLanguage, getAppLocale } from '../../i18n'
import { hairline, radius, space } from '../../theme/tokens'

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

type Announcement = { id: string; title: string; body: string }

export type PlayerHomeProps = {
  clubId: string
  teamId: string | null
}

export function PlayerHome({ clubId, teamId }: PlayerHomeProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const { user, activeClub, activeTeamAccess } = useAuth()
  const locale = getAppLocale(getAppLanguage())
  const [event, setEvent] = useState<EventItem | null>(null)
  const [fixture, setFixture] = useState<ImportedFixture | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  const load = useCallback(async () => {
    if (!teamId) return
    const [evs, fxs, anns] = await Promise.all([
      api<EventItem[]>(`/clubs/${clubId}/events?teamId=${teamId}&scope=upcoming`).catch(() => []),
      api<ImportedFixture[]>(`/teams/${teamId}/fixtures?scope=upcoming&limit=5`).catch(() => []),
      api<Announcement[]>(`/clubs/${clubId}/announcements?limit=3`).catch(() => []),
    ])
    setEvent(evs?.[0] ?? null)
    // Pick the live fixture if any, else the next upcoming.
    const live = fxs?.find((f) => f.status === 'live') ?? null
    setFixture(live ?? fxs?.[0] ?? null)
    setAnnouncements(anns ?? [])
  }, [clubId, teamId])

  useEffect(() => {
    void load()
  }, [load])

  const onRsvp = useCallback(
    async (status: 'YES' | 'MAYBE' | 'NO') => {
      if (!event) return
      const previousRsvp = event.myRsvp
      setEvent({ ...event, myRsvp: status })
      try {
        await api(`/clubs/${clubId}/events/${event.id}/rsvp`, {
          method: 'PUT',
          body: { status },
        })
      } catch {
        // Revert optimistic state and notify so the UI doesn't lie about
        // the user's RSVP. Alert is intentionally lightweight here; a
        // toast component would be a future polish.
        setEvent((prev) => (prev ? { ...prev, myRsvp: previousRsvp } : prev))
        Alert.alert(
          t('event.rsvpFailedTitle', { defaultValue: 'RSVP not saved' }),
          t('event.rsvpFailedBody', {
            defaultValue: 'Could not save your reply. Tap again when you have a connection.',
          }),
        )
      }
    },
    [clubId, event, t],
  )

  const firstName = (user?.name || '').split(/\s+/)[0] || ''
  const teamLabel = activeTeamAccess?.team.displayName ?? activeClub?.club.name ?? ''

  const eventDate = event ? new Date(event.date) : null
  const eyebrow = event
    ? [event.type.toUpperCase(), formatRelativeShort(eventDate!, t)].filter(Boolean).join(' · ')
    : ''
  const kickoffLine = eventDate
    ? new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
      }).format(eventDate)
    : ''

  const rsvpOptions: Array<{ status: 'YES' | 'MAYBE' | 'NO'; label: string }> = [
    { status: 'YES', label: t('event.rsvpYes') },
    { status: 'MAYBE', label: t('event.rsvpMaybe') },
    { status: 'NO', label: t('event.rsvpNo') },
  ]

  return (
    <View style={styles.root}>
      {/* Greeting — club crest already lives in the tabs header above; just the line */}
      <View style={styles.greetingRow}>
        <View style={{ flex: 1 }}>
          <Text variant="title1" weight="bold" color="primary" numberOfLines={1}>
            {t('home.greetingHi', { defaultValue: 'Hi, {{name}}', name: firstName || t('home.player', { defaultValue: 'Player' }) })}
          </Text>
          {teamLabel ? (
            <Text variant="footnote" color="secondary" numberOfLines={1}>
              {teamLabel}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Today panel — surfaces live fixture if any */}
      {fixture && fixture.status === 'live' ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/match-detail',
              params: { fixtureId: fixture.id, teamId: fixture.teamId },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`${fixture.homeTeam} vs ${fixture.awayTeam} live`}
          style={({ pressed }) => [
            styles.liveCard,
            { backgroundColor: c.primary },
            pressed && { opacity: 0.92 },
          ]}
        >
          <View style={styles.liveHead}>
            <LiveStatusPill status="live" inverse />
            <Text variant="caption2" tracking="wide" weight="semibold" style={{ color: hexToRgba(TEXT_WHITE, 0.7) }}>
              {fixture.competition.toUpperCase()}
            </Text>
          </View>
          <View style={styles.liveScoreRow}>
            <Text variant="footnote" weight="semibold" style={[styles.liveTeam, { color: TEXT_WHITE }]} numberOfLines={1}>
              {fixture.homeTeam}
            </Text>
            <Text variant="largeTitle" tabular weight="bold" style={{ color: TEXT_WHITE }}>
              {fixture.resultHome ?? 0}–{fixture.resultAway ?? 0}
            </Text>
            <Text variant="footnote" weight="semibold" style={[styles.liveTeam, { color: TEXT_WHITE, textAlign: 'right' }]} numberOfLines={1}>
              {fixture.awayTeam}
            </Text>
          </View>
        </Pressable>
      ) : null}

      {/* Match hero — club primary background */}
      {event ? (
        <Pressable
          onPress={() => {
            // For MATCH events linked to an imported fixture, route to the
            // rebuilt match-detail screen (MatchHero + Time Line/Lineup/Stats).
            // Match by kickoff proximity since EventFeedItem doesn't carry
            // fixtureId directly.
            if (event.type === 'MATCH' && fixture && fixture.teamId) {
              const eventTime = new Date(event.date).getTime()
              const fixtureTime = new Date(fixture.kickoffAt).getTime()
              if (Math.abs(eventTime - fixtureTime) < 5 * 60 * 1000) {
                router.push({
                  pathname: '/match-detail',
                  params: { fixtureId: fixture.id, teamId: fixture.teamId },
                })
                return
              }
            }
            router.push({ pathname: '/event-detail', params: { eventId: event.id } })
          }}
          accessibilityRole="button"
          accessibilityLabel={event.title}
          style={({ pressed }) => [
            styles.matchHero,
            { backgroundColor: c.primary },
            pressed && { opacity: 0.92 },
          ]}
        >
          <Text
            variant="caption2"
            tracking="wide"
            weight="semibold"
            style={{ color: hexToRgba(TEXT_WHITE, 0.7) }}
          >
            {eyebrow}
          </Text>
          <Text
            variant="title2"
            weight="bold"
            numberOfLines={2}
            style={[styles.matchTitle, { color: TEXT_WHITE }]}
          >
            {event.title}
          </Text>
          <View style={[styles.matchKickoffRule, { borderTopColor: hexToRgba(TEXT_WHITE, 0.2) }]}>
            <Text variant="footnote" style={{ color: hexToRgba(TEXT_WHITE, 0.85) }}>
              {kickoffLine}
              {event.location ? `  ·  ${event.location}` : ''}
            </Text>
          </View>

          <View style={styles.rsvpRow}>
            {rsvpOptions.map((option) => {
              const isActive = event.myRsvp === option.status
              return (
                <Pressable
                  key={option.status}
                  onPress={(e) => {
                    ;(e as unknown as { stopPropagation?: () => void } | undefined)?.stopPropagation?.()
                    void onRsvp(option.status)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: isActive }}
                  style={({ pressed }) => [
                    styles.rsvpPill,
                    {
                      backgroundColor: isActive
                        ? TEXT_WHITE
                        : hexToRgba(TEXT_WHITE, 0.14),
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    variant="footnote"
                    weight="semibold"
                    style={{ color: isActive ? c.primary : TEXT_WHITE }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Pressable>
      ) : (
        <View style={[styles.emptyMatch, { borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary">
            {t('home.noUpcomingEvents', { defaultValue: 'No upcoming events.' })}
          </Text>
        </View>
      )}

      {/* Announcements feed */}
      <Text variant="caption2" tracking="wide" weight="semibold" color="tertiary" style={styles.sectionLabel}>
        {t('home.announcements', { defaultValue: 'Announcements' }).toUpperCase()}
      </Text>
      {announcements.length === 0 ? (
        <View style={[styles.emptyRow, { borderTopColor: c.borderDefault }]}>
          <Text variant="footnote" color="tertiary">
            {t('announcements.empty', { defaultValue: 'No announcements.' })}
          </Text>
        </View>
      ) : (
        <View>
          {announcements.map((a, i) => (
            <View
              key={a.id}
              style={[
                styles.feedRow,
                i === 0 && { borderTopWidth: 0 },
                { borderTopColor: c.borderDefault },
              ]}
            >
              <View style={styles.feedBody}>
                <Text variant="callout" color="primary" weight="semibold" numberOfLines={1}>
                  {a.title}
                </Text>
                <Text variant="footnote" color="secondary" numberOfLines={2} style={styles.feedMeta}>
                  {a.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function formatRelativeShort(date: Date, t: (k: string, opts?: Record<string, unknown>) => string): string {
  const diffMs = date.getTime() - Date.now()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return t('home.today', { defaultValue: 'Today' })
  if (diffDays === 1) return t('home.tomorrow', { defaultValue: 'Tomorrow' })
  if (diffDays > 1 && diffDays <= 7) return t('home.inNDays', { defaultValue: 'In {{n}} days', n: diffDays })
  if (diffDays < 0) return t('home.past', { defaultValue: 'Past' })
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date)
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.xs,
  },
  liveCard: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    gap: space.sm,
  },
  liveHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  liveScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  liveTeam: { flex: 1 },
  matchHero: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    gap: space.xs,
  },
  matchTitle: { letterSpacing: -0.4, marginTop: space['2xs'] },
  matchKickoffRule: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderStyle: 'dashed',
  },
  rsvpRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.md,
  },
  rsvpPill: {
    flex: 1,
    paddingVertical: space.sm,
    // eslint-disable-next-line no-restricted-syntax -- TODO Pass 3 spacing
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMatch: {
    padding: space.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  sectionLabel: {
    letterSpacing: 1.4,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  emptyRow: { paddingVertical: space.md, borderTopWidth: hairline },
  feedRow: {
    paddingVertical: space.md,
    borderTopWidth: hairline,
  },
  feedBody: { gap: 2 },
  feedMeta: { lineHeight: 18 },
})
