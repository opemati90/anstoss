import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RSVP } from '@anstoss/shared'
import { api } from '../../api/client'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import type { ChatMessage } from '../../hooks/useChat'
import { Icon } from '../ui'
import { Text } from '../ui/Text'
import { RsvpControl, type RsvpStatus } from '../home/RsvpControl'

type EventMeta = {
  eventId?: string
  eventDate?: string
  eventType?: string
  location?: string | null
}

type EventDetail = {
  id: string
  title: string
  date: string
  location: string | null
  cancelledAt?: string | null
  myRsvp: RsvpStatus | null
  yesCount?: number
}

type Props = {
  message: ChatMessage
  clubId: string
  locale: string
  primaryColor?: string
  /** Long-press opens the message menu (reply, delete, report). */
  onLongPress?: () => void
}

/**
 * An event shared into chat, answerable where it was read.
 *
 * This used to render as a poll bubble ("Tap to vote") that opened a poll
 * sheet unrelated to the event's RSVPs. Now the card is the event: title,
 * when, where, and the reader's own availability control. Answering here
 * writes the same RSVP the schedule and home use.
 */
export function EventCardMessage({ message, clubId, locale, primaryColor, onLongPress }: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const accent = primaryColor ?? c.primary
  const meta = (message.attachmentMeta ?? {}) as EventMeta
  const eventId = meta.eventId ?? null

  // Seeded from the message so the control works before (or without) the
  // detail fetch; the fetch only fills in the reader's own answer.
  const [detail, setDetail] = useState<EventDetail | null>(() =>
    eventId
      ? {
          id: eventId,
          title: message.content,
          date: meta.eventDate ?? new Date(message.createdAt).toISOString(),
          location: meta.location ?? null,
          cancelledAt: null,
          myRsvp: null,
        }
      : null,
  )
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    api<EventDetail>(`/clubs/${clubId}/events/${eventId}`)
      .then((data) => {
        if (!cancelled && data && typeof data === 'object') {
          setDetail((prev) => ({ ...(prev ?? ({} as EventDetail)), ...data }))
        }
      })
      .catch(() => {
        // The card still renders from its own metadata.
      })
    return () => {
      cancelled = true
    }
  }, [clubId, eventId])

  const onRsvp = useCallback(
    async (status: RsvpStatus) => {
      if (!eventId || pending) return
      const previous = detail?.myRsvp ?? null
      setPending(true)
      setDetail((prev) => (prev ? { ...prev, myRsvp: status } : prev))
      try {
        await new Promise((resolve) => setTimeout(resolve, RSVP.DEBOUNCE_MS))
        await api(`/clubs/${clubId}/events/${eventId}/rsvp`, {
          method: 'PUT',
          body: { status },
        })
        Haptics.success()
      } catch {
        setDetail((prev) => (prev ? { ...prev, myRsvp: previous } : prev))
        Haptics.fail()
      } finally {
        setPending(false)
      }
    },
    [clubId, detail?.myRsvp, eventId, pending],
  )

  const date = detail?.date ?? meta.eventDate ?? null
  const when = date
    ? new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(date))
    : null
  const location = detail?.location ?? meta.location ?? null
  const cancelled = Boolean(detail?.cancelledAt)
  const typeLabel =
    meta.eventType === 'MATCH'
      ? t('event.type.match', { defaultValue: 'Match' })
      : meta.eventType === 'TRAINING'
        ? t('event.type.training', { defaultValue: 'Training' })
        : t('event.type.other', { defaultValue: 'Event' })

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.surface, borderColor: c.borderSubtle, borderLeftColor: accent },
      ]}
    >
      <Pressable
        onPress={() =>
          eventId ? router.push({ pathname: '/event-detail', params: { eventId } }) : undefined
        }
        onLongPress={onLongPress}
        delayLongPress={250}
        accessibilityRole="button"
        accessibilityLabel={`${typeLabel}, ${message.content}${when ? `, ${when}` : ''}`}
        style={({ pressed }) => [styles.body, pressed && { opacity: 0.9 }]}
      >
        <View style={styles.head}>
          <Icon name="calendar" size={13} color={accent} />
          <Text variant="caption2" tracking="wide" weight="semibold" style={{ color: accent }}>
            {typeLabel.toUpperCase()}
          </Text>
          {message.senderName ? (
            <Text variant="caption2" color="tertiary" numberOfLines={1} style={styles.sender}>
              {message.senderName}
            </Text>
          ) : null}
        </View>
        <Text
          variant="body"
          weight="semibold"
          color={cancelled ? 'tertiary' : 'primary'}
          numberOfLines={2}
          style={cancelled ? styles.struck : undefined}
        >
          {message.content}
        </Text>
        {when || location ? (
          <Text variant="caption1" color="secondary" numberOfLines={1}>
            {[when, location].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </Pressable>
      {eventId && !cancelled ? (
        <View style={[styles.reply, { borderTopColor: c.borderSubtle }]}>
          <RsvpControl
            value={detail?.myRsvp ?? null}
            onChange={(status) => void onRsvp(status)}
            disabled={pending}
            size="compact"
          />
        </View>
      ) : cancelled ? (
        <View style={[styles.reply, { borderTopColor: c.borderSubtle }]}>
          <Text variant="caption1" color="tertiary">
            {t('event.manage.cancelledBanner', { defaultValue: 'Cancelled' })}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    borderLeftWidth: 3,
    overflow: 'hidden',
    maxWidth: '92%',
    alignSelf: 'flex-start',
    marginVertical: space['2xs'],
  },
  body: { padding: space.md, gap: space['2xs'] + 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space['2xs'] + 2 },
  sender: { flexShrink: 1, marginLeft: space['2xs'] },
  reply: {
    borderTopWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  struck: { textDecorationLine: 'line-through' },
})
