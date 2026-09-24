import { useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Icon, PressableScale, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import { textSafeAccent } from '../../theme/club-theme'

/**
 * Shared building blocks for the role homes (player, coach, parent).
 *
 * One section grammar everywhere: a 13pt medium secondary header, a 16-radius
 * surface below it, 24pt between sections. Keeping it in one place is what
 * stops the three homes drifting apart again.
 */

/** Fields the events feed carries for matchday logistics (all optional). */
export type MatchdayFields = {
  type?: string
  title: string
  date: string
  location?: string | null
  opponent?: string | null
  homeAway?: 'HOME' | 'AWAY' | null
  meetingAt?: string | null
  meetingPoint?: string | null
}

/**
 * The club colour as small-text colour: darkened (light mode) or lifted
 * (dark mode) until it reaches 4.5:1 on what it sits on. `tint` is the
 * primary50 wash used by accent chips and icon wells.
 */
export function useAccentText(on: 'surface' | 'background' | 'tint' = 'surface'): string {
  const c = useClubColors()
  return useMemo(() => {
    const base = on === 'background' ? c.background : c.surface
    return textSafeAccent(c.primary, base, on === 'tint' ? c.primary50 : base)
  }, [c.background, c.primary, c.primary50, c.surface, on])
}

// ─── Section + surfaces ─────────────────────────────────────────────────────

export function HomeSection({
  title,
  actionLabel,
  actionIcon,
  onAction,
  children,
  testID,
}: {
  title: string
  actionLabel?: string
  actionIcon?: string
  onAction?: () => void
  children: ReactNode
  testID?: string
}) {
  const accent = useAccentText('background')
  return (
    <View style={styles.section} testID={testID}>
      <View style={styles.sectionHead}>
        <Text variant="caption1" weight="medium" color="secondary" style={styles.sectionTitle}>
          {title}
        </Text>
        {actionLabel && onAction ? (
          <PressableScale
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            haptic="tapLight"
            style={styles.sectionAction}
          >
            {actionIcon ? <Icon name={actionIcon} size={15} color={accent} /> : null}
            <Text variant="subheadline" weight="semibold" style={{ color: accent }}>
              {actionLabel}
            </Text>
          </PressableScale>
        ) : null}
      </View>
      {children}
    </View>
  )
}

export function HomeCard({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const c = useClubColors()
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }, style]}>
      {children}
    </View>
  )
}

/**
 * A tappable list row inside a HomeCard: leading icon well, a title that may
 * wrap to two lines, a detail line, and an optional trailing slot.
 */
export function HomeRow({
  icon,
  tone = 'neutral',
  title,
  detail,
  trailing,
  onPress,
  accessibilityLabel,
  showDivider,
}: {
  icon: string
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'error'
  title: string
  detail?: string | null
  trailing?: ReactNode
  onPress?: () => void
  accessibilityLabel?: string
  showDivider?: boolean
}) {
  const c = useClubColors()
  const well =
    tone === 'accent'
      ? { bg: c.primary50, fg: c.primary }
      : tone === 'success'
        ? { bg: c.successBg, fg: c.success }
        : tone === 'warning'
          ? { bg: c.warningBg, fg: c.warning }
          : tone === 'error'
            ? { bg: c.errorBg, fg: c.error }
            : { bg: c.surfaceSunken, fg: c.textSecondary }

  const body = (
    <>
      <View style={[styles.iconWell, { backgroundColor: well.bg }]}>
        <Icon name={icon} size={17} color={well.fg} />
      </View>
      <View style={styles.rowText}>
        <Text variant="callout" weight="semibold" color="primary" numberOfLines={2}>
          {title}
        </Text>
        {detail ? (
          <Text variant="footnote" color="secondary" numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
      {onPress ? <Icon name="chevron.right" size={14} color="tertiary" /> : null}
    </>
  )

  const rowStyle = [
    styles.row,
    showDivider ? { borderTopWidth: hairline, borderTopColor: c.borderSubtle } : null,
  ]

  if (!onPress) {
    return (
      <View style={rowStyle} accessible accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    )
  }
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, detail].filter(Boolean).join(', ')}
      haptic="tapLight"
      style={rowStyle}
    >
      {body}
    </PressableScale>
  )
}

/** Inline, specific error with a retry, sized to sit where the content would. */
export function InlineError({
  title,
  body,
  onRetry,
}: {
  title: string
  body?: string
  onRetry?: () => void
}) {
  const c = useClubColors()
  const { t } = useTranslation()
  return (
    <HomeCard style={styles.errorCard}>
      <View style={styles.errorHead}>
        <Icon name="exclamationmark.circle.fill" size={20} color={c.error} />
        <View style={styles.rowText}>
          <Text variant="callout" weight="semibold" color="primary">
            {title}
          </Text>
          {body ? (
            <Text variant="footnote" color="secondary">
              {body}
            </Text>
          ) : null}
        </View>
      </View>
      {onRetry ? (
        <PressableScale
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={t('homeHub.retry', { defaultValue: 'Try again' })}
          haptic="tapLight"
          style={[styles.retry, { borderColor: c.borderControl }]}
        >
          <Icon name="arrow.clockwise" size={15} color={c.textPrimary} />
          <Text variant="subheadline" weight="semibold" color="primary">
            {t('homeHub.retry', { defaultValue: 'Try again' })}
          </Text>
        </PressableScale>
      ) : null}
    </HomeCard>
  )
}

/** Composed empty state inside a card: says what is missing and who fills it. */
export function EmptyCard({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: string
  title: string
  body?: string
  actionLabel?: string
  onAction?: () => void
}) {
  const c = useClubColors()
  return (
    <HomeCard style={styles.emptyCard}>
      <View style={[styles.emptyIcon, { backgroundColor: c.surfaceSunken }]}>
        <Icon name={icon} size={20} color={c.textSecondary} />
      </View>
      <Text variant="callout" weight="semibold" color="primary" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="footnote" color="secondary" align="center">
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} size="md" style={styles.emptyAction} />
      ) : null}
    </HomeCard>
  )
}

// ─── Chips ──────────────────────────────────────────────────────────────────

export function TypeChip({ type }: { type?: string }) {
  const c = useClubColors()
  const accentOnTint = useAccentText('tint')
  const { t } = useTranslation()
  const isMatch = type === 'MATCH'
  const label =
    type === 'MATCH'
      ? t('homeHub.type.match', { defaultValue: 'Match' })
      : type === 'TRAINING'
        ? t('homeHub.type.training', { defaultValue: 'Training' })
        : t('homeHub.type.other', { defaultValue: 'Event' })
  return (
    <View
      style={[
        styles.chip,
        isMatch
          ? { backgroundColor: c.primary50 }
          : { backgroundColor: c.surfaceSunken },
      ]}
    >
      <Icon
        name={isMatch ? 'football' : type === 'TRAINING' ? 'whistle' : 'calendar'}
        size={13}
        color={isMatch ? accentOnTint : c.textSecondary}
      />
      <Text
        variant="caption1"
        weight="semibold"
        style={{ color: isMatch ? accentOnTint : c.textSecondary }}
      >
        {label}
      </Text>
    </View>
  )
}

export function HomeAwayChip({ homeAway }: { homeAway?: 'HOME' | 'AWAY' | null }) {
  const c = useClubColors()
  const { t } = useTranslation()
  if (!homeAway) return null
  return (
    <View style={[styles.chip, { borderColor: c.borderControl, borderWidth: hairline }]}>
      <Text variant="caption1" weight="semibold" color="secondary">
        {homeAway === 'HOME'
          ? t('homeHub.home', { defaultValue: 'Home' })
          : t('homeHub.away', { defaultValue: 'Away' })}
      </Text>
    </View>
  )
}

// ─── Kick-off block ─────────────────────────────────────────────────────────

/**
 * Anstoß (or Beginn) and Treffpunkt side by side, in large tabular digits,
 * with the date and meeting place beneath. The two times are what players
 * actually need to plan their Saturday.
 */
export function KickoffBlock({
  event,
  locale,
  compact = false,
}: {
  event: MatchdayFields
  locale: string
  compact?: boolean
}) {
  const c = useClubColors()
  const { t } = useTranslation()
  const { width, fontScale } = useWindowDimensions()
  // The block's own width once laid out; until then the window minus the
  // screen gutters and card padding is a close first guess.
  const [blockWidth, setBlockWidth] = useState(0)
  const kickoff = formatTime(event.date, locale)
  const meeting = formatTime(event.meetingAt, locale)
  const isMatch = event.type === 'MATCH'
  const digits = compact ? 'title2' : 'title1'
  const stacked =
    Boolean(meeting) &&
    shouldStackTimes({
      blockWidth: blockWidth || width - 64,
      digitSize: compact ? 24 : 32,
      fontScale,
      maxFontScale: 1.4,
      label: kickoff,
    })
  return (
    <View
      style={[styles.timeRow, stacked && styles.timeStacked]}
      onLayout={(e) => setBlockWidth(Math.round(e.nativeEvent.layout.width))}
    >
      <View style={styles.timeCol}>
        <Text variant="caption1" weight="medium" color="secondary">
          {isMatch
            ? t('homeHub.kickoff', { defaultValue: 'Kick-off' })
            : t('homeHub.starts', { defaultValue: 'Starts' })}
        </Text>
        <Text variant={digits} weight="bold" color="primary" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
          {kickoff}
        </Text>
        <Text variant="footnote" color="secondary" tabular>
          {formatShortDate(event.date, locale)}
        </Text>
      </View>
      {meeting ? (
        <>
          {stacked ? null : (
            <View style={[styles.timeDivider, { backgroundColor: c.borderDefault }]} />
          )}
          <View style={styles.timeCol}>
            <Text variant="caption1" weight="medium" color="secondary">
              {t('homeHub.meeting', { defaultValue: 'Meet' })}
            </Text>
            <Text variant={digits} weight="bold" color="primary" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {meeting}
            </Text>
            <Text variant="footnote" color="secondary" numberOfLines={2}>
              {event.meetingPoint || event.location || ''}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  )
}

/**
 * Location line under the kick-off block, when it adds something. A
 * Treffpunkt without a meeting time has no column in the kick-off block, so
 * it is named here instead of being dropped.
 */
export function LocationLine({ event }: { event: MatchdayFields }) {
  const { t } = useTranslation()
  const meetingPointOnly = Boolean(event.meetingPoint && !formatTime(event.meetingAt, 'en-GB'))
  const showLocation = Boolean(event.location) && !(event.meetingAt && !event.meetingPoint)
  if (!meetingPointOnly && !showLocation) return null
  return (
    <View style={styles.metaStack}>
      {meetingPointOnly ? (
        <View style={styles.metaRow}>
          <Icon name="person.2" size={15} color="secondary" />
          <Text variant="footnote" color="secondary" numberOfLines={2} style={styles.rowText}>
            {t('homeHub.meetingPoint', {
              defaultValue: 'Meet at {{place}}',
              place: event.meetingPoint,
            })}
          </Text>
        </View>
      ) : null}
      {showLocation && event.location !== event.meetingPoint ? (
        <View style={styles.metaRow}>
          <Icon name="mappin" size={15} color="secondary" />
          <Text variant="footnote" color="secondary" numberOfLines={2} style={styles.rowText}>
            {event.location}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

/**
 * Whether Anstoß and Treffpunkt stack instead of sitting side by side. A
 * column must hold the time ("15:00", about 3.1em of tabular digits) on one
 * line at the user's font scale, capped at the variant's maximum.
 */
export function shouldStackTimes({
  blockWidth,
  digitSize,
  fontScale,
  maxFontScale,
  label,
}: {
  blockWidth: number
  digitSize: number
  fontScale: number
  maxFontScale: number
  label: string
}): boolean {
  const scale = Math.min(Math.max(1, fontScale), maxFontScale)
  // Tabular digits run ~0.62em, the colon ~0.3em: "15:00" is about 2.8em.
  const chars = Math.max(5, label.trim().length)
  const timeWidth = digitSize * scale * (0.62 * (chars - 1) + 0.3)
  const column = (blockWidth - space.md - hairline) / 2
  return timeWidth > column
}

// ─── Formatting ─────────────────────────────────────────────────────────────

function validDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d : null
}

/** "Sa 26.09." — weekday without the trailing dot, then the numeric date. */
export function formatShortDate(iso: string, locale: string): string {
  const d = validDate(iso)
  if (!d) return ''
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    .format(d)
    .replace(/\.$/, '')
  const day = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(d)
  const dayWithDot = locale.startsWith('de') && !day.endsWith('.') ? `${day}.` : day
  return `${weekday} ${dayWithDot}`
}

/** "15:00" — always a 24-hour clock (the club world runs on it in every locale). */
export function formatTime(iso: string | null | undefined, locale: string): string {
  const d = validDate(iso)
  if (!d) return ''
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d)
}

/** Whole calendar days from `fromMs` to `toMs` in the device time zone (DST-safe). */
export function calendarDayDiff(fromMs: number, toMs: number): number {
  const a = new Date(fromMs)
  const b = new Date(toMs)
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((startB - startA) / 86_400_000)
}

/** "14:30" today, otherwise "Sa 26.09. 14:30", so a time is never ambiguous. */
export function formatDayTime(iso: string, locale: string, nowMs = Date.now()): string {
  const d = validDate(iso)
  if (!d) return ''
  const time = formatTime(iso, locale)
  return calendarDayDiff(nowMs, d.getTime()) === 0 ? time : `${formatShortDate(iso, locale)} ${time}`
}

/**
 * Lead time by calendar day: "in 45 min", "Heute 21:00", "Morgen",
 * "In 3 Tagen". A 21:00 event seen at 22:00 the evening before is "Morgen",
 * not "in 23 h". Further out than a week is left to the date.
 */
export function formatCountdown(
  eventIso: string,
  nowMs: number,
  locale: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | null {
  const d = validDate(eventIso)
  if (!d) return null
  const deltaMs = d.getTime() - nowMs
  if (deltaMs <= 0) return t('home.player.now', { defaultValue: 'Now' })
  if (deltaMs < 3_600_000) {
    return t('home.player.inMinutes', {
      defaultValue: 'in {{n}} min',
      n: Math.max(1, Math.round(deltaMs / 60_000)),
    })
  }
  const days = calendarDayDiff(nowMs, d.getTime())
  if (days === 0) {
    return t('homeHub.todayAt', { defaultValue: 'Today {{time}}', time: formatTime(eventIso, locale) })
  }
  if (days === 1) return t('home.tomorrow', { defaultValue: 'Tomorrow' })
  if (days <= 7) return t('homeHub.inDays', { defaultValue: 'In {{count}} days', count: days })
  return null
}

/**
 * Headline for an event: the opponent for a match when the feed has one,
 * otherwise the event title as the coach wrote it.
 */
export function eventHeadline(event: MatchdayFields): string {
  if (event.type === 'MATCH' && event.opponent) return event.opponent
  return event.title
}

/**
 * The one metadata line used everywhere on home:
 * "Sa 26.09. · 14:00 · Treff 13:15". Pass `withDate: false` when the date is
 * already shown elsewhere on the row.
 */
export function eventMetaLine(
  event: MatchdayFields,
  locale: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
  { withDate = true, withLocation = false }: { withDate?: boolean; withLocation?: boolean } = {},
): string {
  const parts: string[] = []
  if (withDate) parts.push(formatShortDate(event.date, locale))
  parts.push(formatTime(event.date, locale))
  const meeting = formatTime(event.meetingAt, locale)
  if (meeting) {
    parts.push(t('homeHub.meetShort', { defaultValue: 'Meet {{time}}', time: meeting }))
  }
  if (withLocation && event.location) parts.push(event.location)
  return parts.filter(Boolean).join(' · ')
}

/** "45,00 €" from cents. */
export function formatMoney(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  section: { gap: space.sm },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
    paddingHorizontal: space.xs,
  },
  sectionTitle: { flexShrink: 1, letterSpacing: 0 },
  sectionAction: {
    minHeight: 44,
    marginVertical: -8,
    paddingHorizontal: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md - 4,
    paddingHorizontal: space.md,
    paddingVertical: space.md - 4,
    minHeight: 60,
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: space['2xs'] },
  errorCard: { padding: space.md, gap: space.md },
  errorHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md - 4 },
  retry: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
  },
  emptyCard: {
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    gap: space.sm,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  emptyAction: { marginTop: space.sm, alignSelf: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'stretch', gap: space.md },
  timeStacked: { flexDirection: 'column', gap: space.sm + 4 },
  timeCol: { flexGrow: 1, flexBasis: 0, minWidth: 0, gap: space['2xs'] },
  timeDivider: { width: hairline, marginVertical: space.xs },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  metaStack: { gap: space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 26,
    paddingHorizontal: space.sm + 2,
    borderRadius: radius.full,
    borderCurve: 'continuous',
  },
})
