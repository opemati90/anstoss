import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import type { FixtureTimelineState, ImportedFixture } from '@anstoss/shared'
import { io, Socket } from 'socket.io-client'
import { Screen, Text, Button } from '../src/components/ui'
import { ErrorState } from '../src/components/ErrorState'
import { ModalHeader } from '../src/components/ModalHeader'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import {
  MatchHero,
  RecordedMatchLive,
  TimelineItem,
  type MatchStatus,
  type TimelineEventKind,
} from '../src/components/match'
import { api } from '../src/api/client'
import {
  hairline,
  RADIUS_CARD,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XXXL,
} from '../src/theme/tokens'

type LiveEvent = {
  kind: TimelineEventKind | 'state'
  minute?: number
  player?: string
  side?: 'home' | 'away'
  detail?: string
  status?: 'live' | 'finished' | 'scheduled'
  resultHome?: number | null
  resultAway?: number | null
  /** Arrival order; timeline-snapshot events get negative values. */
  ts: number
  key: string
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3002'

/** Same de-dupe key match-detail uses, so a socket echo of a snapshot event is dropped. */
function eventKey(e: { minute?: number; kind: string; player?: string; side?: string }) {
  return `${e.minute ?? 0}|${e.kind}|${(e.player || '').slice(0, 24).toLowerCase()}|${e.side ?? ''}`
}

/**
 * Live match. `eventId` opens the coach-recorded match (any MATCH event);
 * `fixtureId` + `teamId` open the fussball.de live feed.
 */
export default function MatchLiveScreen() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>()
  if (eventId) return <RecordedMatchLive eventId={eventId} />
  return <FixtureMatchLive />
}

function FixtureMatchLive() {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const { fixtureId, teamId } = useLocalSearchParams<{
    fixtureId: string
    teamId: string
  }>()
  const { getToken } = useAuth()
  const [fixture, setFixture] = useState<ImportedFixture | null>(null)
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [minute, setMinute] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const socketRef = useRef<Socket | null>(null)

  const load = useCallback(async () => {
    if (!fixtureId || !teamId) {
      setLoading(false)
      setError(true)
      return
    }
    setError(false)
    // Reset any events carried over from a previous (failed) load/retry cycle
    // so a retry never shows stale timeline entries.
    setEvents([])
    try {
      const fixtures = await api<ImportedFixture[]>(`/teams/${teamId}/fixtures?scope=all&limit=50`)
      const f = fixtures?.find((x) => x.id === fixtureId)
      if (f) {
        setFixture(f)
        // Seed minute + Spielverlauf from the ticker snapshot (the same
        // endpoint match-detail reads) so opening mid-match is not empty.
        // Optional: the socket still drives everything after this.
        const snapshot = await api<FixtureTimelineState | null>(
          `/fixtures/${f.id}/timeline`,
        ).catch(() => null)
        if (snapshot) {
          if (snapshot.status === 'live') setMinute(snapshot.minute)
          setEvents((prev) => {
            const seeded = snapshot.events.map((e, i) => ({
              ...e,
              ts: -snapshot.events.length + i,
              key: eventKey(e),
            }))
            const seen = new Set(seeded.map((e) => e.key))
            return [...seeded, ...prev.filter((e) => !seen.has(e.key))]
          })
        }
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [fixtureId, teamId])

  useEffect(() => {
    void load()
  }, [load])

  // Subscribe to live socket namespace
  useEffect(() => {
    // Don't open the socket for an unresolvable match (e.g. a deep-link with no
    // teamId) — the screen shows the error state and there's nothing to join.
    if (!fixtureId || !teamId) return
    let cancelled = false
    ;(async () => {
      const token = await getToken().catch(() => null)
      if (cancelled || !token) return
      const socket = io(`${API_URL}/live`, {
        auth: { token },
        transports: ['websocket'],
      })
      socketRef.current = socket
      socket.emit('live:join', { fixtureId })
      socket.on('live:state', (state: any) => {
        if (typeof state?.minute === 'number') setMinute(state.minute)
        setFixture((prev) =>
          prev
            ? {
                ...prev,
                status: state.status ?? prev.status,
                resultHome: state.resultHome ?? prev.resultHome,
                resultAway: state.resultAway ?? prev.resultAway,
              }
            : prev,
        )
      })
      socket.on('live:event', (event: any) => {
        if (typeof event?.minute === 'number') {
          setMinute((m) => (m === undefined || event.minute > m ? event.minute : m))
        }
        setEvents((prev) => {
          const key = eventKey(event)
          if (prev.some((e) => e.key === key)) return prev
          return [...prev, { ...event, ts: Date.now(), key } as LiveEvent]
        })
      })
    })()
    return () => {
      cancelled = true
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [fixtureId, teamId, getToken])

  // Newest first, like the design's Spielverlauf.
  const timeline = useMemo(
    () =>
      events
        .filter((e) => e.kind !== 'state')
        .sort((a, b) => (b.minute ?? 0) - (a.minute ?? 0) || b.ts - a.ts),
    [events],
  )

  if (loading) {
    return (
      <Screen
        scroll={false}
        padded={false}
        header={<ModalHeader mode="back" onClose={() => router.back()} />}
      >
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} />
        </View>
      </Screen>
    )
  }

  if (error || !fixture) {
    return (
      <Screen
        scroll={false}
        padded={false}
        header={<ModalHeader mode="back" onClose={() => router.back()} />}
      >
        <ErrorState
          message={t('matchLive.unavailableTitle', {
            defaultValue: 'Match unavailable',
          })}
          hint={t('matchLive.unavailableBody', {
            defaultValue:
              'We couldn’t load this match. It may not be linked to an external team-data feed yet.',
          })}
          onRetry={() => {
            setLoading(true)
            void load()
          }}
          fillContainer
        />
      </Screen>
    )
  }

  const status: MatchStatus =
    fixture.status === 'live' ? 'live' : fixture.status === 'finished' ? 'final' : 'scheduled'
  const ownSide =
    typeof fixture.isHome === 'boolean' ? (fixture.isHome ? 'home' : 'away') : null

  const emptyCopy =
    status === 'scheduled'
      ? t('matchLive.notStarted', {
          defaultValue: 'Kick-off hasn’t happened yet. Check back at match time.',
        })
      : status === 'final'
        ? t('matchLive.ended', {
            defaultValue: 'Full time. No live events were recorded.',
          })
        : t('matchLive.waiting', {
            defaultValue: 'Waiting for the next event…',
          })

  const showSummary = status === 'final'

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: (showSummary ? SPACING_XXXL * 3 : SPACING_XXXL) + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
      >
        <MatchHero
          home={{ name: fixture.homeTeam, badgeUrl: fixture.homeLogo }}
          away={{ name: fixture.awayTeam, badgeUrl: fixture.awayLogo }}
          status={status}
          scoreHome={fixture.resultHome}
          scoreAway={fixture.resultAway}
          minute={status === 'live' ? minute : undefined}
          competition={fixture.competition}
          onBack={() => router.back()}
        />
        <View style={styles.body}>
          <Text variant="label" accessibilityRole="header">
            {t('matchLive.timeline', { defaultValue: 'Match events' })}
          </Text>
          <View style={[styles.group, { backgroundColor: c.surface }]}>
            {timeline.length === 0 ? (
              <View style={styles.empty}>
                <Text variant="footnote" color="secondary" align="center">
                  {emptyCopy}
                </Text>
              </View>
            ) : (
              timeline.map((e, i) => (
                <TimelineItem
                  key={e.key}
                  minute={e.minute ?? 0}
                  kind={e.kind as TimelineEventKind}
                  player={e.player ?? '-'}
                  detail={e.detail}
                  side={e.side ?? 'home'}
                  ownSide={ownSide}
                  isLast={i === timeline.length - 1}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>
      {showSummary ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: c.background,
              borderTopColor: c.borderDefault,
              paddingBottom: SPACING_XXXL + insets.bottom / 2,
            },
          ]}
        >
          <Button
            label={t('matchLive.viewSummary', {
              defaultValue: 'View match summary',
            })}
            variant="filled"
            size="lg"
            fullWidth
            onPress={() =>
              router.replace({
                pathname: '/match-detail',
                params: { fixtureId, teamId },
              })
            }
          />
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: SPACING_XL,
    gap: SPACING_MD,
  },
  group: {
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    paddingHorizontal: SPACING_LG,
  },
  empty: {
    paddingVertical: SPACING_XL,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: SPACING_MD,
    borderTopWidth: hairline,
    gap: SPACING_SM,
  },
})
