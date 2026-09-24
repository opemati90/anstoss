import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { EventDetail, EventFeedItem } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { Skeleton } from '../src/components/Skeleton'
import { Text } from '../src/components/ui'
import { CarpoolBoard } from '../src/components/events/CarpoolBoard'
import { eventDisplayTitle, eventTimeLine } from '../src/components/events/eventFormat'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { space } from '../src/theme/tokens'

/**
 * Fahrgemeinschaft for one event. The same board lives in the Fahrten segment
 * of the event screen; this route exists for entry points outside it (the
 * squad tab's "Fahrgemeinschaft" shortcut), which land on the next event
 * with an open board.
 */
export default function CarpoolScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())
  const { activeClub, activeTeamId, user } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const params = useLocalSearchParams<{ eventId?: string | string[] }>()
  const routeEventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')

  const load = useCallback(async () => {
    if (!clubId) {
      setState('empty')
      return
    }
    setState('loading')
    try {
      let eventId = routeEventId ?? null
      if (!eventId && activeTeamId) {
        const upcoming = await api<EventFeedItem[]>(
          `/clubs/${clubId}/events?teamId=${activeTeamId}&scope=upcoming&limit=20`,
        )
        eventId =
          upcoming.find((item) => !item.cancelledAt && (item.carpoolEnabled || item.homeAway === 'AWAY'))
            ?.id ?? null
      }
      if (!eventId) {
        setState('empty')
        return
      }
      setEvent(await api<EventDetail>(`/clubs/${clubId}/events/${eventId}`))
      setState('ready')
    } catch {
      setState('error')
    }
  }, [activeTeamId, clubId, routeEventId])

  useEffect(() => {
    void load()
  }, [load])

  const riders = event
    ? event.children.length > 0
      ? event.children.map((child) => ({ userId: child.userId, name: child.name.split(' ')[0] ?? child.name }))
      : user
        ? [{ userId: user.id, name: user.name.split(' ')[0] ?? user.name }]
        : []
    : []

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader mode="back" title={t('eventFlow.detail.tabRides')} onClose={() => router.back()} />
      {state === 'loading' ? (
        <View style={styles.content}>
          <Skeleton shape="card" height={72} />
          <Skeleton shape="card" height={140} />
        </View>
      ) : state === 'error' ? (
        <EmptyState
          icon="exclamationmark.circle"
          title={t('eventFlow.carpool.loadError')}
          description={t('eventFlow.carpool.loadErrorBody')}
          actionLabel={t('eventFlow.retry')}
          onAction={() => void load()}
        />
      ) : state === 'empty' || !event || !clubId ? (
        <EmptyState
          icon="car"
          title={t('eventFlow.carpool.noEventTitle')}
          description={t('eventFlow.carpool.noEventBody')}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.head}>
            <Text variant="title2" color="primary">
              {eventDisplayTitle(event, t)}
            </Text>
            <Text variant="subheadline" color="secondary" tabular>
              {`${new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(
                new Date(event.date),
              )} · ${eventTimeLine(event, locale, t)}`}
            </Text>
          </View>
          <CarpoolBoard
            clubId={clubId}
            eventId={event.id}
            eventDate={event.date}
            meetingAt={event.meetingAt}
            locale={locale}
            riders={riders}
            cancelled={Boolean(event.cancelledAt)}
          />
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: space.md, paddingBottom: space['2xl'], gap: space.md },
  head: { gap: space.xs, paddingHorizontal: space.xs },
})
