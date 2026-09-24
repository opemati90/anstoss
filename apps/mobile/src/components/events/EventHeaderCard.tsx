import { Linking, Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { EventDetail } from '@anstoss/shared'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, hairline, radius, space, RADIUS_INPUT, SPACING_XXS } from '../../theme/tokens'
import { eventDisplayTitle, formatClock, meetingLeadMinutes } from './eventFormat'

export type EventHeaderCardProps = {
  event: EventDetail
  locale: string
}

function openMaps(query: string) {
  void Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(query)}`).catch(() => undefined)
}

/**
 * The top of the one event screen: what, when, where. Times are the largest
 * thing on it because "wann muss ich da sein" is the question every player
 * and parent opens it for.
 */
export function EventHeaderCard({ event, locale }: EventHeaderCardProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const date = new Date(event.date)
  const cancelled = Boolean(event.cancelledAt)
  const isMatch = event.type === 'MATCH'
  const typeLabel = [
    t(`eventFlow.type.${event.type}`),
    isMatch && event.homeAway ? t(event.homeAway === 'AWAY' ? 'eventFlow.away' : 'eventFlow.home') : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const dayLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
  const lead = meetingLeadMinutes(event)
  const end =
    event.durationMin && event.durationMin > 0
      ? new Date(date.getTime() + event.durationMin * 60000)
      : null

  const tiles: Array<{ label: string; value: string; hint?: string | null; strong?: boolean }> = []
  if (event.meetingAt) {
    tiles.push({
      label: t('eventFlow.detail.meeting'),
      value: formatClock(event.meetingAt, locale),
      hint: lead != null && lead > 0 ? t('eventFlow.detail.minutesBefore', { count: lead }) : null,
      strong: true,
    })
  }
  tiles.push({
    label: isMatch ? t('eventFlow.detail.kickoff') : t('eventFlow.detail.start'),
    value: formatClock(date, locale),
    strong: !event.meetingAt,
  })
  if (!isMatch && end) {
    tiles.push({ label: t('eventFlow.detail.end'), value: formatClock(end, locale) })
  }

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
      <View style={styles.eyebrowRow}>
        <Text variant="footnote" weight="semibold" color="secondary" style={styles.eyebrow}>
          {typeLabel}
        </Text>
        {event.team?.name ? (
          <Text variant="footnote" color="tertiary" numberOfLines={1}>
            {event.team.name}
          </Text>
        ) : null}
      </View>

      <Text
        variant="title2"
        color={cancelled ? 'tertiary' : 'primary'}
        numberOfLines={3}
        style={cancelled ? styles.struck : undefined}
        accessibilityRole="header"
      >
        {eventDisplayTitle(event, t)}
      </Text>
      <Text variant="body" color="secondary">
        {dayLabel}
      </Text>

      {cancelled ? (
        <View style={[styles.cancelled, { backgroundColor: c.surfaceSunken }]}>
          <Icon name="xmark.circle.fill" size={18} color="secondary" />
          <View style={styles.flex}>
            <Text variant="subheadline" weight="semibold" color="primary">
              {t('eventFlow.cancelled')}
            </Text>
            {event.cancelReason ? (
              <Text variant="footnote" color="secondary">
                {event.cancelReason}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <View
            key={tile.label}
            style={[styles.tile, { backgroundColor: c.surfaceSunken }]}
            accessible
            accessibilityLabel={[tile.label, tile.value, tile.hint].filter(Boolean).join(', ')}
          >
            <Text variant="caption1" color="secondary">
              {tile.label}
            </Text>
            <Text
              variant={tiles.length > 2 ? 'title2' : 'title1'}
              color={tile.strong && !cancelled ? 'primary' : 'secondary'}
              tabular
              numberOfLines={1}
              adjustsFontSizeToFit
              style={styles.time}
            >
              {tile.value}
            </Text>
            {tile.hint ? (
              <Text variant="caption1" color="tertiary" tabular>
                {tile.hint}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      {event.meetingPoint || event.location || event.series || event.notes ? (
        <View style={[styles.rows, { borderTopColor: c.borderSubtle }]}>
          {event.meetingPoint ? (
            <PlaceRow
              icon="mappin.and.ellipse"
              label={t('eventFlow.detail.meetingPoint')}
              value={event.meetingPoint}
              onPress={() => openMaps(event.meetingPoint ?? '')}
              mapLabel={t('eventFlow.detail.openMap')}
            />
          ) : null}
          {event.location ? (
            <PlaceRow
              icon="mappin.circle"
              label={isMatch ? t('eventFlow.detail.venue') : t('eventFlow.detail.place')}
              value={event.location}
              onPress={() => openMaps(event.location ?? '')}
              mapLabel={t('eventFlow.detail.openMap')}
            />
          ) : null}
          {event.series ? (
            <View style={styles.infoRow}>
              <Icon name="arrow.clockwise" size={18} color="secondary" />
              <Text variant="subheadline" color="secondary" style={styles.flex}>
                {t(event.series.intervalWeeks === 2 ? 'eventFlow.detail.seriesBiweekly' : 'eventFlow.detail.seriesWeekly', {
                  date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
                    new Date(event.series.until),
                  ),
                })}
              </Text>
            </View>
          ) : null}
          {event.notes ? (
            <View style={styles.infoRow}>
              <Icon name="doc.text" size={18} color="secondary" />
              <Text variant="body" color="primary" style={styles.flex}>
                {event.notes}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function PlaceRow({
  icon,
  label,
  value,
  onPress,
  mapLabel,
}: {
  icon: string
  label: string
  value: string
  onPress: () => void
  mapLabel: string
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={mapLabel}
      android_ripple={{ color: c.surfaceSunken }}
      style={({ pressed }) => [styles.infoRow, pressed && { opacity: 0.6 }]}
    >
      <Icon name={icon} size={18} color="secondary" />
      <View style={styles.flex}>
        <Text variant="caption1" color="secondary">
          {label}
        </Text>
        <Text variant="body" color="primary" numberOfLines={2}>
          {value}
        </Text>
      </View>
      <Icon name="map" size={18} color={c.primary} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  eyebrowRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space.sm },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: fonts.label },
  struck: { textDecorationLine: 'line-through' },
  flex: { flex: 1, minWidth: 0 },
  cancelled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm + space.xs,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
  },
  tiles: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  tile: {
    flex: 1,
    paddingVertical: space.sm + space.xs,
    paddingHorizontal: space.sm + space.xs,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    gap: SPACING_XXS,
  },
  time: { fontFamily: fonts.data, letterSpacing: -0.5 },
  rows: { borderTopWidth: hairline, paddingTop: space.xs, marginTop: space.xs },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + space.xs,
    minHeight: 48,
    paddingVertical: space.xs,
  },
})
