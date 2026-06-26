import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import type { ImportedFixture } from '@anstoss/shared'
import { io, Socket } from 'socket.io-client'
import { Screen, Text, Button } from '../src/components/ui'
import { ErrorState } from '../src/components/ErrorState'
import { ModalHeader } from '../src/components/ModalHeader'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import {
  MatchHero,
  TimelineItem,
  type MatchStatus,
  type TimelineEventKind,
} from '../src/components/match'
import { useMatchTokens } from '../src/theme/matchTokens'
import { api } from '../src/api/client'
import { space } from '../src/theme/tokens'

type LiveEvent = {
  kind: TimelineEventKind | 'state'
  minute?: number
  player?: string
  side?: 'home' | 'away'
  detail?: string
  status?: 'live' | 'finished' | 'scheduled'
  resultHome?: number | null
  resultAway?: number | null
  ts: number
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3002'

export default function MatchLiveScreen() {
  const { t } = useTranslation()
  const tokens = useMatchTokens()
  const insets = useSafeAreaInsetsSafe()
  const { fixtureId, teamId } = useLocalSearchParams<{
    fixtureId: string
    teamId: string
  }>()
  const { getToken } = useAuth()
  const [fixture, setFixture] = useState<ImportedFixture | null>(null)
  const [events, setEvents] = useState<LiveEvent[]>([])
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
        setEvents((prev) => [...prev, { ...event, ts: Date.now() } as LiveEvent])
      })
    })()
    return () => {
      cancelled = true
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [fixtureId, teamId, getToken])

  if (loading) {
    return (
      <Screen
        scroll={false}
        padded={false}
        header={<ModalHeader mode="back" onClose={() => router.back()} />}
      >
        <View style={styles.center}>
          <ActivityIndicator color={tokens.statusLive} />
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

  const emptyCopy =
    status === 'scheduled'
      ? t('matchLive.notStarted', {
          defaultValue: 'Kick-off hasn’t happened yet — check back at match time.',
        })
      : status === 'final'
        ? t('matchLive.ended', {
            defaultValue: 'Full time. No live events were recorded.',
          })
        : t('matchLive.waiting', {
            defaultValue: 'Waiting for the next event…',
          })

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: space['2xl'] + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <MatchHero
          home={{ name: fixture.homeTeam, badgeUrl: fixture.homeLogo }}
          away={{ name: fixture.awayTeam, badgeUrl: fixture.awayLogo }}
          status={status}
          scoreHome={fixture.resultHome}
          scoreAway={fixture.resultAway}
          competition={fixture.competition}
          stage={t('matchLive.live', { defaultValue: 'Live' })}
          onBack={() => router.back()}
        />
        <View style={[styles.body, { backgroundColor: tokens.cardSurface }]}>
          <Text variant="caption2" color="tertiary" style={styles.eyebrow}>
            {t('matchLive.timeline', { defaultValue: 'TIMELINE' })}
          </Text>
          {events.length === 0 ? (
            <View style={styles.empty}>
              <Text variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
                {emptyCopy}
              </Text>
              {status === 'final' ? (
                <Button
                  label={t('matchLive.viewSummary', {
                    defaultValue: 'View match summary',
                  })}
                  variant="tinted"
                  onPress={() =>
                    router.replace({
                      pathname: '/match-detail',
                      params: { fixtureId, teamId },
                    })
                  }
                  style={styles.summaryBtn}
                />
              ) : null}
            </View>
          ) : (
            events.map((e, i) =>
              e.kind === 'state' ? null : (
                <TimelineItem
                  key={`${e.ts}-${i}`}
                  minute={e.minute ?? 0}
                  kind={e.kind as TimelineEventKind}
                  player={e.player ?? '—'}
                  detail={e.detail}
                  side={e.side ?? 'home'}
                  isLast={i === events.length - 1}
                />
              ),
            )
          )}
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: {},
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.sm,
  },
  eyebrow: {
    letterSpacing: 1.4,
    paddingTop: space.xs,
  },
  empty: {
    paddingVertical: space.xl,
    gap: space.md,
  },
  summaryBtn: {
    alignSelf: 'center',
  },
})
