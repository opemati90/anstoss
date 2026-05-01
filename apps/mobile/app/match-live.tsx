import { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@clerk/clerk-expo'
import type { ImportedFixture } from '@anstoss/shared'
import { io, Socket } from 'socket.io-client'
import { Screen, Text } from '../src/components/ui'
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
  const { fixtureId } = useLocalSearchParams<{ fixtureId: string }>()
  const { getToken } = useAuth()
  const [fixture, setFixture] = useState<ImportedFixture | null>(null)
  const [events, setEvents] = useState<LiveEvent[]>([])
  const socketRef = useRef<Socket | null>(null)

  const load = useCallback(async () => {
    if (!fixtureId) return
    try {
      const fixtures = await api<ImportedFixture[]>(
        `/teams/_/fixtures?scope=all&limit=50`,
      )
      const f = fixtures?.find((x) => x.id === fixtureId)
      if (f) setFixture(f)
    } catch {
      // stale
    }
  }, [fixtureId])

  useEffect(() => {
    void load()
  }, [load])

  // Subscribe to live socket namespace
  useEffect(() => {
    if (!fixtureId) return
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
        setEvents((prev) => [
          ...prev,
          { ...event, ts: Date.now() } as LiveEvent,
        ])
      })
    })()
    return () => {
      cancelled = true
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [fixtureId, getToken])

  if (!fixture) {
    return <Screen scroll={false} edges={['left', 'right']}><View /></Screen>
  }

  const status: MatchStatus =
    fixture.status === 'live'
      ? 'live'
      : fixture.status === 'finished'
        ? 'final'
        : 'scheduled'

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
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
                {t('matchLive.waiting', {
                  defaultValue: 'Waiting for the next event…',
                })}
              </Text>
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
  scroll: { paddingBottom: space['2xl'] },
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
  },
})
