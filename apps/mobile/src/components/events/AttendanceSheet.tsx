import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { BottomSheet } from '../ui/BottomSheet'
import { Avatar, Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { card, hairline, radius, space } from '../../theme/tokens'

type CheckInEntry = {
  userId: string
  user: { name: string }
  checkedInAt: string
}

type NoShowEntry = {
  userId: string
  user: { name: string }
  status?: string
  reason?: string | null
}

type RsvpEntry = {
  userId: string
  user: { name: string; avatarUrl?: string | null }
  status: string
  reason?: string | null
}

type AttendanceData = {
  rsvps: Array<RsvpEntry>
  checkIns: CheckInEntry[]
  noShows: NoShowEntry[]
}

export type AttendanceSheetProps = {
  visible: boolean
  onClose: () => void
  clubId: string
  eventId: string
  /** ISO string — if set and in the past, no-shows section is shown */
  eventDate: string
}

export function AttendanceSheet({
  visible,
  onClose,
  clubId,
  eventId,
  eventDate,
}: AttendanceSheetProps) {
  const { t } = useTranslation()
  const c = useClubColors()

  const [data, setData] = useState<AttendanceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const eventEnded = new Date(eventDate) < new Date()

  useEffect(() => {
    setData(null)
    setError(false)
    setLoading(false)
  }, [clubId, eventId])

  // Fetch lazily when opened, and refresh if navigation swaps the event while open.
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setLoading(true)
    setError(false)
    setData(null)
    void api<AttendanceData>(
      `/clubs/${clubId}/events/${eventId}/attendance`,
    )
      .then((result) => {
        // Normalize: the endpoint omits empty arrays (e.g. a future match has no
        // checkIns/noShows), and the render does `.length`/.map on each — so
        // default them to [] to avoid "Cannot read property 'length' of
        // undefined".
        if (!cancelled) {
          setData({
            rsvps: result?.rsvps ?? [],
            checkIns: result?.checkIns ?? [],
            noShows: result?.noShows ?? [],
          })
        }
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clubId, eventId, visible])

  // Reset data on close so next open re-fetches fresh attendance
  const handleClose = useCallback(() => {
    setData(null)
    onClose()
  }, [onClose])

  const formatTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso))
    } catch {
      return iso
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      heightPct={75}
      contentStyle={{ flex: 1 }}
    >
      <View style={styles.header}>
        <Text variant="title2" weight="semibold" color="primary" style={{ flex: 1 }}>
          {t('event.checkIn.attendanceTitle')}
        </Text>
        <Pressable
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
          hitSlop={8}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
        >
          <Icon name="xmark" size={18} color="tertiary" />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text variant="subheadline" color="tertiary">
            {t('common.loadError')}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* RSVP responses — who's coming. The primary list, especially
              pre-match where there are no check-ins yet. */}
          {(['YES', 'MAYBE', 'NO'] as const).map((st) => {
            const group = (data?.rsvps ?? []).filter((r) => r.status === st)
            if (group.length === 0) return null
            const meta = {
              YES: { color: c.success, label: t('event.rsvpYes') },
              MAYBE: { color: c.warning, label: t('event.rsvpMaybe') },
              NO: { color: c.error, label: t('event.rsvpNo') },
            }[st]
            return (
              <View key={st} style={styles.rsvpGroup}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
                  <Text variant="headline" weight="semibold" color="primary" style={{ flex: 1 }}>
                    {meta.label}
                  </Text>
                  <Text variant="subheadline" color="tertiary" tabular>
                    {group.length}
                  </Text>
                </View>
                <View
                  style={[
                    styles.listCard,
                    { backgroundColor: c.surface, borderColor: c.borderDefault },
                  ]}
                >
                  {group.map((entry, idx) => (
                    <View
                      key={entry.userId}
                      style={[
                        styles.memberRow,
                        idx < group.length - 1 && {
                          borderBottomColor: c.borderDefault,
                          borderBottomWidth: hairline,
                        },
                      ]}
                    >
                      <Avatar size="md" src={entry.user.avatarUrl} fallbackText={entry.user.name} />
                      <Text
                        variant="body"
                        weight="medium"
                        color="primary"
                        style={{ flex: 1 }}
                        numberOfLines={1}
                      >
                        {entry.user.name}
                      </Text>
                      {st === 'NO' && entry.reason ? (
                        <View style={[styles.statusBadge, { backgroundColor: `${c.error}1f` }]}>
                          <Text variant="caption1" weight="semibold" color={c.error} numberOfLines={1}>
                            {t(`event.rsvpReasons.${entry.reason}`, { defaultValue: entry.reason })}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            )
          })}

          {/* Checked-In section — only once it's relevant (event started or has
              check-ins); hidden for a future match so it isn't an empty block. */}
          {eventEnded || (data?.checkIns.length ?? 0) > 0 ? (
          <>
          <View style={[styles.sectionHeader, { marginTop: space.lg }]}>
            <Icon name="checkmark.circle.fill" size="sm" color="success" />
            <Text variant="headline" weight="semibold" color="primary">
              {t('event.checkIn.attendance', { count: data?.checkIns.length ?? 0 })}
            </Text>
          </View>

          <View
            style={[
              styles.listCard,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            {data && data.checkIns.length > 0 ? (
              data.checkIns.map((entry, idx) => (
                <View
                  key={entry.userId}
                  style={[
                    styles.memberRow,
                    idx < data.checkIns.length - 1 && {
                      borderBottomColor: c.borderDefault,
                      borderBottomWidth: hairline,
                    },
                  ]}
                >
                  <Avatar size="md" fallbackText={entry.user.name} />
                  <Text variant="body" color="primary" style={{ flex: 1 }} numberOfLines={1}>
                    {entry.user.name}
                  </Text>
                  <Text variant="footnote" color="tertiary" tabular>
                    {formatTime(entry.checkedInAt)}
                  </Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyRow}>
                <Text variant="subheadline" color="tertiary">
                  {t('eventAttendance.noResponses')}
                </Text>
              </View>
            )}
          </View>
          </>
          ) : null}

          {/* No-Shows section — only after event ends */}
          {eventEnded ? (
            <>
              <View style={[styles.sectionHeader, { marginTop: space.lg }]}>
                <Icon name="xmark.circle.fill" size="sm" color="error" />
                <Text variant="headline" weight="semibold" color="primary">
                  {t('event.checkIn.noShows', { count: data?.noShows.length ?? 0 })}
                </Text>
              </View>

              <View
                style={[
                  styles.listCard,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                ]}
              >
                {data && data.noShows.length > 0 ? (
                  data.noShows.map((entry, idx) => (
                    <View
                      key={entry.userId}
                      style={[
                        styles.memberRow,
                        idx < data.noShows.length - 1 && {
                          borderBottomColor: c.borderDefault,
                          borderBottomWidth: hairline,
                        },
                      ]}
                    >
                      <Avatar size="md" fallbackText={entry.user.name} />
                      <Text variant="body" color="primary" style={{ flex: 1 }} numberOfLines={1}>
                        {entry.user.name}
                      </Text>
                      {entry.reason ? (
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: c.borderDefault },
                          ]}
                        >
                          <Text variant="caption1" weight="semibold" color="tertiary" numberOfLines={1}>
                            {t(`event.rsvpReasons.${entry.reason}`, { defaultValue: entry.reason })}
                          </Text>
                        </View>
                      ) : entry.status ? (
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: `${c.error}22` },
                          ]}
                        >
                          <Text variant="caption1" weight="semibold" color={c.error}>
                            {entry.status}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyRow}>
                    <Text variant="subheadline" color="tertiary">
                      {t('eventAttendance.noResponses')}
                    </Text>
                  </View>
                )}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  closeBtn: {
    padding: space.xs,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: space.md,
    paddingBottom: space['2xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginBottom: space.sm,
  },
  rsvpGroup: {
    marginBottom: space.lg,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  listCard: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    minHeight: 52,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyRow: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space['2xs'],
    borderRadius: radius.full,
  },
  card,
})
