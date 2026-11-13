import { memo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import {
  fonts,
  hairline,
  RADIUS_CARD,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_XS,
  SPACING_XXS,
} from '../../theme/tokens'
import { eventDisplayTitle, eventTimeLine, formatClock, type EventLike } from './eventFormat'
import { RsvpControl, type AbsenceDetail, type RsvpStatus } from './RsvpControl'

export type EventRowEvent = EventLike & {
  id: string
  location: string | null
  cancelledAt?: string | null
  cancelReason?: string | null
  myRsvpStale?: boolean
  /** Linked fussball.de fixture: the coach list calls it a league match. */
  fixtureId?: string | null
}

export type EventRowProps = {
  event: EventRowEvent
  locale: string
  onOpen: () => void
  /** The answer to show and change. Omit to render the row without a control. */
  rsvp?: {
    value: RsvpStatus | null
    onChange: (status: RsvpStatus, absence?: AbsenceDetail) => void
    pending?: boolean
    /** A parent answering for a child: "Mia". */
    subjectName?: string | null
  }
  /** Replaces the kind line, e.g. "Mia · U11" or the team name in a club feed. */
  eyebrow?: string | null
  /** Right-aligned Barlow number for coaches, e.g. "14". */
  trailing?: string | null
  /** Small word under the number ("dabei"). */
  trailingHint?: string | null
  /**
   * Coach schedule (design 11): one line each — short match title
   * ("vs. Rot-Weiß Köpenick III"), "14:00 · Sportplatz", 76pt rows.
   */
  compact?: boolean
  /** Extra screen-reader detail that is not shown, e.g. "3 offen". */
  accessibilityExtra?: string | null
  /** Position inside the white schedule group: rounds the ends, drops the last divider. */
  first?: boolean
  last?: boolean
  testID?: string
}

/**
 * One schedule row inside the white group of the Termine screen (designs 10
 * and 23): weekday + Barlow day · kind / title / time and place · and either
 * the coach's count ("14 dabei") or, for players and parents, the answer pills
 * right under it.
 */
export const EventRow = memo(function EventRow({
  event,
  locale,
  onOpen,
  rsvp,
  eyebrow,
  trailing,
  trailingHint,
  accessibilityExtra,
  compact,
  first,
  last,
  testID,
}: EventRowProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const date = new Date(event.date)
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    .format(date)
    .replace('.', '')
    .toUpperCase()
  const dayNumber = String(date.getDate())
  const title =
    compact && event.type === 'MATCH' && event.opponent?.trim()
      ? t(`eventFlow.matchTitleShort.${event.homeAway === 'AWAY' ? 'away' : 'home'}`, {
          opponent: event.opponent.trim(),
        })
      : eventDisplayTitle(event, t)
  const cancelled = Boolean(event.cancelledAt)
  const timeLine = compact ? formatClock(event.date, locale) : eventTimeLine(event, locale, t)
  const kind = [
    compact && event.type === 'MATCH' && event.fixtureId
      ? t('eventFlow.list.leagueMatch')
      : t(`eventFlow.type.${event.type}`),
    event.type === 'MATCH' && event.homeAway
      ? t(event.homeAway === 'AWAY' ? 'eventFlow.away' : 'eventFlow.home')
      : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const meta = cancelled
    ? [t('eventFlow.cancelled'), event.cancelReason].filter(Boolean).join(' · ')
    : event.myRsvpStale && !compact
      ? `${timeLine} · ${t('eventFlow.list.rescheduled')}`
      : [timeLine, event.location].filter(Boolean).join(' · ')
  const contextLabel = `${weekday} · ${title}`

  return (
    <View
      testID={testID}
      style={[
        styles.group,
        { backgroundColor: c.surface },
        first && styles.first,
        last && styles.last,
      ]}
    >
      <View
        style={[
          styles.inner,
          compact && styles.innerCompact,
          !last && { borderBottomWidth: hairline, borderBottomColor: c.borderSubtle },
        ]}
      >
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={[
            eyebrow ?? kind,
            title,
            new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
              date,
            ),
            cancelled ? meta : timeLine,
            !cancelled ? event.location : null,
            event.myRsvpStale && !cancelled ? t('eventFlow.list.rescheduled') : null,
            trailing && trailingHint ? `${trailing} ${trailingHint}` : null,
            accessibilityExtra,
          ]
            .filter(Boolean)
            .join(', ')}
          android_ripple={{ color: c.surfaceSunken }}
          style={({ pressed }) => [styles.head, compact && styles.headCompact, pressed && styles.pressed]}
        >
          <View style={styles.dateCol}>
            <Text variant="caption1" weight="bold" color="secondary">
              {weekday}
            </Text>
            <Text
              variant="data"
              color={cancelled ? 'tertiary' : 'primary'}
              style={styles.day}
            >
              {dayNumber}
            </Text>
          </View>

          <View style={styles.body}>
            <Text
              variant="caption1"
              weight="semibold"
              color="secondary"
              numberOfLines={1}
              style={compact ? styles.kindCompact : undefined}
            >
              {eyebrow ?? kind}
            </Text>
            <Text
              variant="callout"
              weight="bold"
              color={cancelled ? 'tertiary' : 'primary'}
              numberOfLines={compact ? 1 : 2}
              style={{ ...(cancelled ? styles.struck : null), ...(compact ? styles.titleCompact : null) }}
            >
              {title}
            </Text>
            {/* M5: never truncated (compact rows lead with the time, so only the
                place can clip). At 320pt or font scale 2.0 the time line
                wraps instead of hiding the kickoff. */}
            <Text
              variant="footnote"
              color={event.myRsvpStale && !cancelled && !compact ? 'tint' : 'secondary'}
              tabular
              numberOfLines={compact ? 1 : undefined}
              style={compact ? styles.metaCompact : undefined}
              testID={testID ? `${testID}-time` : undefined}
            >
              {meta}
            </Text>
          </View>

          {trailing ? (
            <View style={styles.trailing}>
              <Text variant="data" color="primary" style={styles.count}>
                {trailing}
              </Text>
              {trailingHint ? (
                <Text variant="caption1" color="secondary" numberOfLines={1}>
                  {trailingHint}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Pressable>

        {rsvp && !cancelled ? (
          <RsvpControl
            value={rsvp.value}
            onChange={rsvp.onChange}
            disabled={rsvp.pending}
            subjectName={rsvp.subjectName}
            contextLabel={contextLabel}
            accessibilityLabel={contextLabel}
            size="compact"
            style={styles.rsvp}
            testID={testID ? `${testID}-rsvp` : undefined}
          />
        ) : null}
      </View>
    </View>
  )
})

/** Date column (40) + gap (14): the answer pills line up under the title. */
const DATE_COL = 40
const ROW_GAP = SPACING_MD + 2
const COMPACT_ROW = 76

const styles = StyleSheet.create({
  group: { marginHorizontal: SCREEN_PADDING, paddingHorizontal: SPACING_LG },
  first: { borderTopLeftRadius: RADIUS_CARD, borderTopRightRadius: RADIUS_CARD },
  last: { borderBottomLeftRadius: RADIUS_CARD, borderBottomRightRadius: RADIUS_CARD },
  inner: { paddingVertical: SPACING_LG, gap: SPACING_MD },
  innerCompact: { paddingVertical: SPACING_MD },
  head: { flexDirection: 'row', alignItems: 'center', gap: ROW_GAP, minHeight: 44 },
  // Design 11: 76pt rows (12pt padding top and bottom).
  headCompact: { minHeight: COMPACT_ROW - 2 * SPACING_MD },
  pressed: { opacity: 0.7 },
  dateCol: { width: DATE_COL, alignItems: 'center' },
  day: { fontFamily: fonts.data, fontSize: 26, lineHeight: 28 },
  body: { flex: 1, minWidth: 0, gap: SPACING_XXS + 1 },
  struck: { textDecorationLine: 'line-through' },
  // Design 11 sets the three lines at the browser's normal leading (~1.2).
  kindCompact: { lineHeight: 15 },
  titleCompact: { lineHeight: 19 },
  metaCompact: { lineHeight: 16 },
  trailing: { alignItems: 'flex-end', gap: SPACING_XXS },
  count: { fontFamily: fonts.data, fontSize: 22, lineHeight: 24 },
  rsvp: { paddingStart: DATE_COL + ROW_GAP, paddingBottom: SPACING_XS },
})
