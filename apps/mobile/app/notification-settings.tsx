import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import type { NotificationPreference } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { neutralColors, space, fontSize, fontWeight, radius } from '../src/theme/tokens'

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
  const theme = useClubColors()
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

      return teamRows.length > 0 ? [clubRow, ...teamRows] : []
    },
    [t, teamsForActiveClub],
  )

  const fetchPrefs = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<NotificationPreference[]>(
        `/clubs/${clubId}/notification-preferences`,
      )
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
    (
      current: LocalPref[],
      index: number,
      updater: (pref: LocalPref) => LocalPref,
    ) => {
      const target = current[index]
      if (!target) return current

      const updatedTarget = updater(target)

      if (target.teamId !== null) {
        return current.map((pref, prefIndex) =>
          prefIndex === index ? updatedTarget : pref,
        )
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
    <View style={styles.container}>
      <ModalHeader title={t('notificationSettings.title')} mode="back" />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.descriptionCard}>
          <Text style={styles.description}>
            {t('notificationSettings.description')}
          </Text>
          <Text style={styles.descriptionHint}>
            {t('notificationSettings.quietHoursHint')}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: space.xl }} />
        ) : (
          prefs.map((pref, index) => (
            <View key={pref.teamId ?? 'club'} style={styles.prefCard}>
              <View style={styles.prefHeader}>
                <View style={styles.prefHeaderCopy}>
                  <Text style={styles.prefTeamName}>{pref.teamName}</Text>
                  {pref.teamId === null ? (
                    <Text style={styles.prefHelperText}>
                      {t('notificationSettings.bulkHint')}
                    </Text>
                  ) : null}
                </View>
                {pref.teamId === null ? (
                  <View
                    style={[
                      styles.defaultBadge,
                      { backgroundColor: theme.clubPrimaryLight },
                    ]}
                  >
                    <Text
                      style={[
                        styles.defaultBadgeText,
                        { color: theme.clubPrimary },
                      ]}
                    >
                      {t('notificationSettings.defaultBadge')}
                    </Text>
                  </View>
                ) : null}
              </View>

              <ToggleRow
                label={t('notificationSettings.muteChat')}
                icon="chatbubble-outline"
                value={pref.mutedChat}
                onToggle={() => handleToggle(index, 'mutedChat')}
                color={theme.clubPrimary}
              />
              <ToggleRow
                label={t('notificationSettings.muteEvents')}
                icon="calendar-outline"
                value={pref.mutedEvents}
                onToggle={() => handleToggle(index, 'mutedEvents')}
                color={theme.clubPrimary}
              />
              <ToggleRow
                label={t('notificationSettings.muteAnnouncements')}
                icon="megaphone-outline"
                value={pref.mutedAnnouncements}
                onToggle={() => handleToggle(index, 'mutedAnnouncements')}
                color={theme.clubPrimary}
              />

              <View style={styles.quietSection}>
                <Text style={styles.quietLabel}>
                  {t('notificationSettings.quietHours')}
                </Text>
                <View style={styles.quietRow}>
                  <TextInput
                    style={styles.timeInput}
                    placeholder="22:00"
                    placeholderTextColor={neutralColors.textTertiary}
                    value={pref.quietStart}
                    onChangeText={(v) => handleQuietHour(index, 'quietStart', v)}
                    onBlur={() => handleQuietHourBlur(index)}
                    maxLength={5}
                    keyboardType="numbers-and-punctuation"
                  />
                  <Text style={styles.quietDash}>–</Text>
                  <TextInput
                    style={styles.timeInput}
                    placeholder="07:00"
                    placeholderTextColor={neutralColors.textTertiary}
                    value={pref.quietEnd}
                    onChangeText={(v) => handleQuietHour(index, 'quietEnd', v)}
                    onBlur={() => handleQuietHourBlur(index)}
                    maxLength={5}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
            </View>
          ))
        )}

        {saving && (
          <View style={styles.savingOverlay}>
            <ActivityIndicator size="small" color={theme.clubPrimary} />
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function ToggleRow({
  label,
  icon,
  value,
  onToggle,
  color,
}: {
  label: string
  icon: any
  value: boolean
  onToggle: () => void
  color: string
}) {
  return (
    <View style={styles.toggleRow}>
      <Ionicons name={icon} size={18} color={neutralColors.textSecondary} />
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: neutralColors.border, true: `${color}80` }}
        thumbColor={value ? color : neutralColors.surface}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: { paddingTop: space.md, paddingBottom: 100 },
  descriptionCard: {
    marginHorizontal: space.md,
    marginBottom: space.md,
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.md,
    gap: space.xs,
  },
  description: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
    lineHeight: 20,
  },
  descriptionHint: {
    fontSize: fontSize.xs,
    lineHeight: 18,
    color: neutralColors.textTertiary,
  },
  prefCard: {
    marginHorizontal: space.md,
    marginBottom: space.md,
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.md,
  },
  prefHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: space.sm,
  },
  prefHeaderCopy: {
    flex: 1,
    gap: 2,
    paddingRight: space.sm,
  },
  prefTeamName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  prefHelperText: {
    fontSize: fontSize.xs,
    lineHeight: 18,
    color: neutralColors.textSecondary,
  },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadgeText: {
    fontSize: fontSize['2xs'],
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
  },
  toggleLabel: {
    flex: 1,
    marginLeft: space.sm,
    fontSize: fontSize.sm,
    color: neutralColors.textPrimary,
  },
  quietSection: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: neutralColors.border,
  },
  quietLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    marginBottom: space.xs,
  },
  quietRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  timeInput: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    paddingHorizontal: space.sm,
    fontSize: fontSize.sm,
    color: neutralColors.textPrimary,
    textAlign: 'center',
    backgroundColor: neutralColors.background,
  },
  quietDash: {
    fontSize: fontSize.md,
    color: neutralColors.textTertiary,
  },
  savingOverlay: {
    position: 'absolute',
    top: 70,
    right: space.md,
  },
})
