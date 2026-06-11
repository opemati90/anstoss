/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useState } from 'react'
import {
  View,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NotificationPreference } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { Screen, Text, Icon, type IconName } from '../src/components/ui'
import { space, fontSize, radius, fonts, lineHeight, hairline } from '../src/theme/tokens'

type LocalPref = {
  teamId: string | null
  teamName: string
  mutedChat: boolean
  mutedEvents: boolean
  mutedAnnouncements: boolean
  quietStart: string
  quietEnd: string
}

type ToggleField = 'mutedChat' | 'mutedEvents' | 'mutedAnnouncements'

export default function NotificationSettingsScreen() {
  const { t } = useTranslation()
  const { activeClub, teamsForActiveClub } = useAuth()
  const c = useClubColors()
  const [prefs, setPrefs] = useState<LocalPref[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const clubId = activeClub?.club.id

  const buildLocalPrefs = useCallback(
    (data: NotificationPreference[]) => {
      const teamRows: LocalPref[] = teamsForActiveClub.map((tm) => {
        const existing = data.find((p) => p.teamId === tm.team.id)
        return {
          teamId: tm.team.id,
          teamName: tm.team.displayName || tm.team.name,
          mutedChat: existing?.mutedChat ?? false,
          mutedEvents: existing?.mutedEvents ?? false,
          mutedAnnouncements: existing?.mutedAnnouncements ?? false,
          quietStart: existing?.quietStart ?? '',
          quietEnd: existing?.quietEnd ?? '',
        }
      })

      const clubWide = data.find((p) => p.teamId === null)
      const alignedTeamRow =
        teamRows.length > 0 &&
        teamRows.every(
          (row) =>
            row.mutedChat === teamRows[0].mutedChat &&
            row.mutedEvents === teamRows[0].mutedEvents &&
            row.mutedAnnouncements === teamRows[0].mutedAnnouncements &&
            row.quietStart === teamRows[0].quietStart &&
            row.quietEnd === teamRows[0].quietEnd,
        )
          ? teamRows[0]
          : null

      const clubRow: LocalPref = {
        teamId: null,
        teamName: t('notificationSettings.clubWide'),
        mutedChat: clubWide?.mutedChat ?? alignedTeamRow?.mutedChat ?? false,
        mutedEvents: clubWide?.mutedEvents ?? alignedTeamRow?.mutedEvents ?? false,
        mutedAnnouncements:
          clubWide?.mutedAnnouncements ?? alignedTeamRow?.mutedAnnouncements ?? false,
        quietStart: clubWide?.quietStart ?? alignedTeamRow?.quietStart ?? '',
        quietEnd: clubWide?.quietEnd ?? alignedTeamRow?.quietEnd ?? '',
      }

      // With a single team the club-wide "all teams" block is normally an exact
      // duplicate of the team block — collapse to just the team to cut clutter.
      // BUT keep the club-wide row whenever a real club-wide preference is
      // stored: the API applies it as a fallback (OR teamId/null), so hiding it
      // could show "notifications on" while a club-wide mute is still active.
      const hasClubWidePref = clubWide != null
      return teamRows.length > 1 || hasClubWidePref
        ? [clubRow, ...teamRows]
        : teamRows
    },
    [t, teamsForActiveClub],
  )

  const fetchPrefs = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<NotificationPreference[]>(`/clubs/${clubId}/notification-preferences`)
      setPrefs(buildLocalPrefs(data || []))
    } catch {
      // stale is ok
    } finally {
      setLoading(false)
    }
  }, [buildLocalPrefs, clubId])

  useEffect(() => {
    fetchPrefs()
  }, [fetchPrefs])

  const applyPrefUpdate = useCallback(
    (current: LocalPref[], index: number, updater: (pref: LocalPref) => LocalPref) => {
      const target = current[index]
      if (!target) return current

      const updatedTarget = updater(target)

      if (target.teamId !== null) {
        return current.map((pref, prefIndex) => (prefIndex === index ? updatedTarget : pref))
      }

      return current.map((pref, prefIndex) => {
        if (prefIndex === index) return updatedTarget
        if (pref.teamId === null) return pref
        return {
          ...pref,
          mutedChat: updatedTarget.mutedChat,
          mutedEvents: updatedTarget.mutedEvents,
          mutedAnnouncements: updatedTarget.mutedAnnouncements,
          quietStart: updatedTarget.quietStart,
          quietEnd: updatedTarget.quietEnd,
        }
      })
    },
    [],
  )

  const savePref = async (pref: LocalPref, previousPrefs: LocalPref[]) => {
    if (!clubId) return
    setSaving(true)
    try {
      const payload = {
        mutedChat: pref.mutedChat,
        mutedEvents: pref.mutedEvents,
        mutedAnnouncements: pref.mutedAnnouncements,
        quietStart: pref.quietStart || null,
        quietEnd: pref.quietEnd || null,
      }

      if (pref.teamId === null) {
        await Promise.all(
          teamsForActiveClub.map((team) =>
            api(`/clubs/${clubId}/notification-preferences`, {
              method: 'PUT',
              body: {
                teamId: team.team.id,
                ...payload,
              },
            }),
          ),
        )
      } else {
        await api(`/clubs/${clubId}/notification-preferences`, {
          method: 'PUT',
          body: {
            teamId: pref.teamId,
            ...payload,
          },
        })
      }
    } catch {
      setPrefs(previousPrefs)
      Alert.alert(t('common.error'), t('errors.server'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = (index: number, field: ToggleField) => {
    const current = prefs[index]
    if (!current) return

    const previousPrefs = prefs
    const nextPrefs = applyPrefUpdate(previousPrefs, index, (pref) => ({
      ...pref,
      [field]: !pref[field],
    }))

    setPrefs(nextPrefs)
    void savePref(nextPrefs[index], previousPrefs)
  }

  const handleQuietHour = (index: number, field: 'quietStart' | 'quietEnd', value: string) => {
    setPrefs((current) =>
      applyPrefUpdate(current, index, (pref) => ({
        ...pref,
        [field]: value,
      })),
    )
  }

  const handleQuietHourBlur = (index: number) => {
    if (!prefs[index]) return
    void savePref(prefs[index], prefs)
  }

  return (
    <Screen
      header={<ModalHeader title={t('notificationSettings.title')} mode="back" />}
      padded={false}
    >
      <KeyboardAvoidingView
        style={styles.scroll}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: space.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View style={styles.intro}>
          <Text style={[styles.description, { color: c.textSecondary }]}>
            {t('notificationSettings.description')}
          </Text>
          <Text style={[styles.descriptionHint, { color: c.textTertiary }]}>
            {t('notificationSettings.quietHoursHint')}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: space.xl }} />
        ) : prefs.length === 0 ? (
          <EmptyState
            icon="bell"
            title={t('notificationSettings.noTeamsTitle', { defaultValue: 'No teams yet' })}
            description={t('notificationSettings.noTeamsBody', {
              defaultValue: 'Notification preferences appear once you are assigned to a team.',
            })}
            compact
          />
        ) : (
          prefs.map((pref, index) => (
            <View key={pref.teamId ?? 'club'} style={styles.section}>
              <View style={styles.sectionCaptionRow}>
                <Text style={[styles.sectionCaption, { color: c.textTertiary }]}>
                  {pref.teamName}
                </Text>
                {pref.teamId === null ? (
                  <View style={[styles.defaultBadge, { backgroundColor: c.primary50 }]}>
                    <Text style={[styles.defaultBadgeText, { color: c.primary }]}>
                      {t('notificationSettings.defaultBadge')}
                    </Text>
                  </View>
                ) : null}
              </View>
              {pref.teamId === null ? (
                <Text style={[styles.sectionHelper, { color: c.textSecondary }]}>
                  {t('notificationSettings.bulkHint')}
                </Text>
              ) : null}

              <View
                style={[
                  styles.groupCard,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                ]}
              >
                <ToggleRow
                  label={t('notificationSettings.muteChat')}
                  icon="message"
                  value={pref.mutedChat}
                  onToggle={() => handleToggle(index, 'mutedChat')}
                  color={c.primary}
                />
                <RowDivider color={c.borderDefault} />
                <ToggleRow
                  label={t('notificationSettings.muteEvents')}
                  icon="calendar"
                  value={pref.mutedEvents}
                  onToggle={() => handleToggle(index, 'mutedEvents')}
                  color={c.primary}
                />
                <RowDivider color={c.borderDefault} />
                <ToggleRow
                  label={t('notificationSettings.muteAnnouncements')}
                  icon="megaphone"
                  value={pref.mutedAnnouncements}
                  onToggle={() => handleToggle(index, 'mutedAnnouncements')}
                  color={c.primary}
                />
                <RowDivider color={c.borderDefault} />
                <QuietHoursRow
                  pref={pref}
                  index={index}
                  onChangeHour={handleQuietHour}
                  onBlur={handleQuietHourBlur}
                />
              </View>
            </View>
          ))
        )}

        {saving ? (
          <View style={styles.savingOverlay}>
            <ActivityIndicator size="small" color={c.primary} />
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

function RowDivider({ color }: { color: string }) {
  return <View style={[styles.rowDivider, { backgroundColor: color }]} />
}

function ToggleRow({
  label,
  icon,
  value,
  onToggle,
  color,
}: {
  label: string
  icon: IconName
  value: boolean
  onToggle: () => void
  color: string
}) {
  const c = useClubColors()
  return (
    <View style={styles.toggleRow}>
      <View style={[styles.iconBubble, { backgroundColor: c.surfaceSunken ?? c.background }]}>
        <Icon name={icon} size={16} color={c.textSecondary} />
      </View>
      <Text style={[styles.toggleLabel, { color: c.textPrimary }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: c.borderDefault, true: `${color}80` }}
        thumbColor={value ? color : c.surface}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
      />
    </View>
  )
}

function QuietHoursRow({
  pref,
  index,
  onChangeHour,
  onBlur,
}: {
  pref: LocalPref
  index: number
  onChangeHour: (index: number, field: 'quietStart' | 'quietEnd', value: string) => void
  onBlur: (index: number) => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <View style={styles.quietRowBlock}>
      <View style={styles.quietLabelRow}>
        <View style={[styles.iconBubble, { backgroundColor: c.surfaceSunken ?? c.background }]}>
          <Icon name="clock" size={16} color={c.textSecondary} />
        </View>
        <Text style={[styles.toggleLabel, { color: c.textPrimary }]}>
          {t('notificationSettings.quietHours')}
        </Text>
      </View>
      <View style={styles.quietInputsRow}>
        <TextInput
          style={[
            styles.timeInput,
            { borderColor: c.borderDefault, color: c.textPrimary, backgroundColor: c.surfaceSunken },
          ]}
          placeholder={t('notificationSettings.quietStartPlaceholder', { defaultValue: '22:00' })}
          placeholderTextColor={c.textTertiary}
          value={pref.quietStart}
          onChangeText={(v) => onChangeHour(index, 'quietStart', v)}
          onBlur={() => onBlur(index)}
          maxLength={5}
          keyboardType="numbers-and-punctuation"
        />
        <Text style={[styles.quietDash, { color: c.textTertiary }]}>–</Text>
        <TextInput
          style={[
            styles.timeInput,
            { borderColor: c.borderDefault, color: c.textPrimary, backgroundColor: c.surfaceSunken },
          ]}
          placeholder={t('notificationSettings.quietEndPlaceholder', { defaultValue: '07:00' })}
          placeholderTextColor={c.textTertiary}
          value={pref.quietEnd}
          onChangeText={(v) => onChangeHour(index, 'quietEnd', v)}
          onBlur={() => onBlur(index)}
          maxLength={5}
          keyboardType="numbers-and-punctuation"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    // paddingBottom is applied inline with the safe-area inset so the last
    // card clears the home indicator without an arbitrary oversized gap.
    flexGrow: 1,
  },
  intro: {
    gap: space.xs,
    marginBottom: space.lg,
    paddingHorizontal: space.xs,
  },
  description: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  descriptionHint: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  section: {
    marginBottom: space.xl,
  },
  sectionCaptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xs,
    marginLeft: space.sm,
    marginRight: space.sm,
  },
  sectionCaption: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  sectionHelper: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    marginBottom: space.sm,
    marginLeft: space.sm,
    marginRight: space.sm,
  },
  defaultBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space['2xs'],
    borderRadius: radius.full,
  },
  defaultBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
  },
  groupCard: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
  },
  rowDivider: {
    height: hairline,
    marginLeft: space.md + 32 + space.sm + 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm + 2,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.heading,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  quietRowBlock: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  quietLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  quietInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: 32 + space.sm + 2,
  },
  timeInput: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    borderWidth: hairline,
    paddingHorizontal: space.sm,
    fontSize: fontSize.sm,
    fontFamily: fonts.data,
    textAlign: 'center',
  },
  quietDash: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  savingOverlay: {
    position: 'absolute',
    top: 70,
    right: space.md,
  },
})