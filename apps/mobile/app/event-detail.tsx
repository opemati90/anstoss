import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { RSVP } from '@anstoss/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EventListSkeleton } from '../src/components/Skeleton'
import { ErrorState } from '../src/components/ErrorState'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import {
  fonts,
  fontSize,
  fontWeight,
  neutralColors,
  radius,
  semanticColors,
  space,
  lineHeight,
} from '../src/theme/tokens'

type RsvpUser = {
  id: string
  status: 'YES' | 'MAYBE' | 'NO'
  updatedAt: string
  user: { id: string; name: string; avatarUrl?: string | null }
}

type EventDetail = {
  id: string
  title: string
  type: 'TRAINING' | 'MATCH' | 'OTHER'
  date: string
  location: string | null
  notes: string | null
  rsvps: RsvpUser[]
  team?: { id: string; name: string }
  yesCount?: number
  maybeCount?: number
  noCount?: number
  myRsvp?: 'YES' | 'MAYBE' | 'NO' | null
}

const RSVP_OPTIONS = [
  { status: 'YES', icon: 'checkmark-circle' as const, color: semanticColors.success, labelKey: 'event.rsvpYes' },
  { status: 'MAYBE', icon: 'help-circle' as const, color: semanticColors.warning, labelKey: 'event.rsvpMaybe' },
  { status: 'NO', icon: 'close-circle' as const, color: semanticColors.error, labelKey: 'event.rsvpNo' },
]

export default function EventDetailScreen() {
  const { t } = useTranslation()
  const { eventId, teamId } = useLocalSearchParams<{ eventId: string; teamId?: string }>()
  const { activeClub } = useAuth()
  const theme = useClubColors()
  const locale = getAppLocale(getAppLanguage())

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [rsvpPending, setRsvpPending] = useState(false)

  const rsvpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rsvpScale = useRef(new Animated.Value(1)).current

  const fetchEvent = useCallback(async () => {
    if (!activeClub || !eventId) return
    setError(false)
    try {
      const data = await api<EventDetail>(
        `/clubs/${activeClub.club.id}/events/${eventId}`,
      )
      setEvent(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [activeClub, eventId])

  useEffect(() => {
    fetchEvent()
  }, [fetchEvent])

  const handleRsvp = useCallback(
    (status: string) => {
      if (!activeClub || !event || rsvpPending) return

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      Animated.sequence([
        Animated.timing(rsvpScale, { toValue: 0.95, duration: 50, useNativeDriver: true }),
        Animated.spring(rsvpScale, { toValue: 1, useNativeDriver: true }),
      ]).start()

      // Optimistic UI
      setEvent((prev) =>
        prev ? { ...prev, myRsvp: status as EventDetail['myRsvp'] } : prev,
      )

      // Debounce
      if (rsvpTimer.current) clearTimeout(rsvpTimer.current)
      rsvpTimer.current = setTimeout(async () => {
        setRsvpPending(true)
        try {
          await api(`/clubs/${activeClub.club.id}/events/${event.id}/rsvp`, {
            method: 'PUT',
            body: { status },
          })
          await fetchEvent()
        } catch {
          await fetchEvent()
        } finally {
          setRsvpPending(false)
        }
      }, RSVP.DEBOUNCE_MS)
    },
    [activeClub, event, rsvpPending, rsvpScale, fetchEvent],
  )

  if (loading) {
    return (
      <View style={styles.container}>
        <ModalHeader title={t('event.detailTitle')} />
        <EventListSkeleton />
      </View>
    )
  }

  if (error || !event) {
    return (
      <View style={styles.container}>
        <ModalHeader title={t('event.detailTitle')} />
        <View style={styles.centered}>
          <ErrorState
            message={t('event.loadError')}
            onRetry={fetchEvent}
            retryLabel={t('common.retry')}
          />
        </View>
      </View>
    )
  }

  const date = new Date(event.date)
  const formattedDate = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
  const formattedTime = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  const yesCount = event.yesCount ?? event.rsvps?.filter((r) => r.status === 'YES').length ?? 0
  const maybeCount = event.maybeCount ?? event.rsvps?.filter((r) => r.status === 'MAYBE').length ?? 0
  const noCount = event.noCount ?? event.rsvps?.filter((r) => r.status === 'NO').length ?? 0

  return (
    <View style={styles.container}>
      <ModalHeader title={event.title} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Event Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={16} color={neutralColors.textSecondary} />
            <Text style={styles.infoDate}>{formattedDate}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color={neutralColors.textSecondary} />
            <Text style={styles.infoTime}>{formattedTime}</Text>
          </View>
          {event.location ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color={neutralColors.textSecondary} />
              <Text style={styles.infoLocation}>{event.location}</Text>
            </View>
          ) : null}
          <View style={styles.typeBadgeRow}>
            <View style={[styles.typeBadge, { backgroundColor: theme.clubPrimaryLight }]}>
              <Text style={[styles.typeBadgeText, { color: theme.clubPrimary }]}>
                {t(`event.type.${event.type}`)}
              </Text>
            </View>
          </View>
          {event.notes ? (
            <View style={styles.descriptionSection}>
              <Text style={styles.descriptionText}>{event.notes}</Text>
            </View>
          ) : (
            <View style={styles.descriptionSection}>
              <Text style={styles.noDescriptionText}>{t('event.noDescription')}</Text>
            </View>
          )}
        </View>

        {/* RSVP Buttons */}
        <Animated.View style={[styles.rsvpRow, { transform: [{ scale: rsvpScale }] }]}>
          {RSVP_OPTIONS.map((option) => {
            const isActive = event.myRsvp === option.status
            return (
              <TouchableOpacity
                key={option.status}
                accessibilityRole="button"
                accessibilityLabel={t(option.labelKey)}
                style={[
                  styles.rsvpButton,
                  isActive && {
                    backgroundColor: option.color,
                    borderColor: option.color,
                  },
                ]}
                onPress={() => handleRsvp(option.status)}
                disabled={rsvpPending}
              >
                <Ionicons
                  name={option.icon}
                  size={18}
                  color={isActive ? neutralColors.textInverse : neutralColors.textSecondary}
                />
                <Text
                  style={[
                    styles.rsvpButtonText,
                    isActive && { color: neutralColors.textInverse },
                  ]}
                >
                  {t(option.labelKey)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </Animated.View>

        {/* RSVP Breakdown */}
        <RsvpBreakdown
          rsvps={event.rsvps || []}
          yesCount={yesCount}
          maybeCount={maybeCount}
          noCount={noCount}
          eventId={event.id}
          theme={theme}
        />
      </ScrollView>
    </View>
  )
}

const RSVP_SECTIONS = [
  { status: 'YES' as const, icon: 'checkmark-circle' as const, color: semanticColors.success, labelKey: 'event.rsvpYes' },
  { status: 'MAYBE' as const, icon: 'help-circle' as const, color: semanticColors.warning, labelKey: 'event.rsvpMaybe' },
  { status: 'NO' as const, icon: 'close-circle' as const, color: semanticColors.error, labelKey: 'event.rsvpNo' },
]

function RsvpBreakdown({
  rsvps,
  yesCount,
  maybeCount,
  noCount,
  eventId,
  theme,
}: {
  rsvps: RsvpUser[]
  yesCount: number
  maybeCount: number
  noCount: number
  eventId: string
  theme: { clubPrimary: string; clubPrimaryLight: string }
}) {
  const { t } = useTranslation()
  const [expandedSection, setExpandedSection] = useState<string | null>('YES')

  const grouped = {
    YES: rsvps.filter((r) => r.status === 'YES'),
    MAYBE: rsvps.filter((r) => r.status === 'MAYBE'),
    NO: rsvps.filter((r) => r.status === 'NO'),
  }

  const counts = { YES: yesCount, MAYBE: maybeCount, NO: noCount }
  const totalResponses = yesCount + maybeCount + noCount

  const toggleSection = (status: string) => {
    setExpandedSection((prev) => (prev === status ? null : status))
  }

  return (
    <View style={styles.breakdownCard}>
      {/* Summary counts row */}
      <View style={styles.breakdownCountsRow}>
        {RSVP_SECTIONS.map((section) => (
          <View key={section.status} style={styles.breakdownCountChip}>
            <Ionicons name={section.icon} size={18} color={section.color} />
            <Text style={[styles.breakdownCountNum, { color: section.color }]}>
              {counts[section.status]}
            </Text>
          </View>
        ))}
      </View>

      {/* Collapsible sections */}
      {totalResponses > 0 ? (
        RSVP_SECTIONS.map((section) => {
          const items = grouped[section.status]
          const isExpanded = expandedSection === section.status

          return (
            <View key={section.status}>
              <TouchableOpacity
                style={styles.breakdownSectionHeader}
                onPress={() => toggleSection(section.status)}
                accessibilityRole="button"
                accessibilityLabel={`${t(section.labelKey)} ${counts[section.status]}`}
              >
                <View style={styles.breakdownSectionLeft}>
                  <View style={[styles.breakdownSectionDot, { backgroundColor: section.color }]} />
                  <Text style={styles.breakdownSectionTitle}>
                    {t(section.labelKey)}
                  </Text>
                  <Text style={styles.breakdownSectionCount}>({counts[section.status]})</Text>
                </View>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={neutralColors.textTertiary}
                />
              </TouchableOpacity>

              {isExpanded && items.length > 0 && (
                <View style={styles.breakdownMemberList}>
                  {items.map((rsvp) => (
                    <View key={rsvp.id} style={styles.breakdownMemberRow}>
                      <View style={[styles.breakdownAvatar, { backgroundColor: theme.clubPrimaryLight }]}>
                        <Text style={[styles.breakdownAvatarText, { color: theme.clubPrimary }]}>
                          {(rsvp.user.name || '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.breakdownMemberName}>{rsvp.user.name}</Text>
                    </View>
                  ))}
                </View>
              )}

              {isExpanded && items.length === 0 && (
                <Text style={styles.breakdownEmptyText}>{t('eventAttendance.noResponses')}</Text>
              )}
            </View>
          )
        })
      ) : (
        <Text style={styles.breakdownEmptyText}>{t('eventAttendance.noResponses')}</Text>
      )}

      {/* View full attendance link */}
      <TouchableOpacity
        style={styles.viewAttendanceRow}
        onPress={() =>
          router.push({
            pathname: '/event-attendance',
            params: { eventId },
          })
        }
        accessibilityRole="button"
        accessibilityLabel={t('event.viewAttendance')}
      >
        <Text style={[styles.viewAttendanceText, { color: theme.clubPrimary }]}>
          {t('event.viewAttendance')}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={theme.clubPrimary} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: space.md,
    paddingBottom: space['2xl'],
  },
  infoCard: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.md,
    marginBottom: space.md,
    gap: space.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  infoDate: {
    fontSize: fontSize.md,
    fontFamily: fonts.data,
    color: neutralColors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  infoTime: {
    fontSize: fontSize.md,
    fontFamily: fonts.data,
    color: neutralColors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  infoLocation: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
    flex: 1,
  },
  typeBadgeRow: {
    flexDirection: 'row',
    marginTop: space.xs,
  },
  typeBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
  },
  typeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
  },
  descriptionSection: {
    marginTop: space.xs,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: neutralColors.border,
  },
  descriptionText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textPrimary,
    lineHeight: lineHeight.sm,
  },
  noDescriptionText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textTertiary,
    fontStyle: 'italic',
  },
  rsvpRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.md,
  },
  rsvpButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  rsvpButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textSecondary,
  },
  breakdownCard: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.md,
  },
  breakdownCountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
  },
  breakdownCountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  breakdownCountNum: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.data,
  },
  breakdownSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
    paddingVertical: space.xs,
  },
  breakdownSectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  breakdownSectionDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  breakdownSectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  breakdownSectionCount: {
    fontSize: fontSize.sm,
    fontFamily: fonts.data,
    color: neutralColors.textTertiary,
  },
  breakdownMemberList: {
    paddingLeft: space.lg,
    marginBottom: space.sm,
  },
  breakdownMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
  },
  breakdownAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  breakdownAvatarText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
  },
  breakdownMemberName: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  breakdownEmptyText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textTertiary,
    paddingVertical: space.sm,
    paddingLeft: space.lg,
  },
  viewAttendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: space.xs,
    paddingTop: space.sm,
    marginTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: neutralColors.border,
  },
  viewAttendanceText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
  },
})
