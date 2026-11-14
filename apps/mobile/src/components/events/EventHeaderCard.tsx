import type { ReactNode } from 'react'
import { Linking, Pressable, StyleSheet, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import type { EventDetail } from '@anstoss/shared'
import { Icon, SectionGroup, SoftIcon, Text, type IconName } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'
import {
  fonts,
  RADIUS_FULL,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XS,
  SPACING_XXS,
  SPACING_XXL,
  TEXT_WHITE,
} from '../../theme/tokens'
import { eventDisplayTitle, formatClock, meetingLeadMinutes } from './eventFormat'

export type EventHeaderCardProps = {
  event: EventDetail
  locale: string
  /** Safe-area top inset; the hero runs under the status bar. */
  topInset: number
  /** The back button (left) and the action buttons (right) of the hero. */
  leading: ReactNode
  trailing?: ReactNode
}

function openMaps(query: string) {
  void Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(query)}`).catch(() => undefined)
}

/**
 * Text colours on the club hero. White with the muted green-grey of the
 * design; when the club colour is pale enough that onPrimary turns dark, the
 * muted line follows it instead.
 */
export function useHeroText() {
  const c = useClubColors()
  // The hero is the true club colour in both modes (heroBg, never lifted).
  const fg = c.onHeroBg
  const light = fg.toUpperCase() === TEXT_WHITE
  return { fg, muted: light ? c.onHeroMuted : hexToRgba(fg, 0.72) }
}

/**
 * The club-coloured hero of the one event screen (design 12): back and
 * actions, kind line, the title in Barlow caps, then three stats (day, start,
 * Treffpunkt). Times are Barlow because "wann muss ich da sein" is the
 * question every player and parent opens it for.
 */
export function EventHeaderCard({ event, locale, topInset, leading, trailing }: EventHeaderCardProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const hero = useHeroText()
  const date = new Date(event.date)
  const cancelled = Boolean(event.cancelledAt)
  const isMatch = event.type === 'MATCH'
  // Design 13: "Kreisliga C · 11. Spieltag" when the match has a competition.
  const competitionLine = event.competition
    ? [
        event.competition.name,
        event.competition.matchday
          ? t('eventFlow.detail.matchday', { n: event.competition.matchday })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null
  const kindLine = competitionLine ?? [
    t(`eventFlow.type.${event.type}`),
    isMatch && event.homeAway ? t(event.homeAway === 'AWAY' ? 'eventFlow.away' : 'eventFlow.home') : null,
    event.team?.name ?? null,
  ]
    .filter(Boolean)
    .join(' · ')
  const lead = meetingLeadMinutes(event)
  const end =
    event.durationMin && event.durationMin > 0
      ? new Date(date.getTime() + event.durationMin * 60000)
      : null

  const stats: Array<{ label: string; value: string; hint?: string | null }> = [
    {
      label: t(`eventFlow.weekdayLong.${date.getDay()}`),
      value: new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(date),
    },
    {
      label: isMatch ? t('eventFlow.detail.kickoff') : t('eventFlow.detail.start'),
      value: formatClock(date, locale),
    },
  ]
  if (event.meetingAt) {
    stats.push({
      label: t('eventFlow.detail.meeting'),
      value: formatClock(event.meetingAt, locale),
      hint: lead != null && lead > 0 ? t('eventFlow.detail.minutesBefore', { count: lead }) : null,
    })
  } else if (end) {
    stats.push({ label: t('eventFlow.detail.end'), value: formatClock(end, locale) })
  }

  return (
    <View style={[styles.hero, { backgroundColor: c.heroBg, paddingTop: topInset + SPACING_MD }]}>
      {/* Design 13: a faint centre circle and halfway line, bottom right. */}
      <Svg
        width={PITCH_MARK}
        height={PITCH_MARK}
        viewBox="0 0 320 320"
        fill="none"
        style={styles.pitchMark}
        pointerEvents="none"
      >
        <Circle cx={160} cy={160} r={110} stroke={hero.fg} strokeOpacity={0.07} strokeWidth={1.5} />
        <Path d="M0 160h320" stroke={hero.fg} strokeOpacity={0.07} strokeWidth={1.5} />
      </Svg>
      <View style={styles.topRow}>
        {leading}
        <View style={styles.actions}>{trailing}</View>
      </View>

      <View style={styles.titleBlock}>
        <Text variant="footnote" weight="semibold" color={hero.muted} numberOfLines={2}>
          {kindLine}
        </Text>
        <Text
          variant="display"
          color={hero.fg}
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={cancelled ? [styles.title, styles.struck] : styles.title}
          accessibilityRole="header"
        >
          {isMatch && event.opponent?.trim()
            ? t(`eventFlow.matchTitleShort.${event.homeAway === 'AWAY' ? 'away' : 'home'}`, {
                opponent: event.opponent.trim(),
              })
            : eventDisplayTitle(event, t)}
        </Text>
        {cancelled ? (
          <View style={[styles.cancelled, { backgroundColor: c.accent }]}>
            <Icon name="xmark.circle.fill" size={14} color={c.onAccent} />
            <Text variant="caption1" weight="bold" color={c.onAccent} numberOfLines={2} style={styles.shrink}>
              {[t('eventFlow.cancelled'), event.cancelReason].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.stats}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={styles.stat}
            accessible
            accessibilityLabel={[stat.label, stat.value, stat.hint].filter(Boolean).join(', ')}
          >
            <Text variant="caption1" color={hero.muted} numberOfLines={1}>
              {stat.label}
            </Text>
            <Text variant="data" color={hero.fg} numberOfLines={1} adjustsFontSizeToFit style={styles.statValue}>
              {stat.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/**
 * Where (Treffpunkt, venue with "Route"), the series rule and the coach's
 * notes, as one white group under the hero.
 */
export function EventInfoGroup({ event, locale }: { event: EventDetail; locale: string }) {
  const { t } = useTranslation()
  const isMatch = event.type === 'MATCH'
  if (!event.meetingPoint && !event.location && !event.series && !event.notes) return null
  return (
    <SectionGroup>
      {/* Design 13: one place row, the venue with its details beneath
          ("Kunstrasen · Kabine 3"), and "Route". */}
      {event.location || event.meetingPoint ? (
        <PlaceRow
          icon="mappin"
          label={isMatch ? t('eventFlow.detail.venue') : t('eventFlow.detail.place')}
          value={(event.location || event.meetingPoint) ?? ''}
          detail={event.location && event.meetingPoint ? event.meetingPoint : null}
          routeLabel={t('eventFlow.detail.route', { defaultValue: 'Route' })}
          mapLabel={t('eventFlow.detail.openMap')}
        />
      ) : null}
      {event.series ? (
        <View style={styles.row}>
          <SoftIcon name="arrow.clockwise" />
          <Text variant="body" color="primary" style={styles.shrink}>
            {t(
              event.series.intervalWeeks === 2
                ? 'eventFlow.detail.seriesBiweekly'
                : 'eventFlow.detail.seriesWeekly',
              {
                date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
                  new Date(event.series.until),
                ),
              },
            )}
          </Text>
        </View>
      ) : null}
      {event.notes ? (
        <View style={styles.row}>
          <SoftIcon name="doc.text" />
          <Text variant="body" color="primary" style={styles.shrink}>
            {event.notes}
          </Text>
        </View>
      ) : null}
    </SectionGroup>
  )
}

function PlaceRow({
  icon,
  label,
  value,
  detail,
  routeLabel,
  mapLabel,
}: {
  icon: IconName
  label: string
  value: string
  detail?: string | null
  routeLabel: string
  mapLabel: string
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={() => openMaps(value)}
      accessibilityRole="link"
      accessibilityLabel={[`${label}: ${value}`, detail].filter(Boolean).join(', ')}
      accessibilityHint={mapLabel}
      android_ripple={{ color: c.surfaceSunken }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <SoftIcon name={icon} />
      <View style={styles.shrink}>
        <Text variant="callout" weight="semibold" color="primary" numberOfLines={2}>
          {value}
        </Text>
        {detail ? (
          <Text variant="footnote" color="secondary" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text variant="subheadline" weight="semibold" color="tint" style={styles.route}>
        {routeLabel}
      </Text>
    </Pressable>
  )
}

const PITCH_MARK = 320

const styles = StyleSheet.create({
  pitchMark: { position: 'absolute', right: -120, bottom: -170 },
  hero: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: SPACING_XXL + 2,
    gap: SPACING_XL + 2,
    overflow: 'hidden',
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: SPACING_SM },
  titleBlock: { gap: SPACING_SM },
  title: { fontSize: 40 },
  struck: { textDecorationLine: 'line-through' },
  cancelled: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_XS,
    paddingHorizontal: SPACING_SM + 2,
    paddingVertical: SPACING_XS,
    borderRadius: RADIUS_FULL,
  },
  stats: { flexDirection: 'row', gap: SPACING_MD },
  stat: { flex: 1, gap: SPACING_XXS + 2 },
  statValue: { fontFamily: fonts.data, fontSize: 24, lineHeight: 26 },
  shrink: { flex: 1, minWidth: 0, gap: SPACING_XXS },
  route: { fontSize: 14 },
  pressed: { opacity: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + 2,
    minHeight: 60,
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_MD,
  },
})
