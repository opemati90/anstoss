import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type {
  EventReadiness,
  EventReadinessSignal,
  EventReadinessSignalKey,
  EventReadinessStatus,
} from '@anstoss/shared'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, hairline, radius, space } from '../../theme/tokens'

export function EventReadinessCard({
  readiness,
  eventTitle,
  compact = false,
  onPress,
}: {
  readiness: EventReadiness
  eventTitle?: string | null
  compact?: boolean
  onPress?: () => void
}) {
  const c = useClubColors()
  const { t } = useTranslation()
  const tone = getStatusTone(readiness.status)
  const toneColor = getToneColor(readiness.status, c)
  const signals = readiness.signals.slice(0, compact ? 2 : 3)
  const cardStyle = [
    styles.card,
    compact && styles.cardCompact,
    { backgroundColor: c.surface, borderColor: c.borderDefault },
  ]

  const content = (
    <>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('home.readiness.eyebrow', {
              defaultValue: compact ? 'READINESS' : 'EVENT READINESS',
            })}
          </Text>
          <Text variant={compact ? 'callout' : 'title3'} color="primary" weight="semibold" numberOfLines={1}>
            {eventTitle || t('home.readiness.nextEvent', { defaultValue: 'Next event readiness' })}
          </Text>
        </View>
        <View
          style={[
            styles.scoreRing,
            compact && styles.scoreRingCompact,
            {
              borderColor: toneColor,
              backgroundColor: withAlpha(toneColor, 0.08),
            },
          ]}
        >
          <Text variant={compact ? 'callout' : 'title3'} color="primary" weight="semibold" tabular>
            {readiness.score}
          </Text>
          {!compact ? (
            <Text style={[styles.scoreUnit, { color: c.textTertiary }]}>%</Text>
          ) : null}
        </View>
      </View>

      <View style={[styles.statusRow, { backgroundColor: withAlpha(toneColor, 0.09) }]}>
        <View style={[styles.statusDot, { backgroundColor: toneColor }]} />
        <Text style={[styles.statusText, { color: toneColor }]}>
          {t(`home.readiness.status.${readiness.status}`, {
            defaultValue: getStatusLabel(readiness.status),
          })}
        </Text>
        <Text variant="caption2" color="secondary" style={styles.statusDetail} numberOfLines={1}>
          {tone}
        </Text>
      </View>

      <View style={[styles.progressTrack, { backgroundColor: c.borderDefault }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${readiness.score}%`, backgroundColor: toneColor },
          ]}
        />
      </View>

      <View style={styles.metricRow}>
        <Metric
          label={t('home.readiness.confirmed', { defaultValue: 'Confirmed' })}
          value={`${readiness.metrics.yesCount}/${readiness.metrics.squadSize}`}
        />
        <Metric
          label={t('home.readiness.pending', { defaultValue: 'Pending' })}
          value={String(readiness.metrics.pendingCount)}
          dim={readiness.metrics.pendingCount === 0}
        />
        <Metric
          label={t('home.readiness.checkIns', { defaultValue: 'Check-ins' })}
          value={String(readiness.metrics.checkInCount)}
          dim={readiness.metrics.checkInCount === 0}
        />
      </View>

      <View style={styles.signalList}>
        {signals.length > 0 ? (
          signals.map((signal) => (
            <SignalRow key={signal.key} signal={signal} />
          ))
        ) : (
          <View style={styles.signalRow}>
            <View style={[styles.signalIcon, { backgroundColor: withAlpha(c.success, 0.12) }]}>
              <Icon name="checkmark.circle.fill" size={13} color="success" />
            </View>
            <Text variant="caption1" color="secondary" style={styles.signalText}>
              {t('home.readiness.noBlockers', { defaultValue: 'No blockers detected.' })}
            </Text>
          </View>
        )}
      </View>
    </>
  )

  if (!onPress) {
    return <View style={cardStyle}>{content}</View>
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('home.readiness.open', {
        defaultValue: 'Open event readiness',
      })}
      style={({ pressed }: { pressed?: boolean }) => [
        ...cardStyle,
        pressed && { opacity: 0.94 },
      ]}
    >
      {content}
    </Pressable>
  )
}

function Metric({
  label,
  value,
  dim,
}: {
  label: string
  value: string
  dim?: boolean
}) {
  return (
    <View style={styles.metric}>
      <Text variant="callout" color={dim ? 'tertiary' : 'primary'} weight="semibold" tabular>
        {value}
      </Text>
      <Text variant="caption2" color="secondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

function SignalRow({ signal }: { signal: EventReadinessSignal }) {
  const c = useClubColors()
  const { t } = useTranslation()
  const color =
    signal.severity === 'critical'
      ? c.error
      : signal.severity === 'warning'
        ? c.warning
        : c.primary

  return (
    <View style={styles.signalRow}>
      <View style={[styles.signalIcon, { backgroundColor: withAlpha(color, 0.12) }]}>
        <Icon name={getSignalIcon(signal.key)} size={13} color={color} />
      </View>
      <Text variant="caption1" color="secondary" style={styles.signalText} numberOfLines={1}>
        {t(`home.readiness.signal.${signal.key}`, {
          defaultValue: getSignalLabel(signal),
          count: signal.count,
          target: signal.target,
        })}
      </Text>
    </View>
  )
}

function getStatusTone(status: EventReadinessStatus): string {
  switch (status) {
    case 'READY':
      return 'No urgent action needed'
    case 'WATCH':
      return 'A few items need attention'
    case 'AT_RISK':
      return 'Fix before kickoff'
    case 'NEEDS_SETUP':
      return 'Roster setup required'
  }
}

function getStatusLabel(status: EventReadinessStatus): string {
  switch (status) {
    case 'READY':
      return 'Ready'
    case 'WATCH':
      return 'Watch'
    case 'AT_RISK':
      return 'At risk'
    case 'NEEDS_SETUP':
      return 'Needs setup'
  }
}

function getToneColor(
  status: EventReadinessStatus,
  c: ReturnType<typeof useClubColors>,
): string {
  switch (status) {
    case 'READY':
      return c.success
    case 'WATCH':
      return c.warning
    case 'AT_RISK':
    case 'NEEDS_SETUP':
      return c.error
  }
}

function getSignalLabel(signal: EventReadinessSignal): string {
  switch (signal.key) {
    case 'no_squad':
      return 'No active squad members yet.'
    case 'low_confirmations':
      return `${signal.count ?? 0}/${signal.target ?? 0} confirmed.`
    case 'low_response_rate':
      return `${signal.count ?? 0}/${signal.target ?? 0} players have replied.`
    case 'pending_replies':
      return `${signal.count ?? 0} replies still pending.`
    case 'availability_risks':
      return `${signal.count ?? 0} availability risks.`
    case 'injury_risks':
      return `${signal.count ?? 0} injury or suspension risks.`
    case 'check_in_gap':
      return `${signal.count ?? 0}/${signal.target ?? 0} checked in.`
    case 'no_show_risk':
      return `${signal.count ?? 0} likely no-shows.`
  }
}

function getSignalIcon(key: EventReadinessSignalKey): string {
  switch (key) {
    case 'no_squad':
      return 'person.2'
    case 'low_confirmations':
    case 'low_response_rate':
    case 'pending_replies':
      return 'clock'
    case 'availability_risks':
      return 'person.circle'
    case 'injury_risks':
      return 'exclamationmark.triangle.fill'
    case 'check_in_gap':
      return 'checkmark.circle'
    case 'no_show_risk':
      return 'exclamationmark.circle.fill'
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
  let h = hex.slice(1)
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  card: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  cardCompact: {
    padding: space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  headerText: {
    flex: 1,
    gap: space.xs,
  },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  scoreRing: {
    width: 58,
    height: 58,
    borderRadius: radius.full,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRingCompact: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
  },
  scoreUnit: {
    fontSize: 9,
    fontFamily: fonts.label,
    marginTop: -space.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
  },
  statusText: {
    fontFamily: fonts.label,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statusDetail: {
    flex: 1,
  },
  progressTrack: {
    height: 5,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  metricRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  metric: {
    flex: 1,
    gap: space.xs,
  },
  signalList: {
    gap: space.xs,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 26,
  },
  signalIcon: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalText: {
    flex: 1,
  },
})
