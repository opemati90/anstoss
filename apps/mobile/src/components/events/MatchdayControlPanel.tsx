import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, hairline, radius, space } from '../../theme/tokens'

export type MatchdayStage = 'upcoming' | 'arrival' | 'live' | 'review'

export type MatchdayControlPanelProps = {
  stage: Exclude<MatchdayStage, 'upcoming'>
  confirmedCount: number
  checkedInCount: number
  onOpenAttendance: () => void
}

export function getMatchdayStage(
  eventDate: string | Date | null | undefined,
  nowMs = Date.now(),
): MatchdayStage {
  if (!eventDate) return 'upcoming'
  const eventMs = new Date(eventDate).getTime()
  if (Number.isNaN(eventMs)) return 'upcoming'
  if (nowMs < eventMs - 2 * 60 * 60 * 1000) return 'upcoming'
  if (nowMs < eventMs) return 'arrival'
  if (nowMs <= eventMs + 3 * 60 * 60 * 1000) return 'live'
  return 'review'
}

export function MatchdayControlPanel({
  stage,
  confirmedCount,
  checkedInCount,
  onOpenAttendance,
}: MatchdayControlPanelProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const confirmed = Math.max(0, confirmedCount)
  const checkedIn = Math.max(0, Math.min(checkedInCount, confirmed))
  const missing = Math.max(0, confirmed - checkedIn)
  const title = t(`event.matchday.${stage}Title`, {
    defaultValue: getStageTitle(stage),
  })
  const body = t(`event.matchday.${stage}Body`, {
    defaultValue: getStageBody(stage),
    checkedIn,
    confirmed,
    missing,
  })
  const actionLabel = t(
    stage === 'review'
      ? 'event.matchday.reviewAttendance'
      : 'event.matchday.openAttendance',
    {
      defaultValue: stage === 'review' ? 'Review attendance' : 'Open attendance',
    },
  )
  const accessibilityLabel =
    stage === 'review'
      ? actionLabel
      : t('event.matchday.openAttendanceA11y', {
          defaultValue: actionLabel,
        })

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: c.borderDefault,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconBubble, { backgroundColor: withAlpha(c.primary, 0.12) }]}>
          <Icon name={stage === 'review' ? 'list.clipboard' : 'whistle'} size={18} color="tint" />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('event.matchday.eyebrow', { defaultValue: 'MATCHDAY' })}
          </Text>
          <Text variant="headline" weight="semibold" color="primary" numberOfLines={1}>
            {title}
          </Text>
        </View>
      </View>

      <Text variant="subheadline" color="secondary">
        {body}
      </Text>

      <View style={styles.metrics}>
        <Metric
          label={t('event.matchday.confirmed', { defaultValue: 'Confirmed' })}
          value={confirmed}
        />
        <Metric
          label={t('event.matchday.checkedIn', { defaultValue: 'Checked in' })}
          value={checkedIn}
        />
        <Metric
          label={t('event.matchday.missing', { defaultValue: 'To review' })}
          value={missing}
          muted={missing === 0}
        />
      </View>

      <Pressable
        onPress={onOpenAttendance}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.action,
          { backgroundColor: c.primary },
          pressed && { opacity: 0.86 },
        ]}
      >
        <Text style={[styles.actionText, { color: c.textInverse }]} numberOfLines={1}>
          {actionLabel}
        </Text>
        <Icon name="chevron.right" size={15} color="inverse" />
      </Pressable>
    </View>
  )
}

function Metric({
  label,
  value,
  muted,
}: {
  label: string
  value: number
  muted?: boolean
}) {
  return (
    <View style={styles.metric}>
      <Text variant="title3" weight="semibold" color={muted ? 'tertiary' : 'primary'} tabular>
        {value}
      </Text>
      <Text variant="caption2" color="secondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

function getStageTitle(stage: Exclude<MatchdayStage, 'upcoming'>): string {
  switch (stage) {
    case 'arrival':
      return 'Arrival window'
    case 'live':
      return 'Match underway'
    case 'review':
      return 'Post-match attendance'
  }
}

function getStageBody(stage: Exclude<MatchdayStage, 'upcoming'>): string {
  switch (stage) {
    case 'arrival':
      return '{{checkedIn}}/{{confirmed}} confirmed players checked in before kickoff.'
    case 'live':
      return '{{checkedIn}}/{{confirmed}} confirmed players are marked present.'
    case 'review':
      return '{{missing}} confirmed players need attendance review.'
  }
}

function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('rgb')) {
    return hex.replace(/rgba?\(([^)]+)\)/, (_, body) => {
      const parts = String(body).split(',').map((p) => p.trim()).slice(0, 3)
      return `rgba(${parts.join(', ')}, ${alpha})`
    })
  }
  if (!hex.startsWith('#')) return hex
  const h = hex.slice(1)
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return hex
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  card: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: space.xs,
  },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  metrics: {
    flexDirection: 'row',
    gap: space.sm,
  },
  metric: {
    flex: 1,
    minHeight: 56,
    justifyContent: 'center',
  },
  action: {
    minHeight: 44,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  actionText: {
    fontFamily: fonts.label,
    fontSize: 13,
    fontWeight: '700',
  },
})
