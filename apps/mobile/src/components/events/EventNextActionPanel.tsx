import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'

export type EventRsvpStatus = 'YES' | 'MAYBE' | 'NO'

export type EventNextActionKind =
  | 'player-rsvp'
  | 'player-check-in'
  | 'player-checked-in'
  | 'staff-nudge'
  | 'staff-attendance'

type EventNextActionTone = 'primary' | 'success' | 'warning' | 'neutral'

export type EventNextAction = {
  kind: EventNextActionKind
  icon: string
  tone: EventNextActionTone
  titleKey: string
  bodyKey: string
  count?: number
  ctaKey?: string
}

export type EventNextActionInput = {
  canManage: boolean
  checkedInAt: string | null
  eventCancelled: boolean
  isAttendanceOpen: boolean
  isBeforeEventStart: boolean
  isInCheckInWindow: boolean
  isPlayer: boolean
  isReminderInCooldown: boolean
  myRsvp: EventRsvpStatus | null | undefined
  nonResponderCount: number | null
  showMatchdayControlPanel: boolean
}

export function canPlayerUseEventCheckIn(
  myRsvp: EventRsvpStatus | null | undefined,
  checkedInAt: string | null,
): boolean {
  return myRsvp === 'YES' || checkedInAt != null
}

type EventNextActionPanelProps = {
  action: EventNextAction | null
  currentRsvp: EventRsvpStatus | null | undefined
  rsvpPending: boolean
  checkInPending: boolean
  remindPending: boolean
  onRsvp: (status: EventRsvpStatus) => void
  onCheckIn: () => void
  onRemind: () => void
  onOpenAttendance: () => void
}

export function getEventNextAction(input: EventNextActionInput): EventNextAction | null {
  if (input.eventCancelled) return null

  if (
    input.isPlayer &&
    input.isInCheckInWindow &&
    canPlayerUseEventCheckIn(input.myRsvp, input.checkedInAt)
  ) {
    if (!input.checkedInAt) {
      return {
        kind: 'player-check-in',
        icon: 'qrcode',
        tone: 'primary',
        titleKey: 'event.nextAction.playerCheckInTitle',
        bodyKey: 'event.nextAction.playerCheckInBody',
        ctaKey: 'event.checkIn.button',
      }
    }

    return {
      kind: 'player-checked-in',
      icon: 'checkmark.circle.fill',
      tone: 'success',
      titleKey: 'event.nextAction.playerCheckedInTitle',
      bodyKey: 'event.nextAction.playerCheckedInBody',
    }
  }

  if (input.isPlayer && input.isBeforeEventStart && !input.myRsvp) {
    return {
      kind: 'player-rsvp',
      icon: 'hand.tap.fill',
      tone: 'primary',
      titleKey: 'event.nextAction.playerRsvpTitle',
      bodyKey: 'event.nextAction.playerRsvpBody',
    }
  }

  if (input.canManage && input.isAttendanceOpen && !input.showMatchdayControlPanel) {
    return {
      kind: 'staff-attendance',
      icon: 'person.2.fill',
      tone: 'neutral',
      titleKey: 'event.nextAction.staffAttendanceTitle',
      bodyKey: 'event.nextAction.staffAttendanceBody',
      ctaKey: 'event.nextAction.attendanceCta',
    }
  }

  const canSendReminder =
    input.canManage &&
    input.isBeforeEventStart &&
    !input.isReminderInCooldown &&
    input.nonResponderCount != null &&
    input.nonResponderCount > 0

  if (canSendReminder) {
    return {
      kind: 'staff-nudge',
      icon: 'bell.badge.fill',
      tone: 'warning',
      titleKey: 'event.nextAction.staffNudgeTitle',
      bodyKey: 'event.nextAction.staffNudgeBody',
      ctaKey: 'event.nextAction.remindCta',
      count: input.nonResponderCount ?? 0,
    }
  }

  return null
}

export function EventNextActionPanel({
  action,
  currentRsvp,
  rsvpPending,
  checkInPending,
  remindPending,
  onRsvp,
  onCheckIn,
  onRemind,
  onOpenAttendance,
}: EventNextActionPanelProps) {
  const { t } = useTranslation()
  const c = useClubColors()

  if (!action) return null

  const accent = getToneColor(action.tone, c)
  const copyOptions = action.count != null ? { count: action.count } : undefined
  const isActionPending =
    (action.kind === 'player-check-in' && checkInPending) ||
    (action.kind === 'staff-nudge' && remindPending)
  const primaryPress = getPrimaryPress(action.kind, {
    onCheckIn,
    onRemind,
    onOpenAttendance,
  })
  const primaryLabel = action.ctaKey
    ? t(action.ctaKey, copyOptions)
    : null
  const primaryAccessibilityLabel = primaryLabel
    ? getPrimaryAccessibilityLabel(action.kind, primaryLabel, t)
    : null
  const primaryA11yLabel =
    primaryLabel && primaryAccessibilityLabel && isActionPending
      ? t('event.nextAction.workingA11y', {
          action: primaryAccessibilityLabel,
        })
      : primaryAccessibilityLabel

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: c.surface,
          borderColor: c.borderDefault,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconBubble, { backgroundColor: withAlpha(accent, 0.12) }]}>
          <Icon name={action.icon} size={18} color={accent} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('event.nextAction.eyebrow')}
          </Text>
          <Text variant="headline" weight="semibold" color="primary" numberOfLines={2}>
            {t(action.titleKey, copyOptions)}
          </Text>
        </View>
      </View>

      <Text variant="subheadline" color="secondary">
        {t(action.bodyKey, copyOptions)}
      </Text>

      {action.kind === 'player-rsvp' ? (
        <View style={styles.rsvpRow}>
          {getRsvpOptions(c).map((option) => {
            const isSelected = currentRsvp === option.status
            return (
              <Pressable
                key={option.status}
                onPress={() => onRsvp(option.status)}
                disabled={rsvpPending}
                accessibilityRole="button"
                accessibilityLabel={t(option.accessibilityKey)}
                accessibilityState={{ selected: isSelected, disabled: rsvpPending }}
                style={({ pressed }) => [
                  styles.rsvpButton,
                  {
                    backgroundColor: isSelected ? option.color : c.surface,
                    borderColor: isSelected ? option.color : c.borderDefault,
                  },
                  (pressed || rsvpPending) && { opacity: 0.72 },
                ]}
              >
                <Text
                  variant="footnote"
                  weight="semibold"
                  numberOfLines={1}
                  style={{ color: isSelected ? c.textInverse : option.color }}
                >
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {primaryPress && primaryLabel && primaryA11yLabel ? (
        <Pressable
          onPress={primaryPress}
          disabled={isActionPending}
          accessibilityRole="button"
          accessibilityLabel={primaryA11yLabel}
          accessibilityState={{ disabled: isActionPending }}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: c.primary },
            pressed && !isActionPending && { opacity: 0.86 },
            isActionPending && { opacity: 0.64 },
          ]}
        >
          <Text
            style={[styles.primaryButtonText, { color: c.textInverse }]}
            numberOfLines={1}
          >
            {isActionPending ? t('event.nextAction.working') : primaryLabel}
          </Text>
          <Icon name="chevron.right" size={14} color="inverse" />
        </Pressable>
      ) : null}
    </View>
  )
}

function getPrimaryPress(
  kind: EventNextActionKind,
  handlers: {
    onCheckIn: () => void
    onRemind: () => void
    onOpenAttendance: () => void
  },
): (() => void) | null {
  switch (kind) {
    case 'player-check-in':
      return handlers.onCheckIn
    case 'staff-nudge':
      return handlers.onRemind
    case 'staff-attendance':
      return handlers.onOpenAttendance
    case 'player-rsvp':
    case 'player-checked-in':
      return null
  }
}

function getPrimaryAccessibilityLabel(
  kind: EventNextActionKind,
  fallback: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (kind) {
    case 'player-check-in':
      return t('event.nextAction.checkInA11y', { defaultValue: fallback })
    case 'staff-nudge':
      return t('event.nextAction.remindA11y', { defaultValue: fallback })
    case 'staff-attendance':
      return t('event.nextAction.attendanceA11y', { defaultValue: fallback })
    case 'player-rsvp':
    case 'player-checked-in':
      return fallback
  }
}

function getRsvpOptions(c: ReturnType<typeof useClubColors>): Array<{
  status: EventRsvpStatus
  labelKey: string
  accessibilityKey: string
  color: string
}> {
  return [
    {
      status: 'YES',
      labelKey: 'event.rsvpYes',
      accessibilityKey: 'event.nextAction.rsvpYesA11y',
      color: c.success,
    },
    {
      status: 'MAYBE',
      labelKey: 'event.rsvpMaybe',
      accessibilityKey: 'event.nextAction.rsvpMaybeA11y',
      color: c.warning,
    },
    {
      status: 'NO',
      labelKey: 'event.rsvpNo',
      accessibilityKey: 'event.nextAction.rsvpNoA11y',
      color: c.error,
    },
  ]
}

function getToneColor(
  tone: EventNextActionTone,
  c: ReturnType<typeof useClubColors>,
): string {
  switch (tone) {
    case 'success':
      return c.success
    case 'warning':
      return c.warning
    case 'neutral':
      return c.textPrimary
    case 'primary':
      return c.primary
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
  panel: {
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
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: space['2xs'],
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  rsvpRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  rsvpButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: hairline,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
})
