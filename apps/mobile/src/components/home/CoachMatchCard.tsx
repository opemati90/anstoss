import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Icon, PressableScale, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import {
  HomeAwayChip,
  KickoffBlock,
  LocationLine,
  TypeChip,
  eventHeadline,
  type MatchdayFields,
} from './HomeKit'

export type RsvpSplit = { yes: number; maybe: number; no: number; open: number }

export type CoachMatchCardProps = {
  event: MatchdayFields & { id: string }
  locale: string
  split: RsvpSplit
  /** Primary action; the secondary sits beside it, or below it when space is short. */
  primary: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean }
  secondary?: { label: string; onPress: () => void } | null
  /** One quiet status line under the actions (e.g. reminder cooldown). */
  note?: string | null
  onOpen: () => void
  onShare?: () => void
}

/**
 * The coach's next match: who, when, where to meet, and whether there is a
 * team. The squad split is a stacked bar with a spelled-out legend, because
 * "14 1 2" in grey is not a number anyone can act on. The one action that
 * moves the week forward (chase the open replies, or build the lineup) is the
 * primary button.
 */
export function CoachMatchCard({
  event,
  locale,
  split,
  primary,
  secondary,
  note,
  onOpen,
  onShare,
}: CoachMatchCardProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const total = split.yes + split.maybe + split.no + split.open
  const isMatch = event.type === 'MATCH'
  // Side by side only while both labels fit on one line each; otherwise the
  // secondary action drops under the primary instead of truncating it.
  const { width, fontScale } = useWindowDimensions()
  const labelPx = (label: string) => label.length * 8.5 * Math.max(1, fontScale) + 48
  const actionsInRow =
    !secondary || labelPx(primary.label) + labelPx(secondary.label) + 8 <= width - 64

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
      <PressableScale
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={eventHeadline(event)}
        haptic="tapLight"
        style={styles.body}
      >
        <View style={styles.chipRow}>
          <TypeChip type={event.type} />
          {isMatch ? <HomeAwayChip homeAway={event.homeAway} /> : null}
        </View>
        <Text variant="title2" weight="bold" color="primary" numberOfLines={2}>
          {eventHeadline(event)}
        </Text>
        <KickoffBlock event={event} locale={locale} compact />
        <LocationLine event={event} />
      </PressableScale>

      {onShare ? (
        <PressableScale
          onPress={onShare}
          accessibilityRole="button"
          accessibilityLabel={t('home.readiness.shareBriefing', { defaultValue: 'Share briefing' })}
          haptic="tapLight"
          wrapperStyle={styles.shareWrap}
          style={[styles.share, { backgroundColor: c.surfaceSunken }]}
        >
          <Icon name="square.and.arrow.up" size={17} color={c.textPrimary} />
        </PressableScale>
      ) : null}

      <View style={[styles.split, { borderTopColor: c.borderSubtle }]}>
        {total > 0 ? (
          <>
            <View
              style={[styles.bar, { backgroundColor: c.surfaceSunken }]}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={legendText(split, t)}
            >
              {/* Only non-empty segments render, so a zero count leaves no
                  stray gap in the bar. */}
              {barSegments(split, c).map((segment) => (
                <View
                  key={segment.key}
                  style={[styles.segment, { flex: segment.flex, backgroundColor: segment.color }]}
                />
              ))}
            </View>
            <View style={styles.legend} importantForAccessibility="no-hide-descendants">
              <LegendItem color={c.success} count={split.yes} label={t('homeHub.split.yes', { defaultValue: 'going', count: split.yes })} />
              <LegendItem color={c.warning} count={split.maybe} label={t('homeHub.split.maybe', { defaultValue: 'maybe', count: split.maybe })} />
              <LegendItem color={c.error} count={split.no} label={t('homeHub.split.no', { defaultValue: 'not going', count: split.no })} />
              <LegendItem
                color={c.borderControl}
                hollow
                count={split.open}
                label={t('homeHub.split.open', { defaultValue: 'no reply', count: split.open })}
              />
            </View>
          </>
        ) : (
          <Text variant="footnote" color="secondary">
            {t('homeHub.coach.noSquad', {
              defaultValue: 'No players in the squad yet. Invite your team so they can reply.',
            })}
          </Text>
        )}

        <View style={[styles.actions, !actionsInRow && styles.actionsStacked]}>
          <View style={actionsInRow ? styles.primary : null}>
            <Button
              label={primary.label}
              onPress={primary.onPress}
              loading={primary.loading}
              disabled={primary.disabled}
              fullWidth
            />
          </View>
          {secondary ? (
            <Button
              label={secondary.label}
              onPress={secondary.onPress}
              variant="bordered"
              fullWidth={!actionsInRow}
            />
          ) : null}
        </View>
        {note ? (
          <Text variant="footnote" color="secondary">
            {note}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function LegendItem({
  color,
  count,
  label,
  hollow,
}: {
  color: string
  count: number
  label: string
  hollow?: boolean
}) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.dot,
          hollow ? { borderWidth: 1.5, borderColor: color } : { backgroundColor: color },
        ]}
      />
      <Text variant="footnote" color="primary" tabular>
        <Text variant="footnote" weight="bold" color="primary" tabular>
          {String(count)}
        </Text>
        {` ${label}`}
      </Text>
    </View>
  )
}

/** The bar's visible segments, in answer order, skipping zero counts. */
export function barSegments(
  split: RsvpSplit,
  c: { success: string; warning: string; error: string },
): Array<{ key: string; flex: number; color: string | undefined }> {
  return [
    { key: 'yes', flex: split.yes, color: c.success },
    { key: 'maybe', flex: split.maybe, color: c.warning },
    { key: 'no', flex: split.no, color: c.error },
    { key: 'open', flex: split.open, color: undefined },
  ].filter((segment) => segment.flex > 0)
}

export function legendText(
  split: RsvpSplit,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  return [
    `${split.yes} ${t('homeHub.split.yes', { defaultValue: 'going', count: split.yes })}`,
    `${split.maybe} ${t('homeHub.split.maybe', { defaultValue: 'maybe', count: split.maybe })}`,
    `${split.no} ${t('homeHub.split.no', { defaultValue: 'not going', count: split.no })}`,
    `${split.open} ${t('homeHub.split.open', { defaultValue: 'no reply', count: split.open })}`,
  ].join(' · ')
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  body: { padding: space.md, gap: space.sm + 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, paddingEnd: 52 },
  shareWrap: { position: 'absolute', top: space.sm, end: space.sm },
  share: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  split: {
    borderTopWidth: hairline,
    padding: space.md,
    gap: space.sm + 4,
  },
  bar: {
    height: 10,
    borderRadius: radius.full,
    overflow: 'hidden',
    flexDirection: 'row',
    gap: space['2xs'],
  },
  segment: { height: '100%' },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space.md,
    rowGap: space.xs,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  dot: { width: 10, height: 10, borderRadius: radius.full },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  actionsStacked: { flexDirection: 'column' },
  primary: { flex: 1 },
})
