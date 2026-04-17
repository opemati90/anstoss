import { useCallback, useEffect, useState } from 'react'
import {
  View,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NotificationPreference } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
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

      return teamRows.length > 0 ? [clubRow, ...teamRows] : []
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View
          style={[styles.descriptionCard, { backgroundColor: c.surface, borderColor: c.border }]}
        >
          <Text style={[styles.description, { color: c.textSecondary }]}>
            {t('notificationSettings.description')}
          </Text>
          <Text style={[styles.descriptionHint, { color: c.textTertiary }]}>
            {t('notificationSettings.quietHoursHint')}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: space.xl }} />
        ) : (
          prefs.map((pref, index) => (
            <View
              key={pref.teamId ?? 'club'}
              style={[styles.prefCard, { backgroundColor: c.surface, borderColor: c.border }]}
            >
              <View style={styles.prefHeader}>
                <View style={styles.prefHeaderCopy}>
                  <Text style={[styles.prefTeamName, { color: c.textPrimary }]}>
                    {pref.teamName}
                  </Text>
                  {pref.teamId === null ? (
                    <Text style={[styles.prefHelperText, { color: c.textSecondary }]}>
                      {t('notificationSettings.bulkHint')}
                    </Text>
                  ) : null}
                </View>
                {pref.teamId === null ? (
                  <View style={[styles.defaultBadge, { backgroundColor: c.clubPrimaryLight }]}>
                    <Text style={[styles.defaultBadgeText, { color: c.clubPrimary }]}>
                      {t('notificationSettings.defaultBadge')}
                    </Text>
                  </View>
                ) : null}
              </View>

              <ToggleRow
                label={t('notificationSettings.muteChat')}
                icon="message"
                value={pref.mutedChat}
                onToggle={() => handleToggle(index, 'mutedChat')}
                color={c.clubPrimary}
              />
              <ToggleRow
                label={t('notificationSettings.muteEvents')}
                icon="calendar"
                value={pref.mutedEvents}
                onToggle={() => handleToggle(index, 'mutedEvents')}
                color={c.clubPrimary}
              />
              <ToggleRow
                label={t('notificationSettings.muteAnnouncements')}
                icon="megaphone"
                value={pref.mutedAnnouncements}
                onToggle={() => handleToggle(index, 'mutedAnnouncements')}
                color={c.clubPrimary}
              />

              <QuietHoursSection
                pref={pref}
                index={index}
                onChangeHour={handleQuietHour}
                onBlur={handleQuietHourBlur}
              />
            </View>
          ))
        )}

        {saving && (
          <View style={styles.savingOverlay}>
            <ActivityIndicator size="small" color={c.clubPrimary} />
          </View>
        )}
      </ScrollView>
    </Screen>
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
  icon: IconName
  value: boolean
  onToggle: () => void
  color: string
}) {
  const c = useClubColors()
  return (
    <View style={[styles.toggleRow, { borderBottomColor: c.border }]}>
      <Icon name={icon} size="md" color="secondary" />
      <Text style={[styles.toggleLabel, { color: c.textPrimary }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: c.border, true: `${color}80` }}
        thumbColor={value ? color : c.surface}
      />
    </View>
  )
}

function QuietHoursSection({
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
    <View style={styles.quietSection}>
      <Text style={[styles.quietLabel, { color: c.textPrimary }]}>
        {t('notificationSettings.quietHours')}
      </Text>
      <View style={styles.quietRow}>
        <TextInput
          style={[
            styles.timeInput,
            { borderColor: c.border, color: c.textPrimary, backgroundColor: c.background },
          ]}
          placeholder="22:00"
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
            { borderColor: c.border, color: c.textPrimary, backgroundColor: c.background },
          ]}
          placeholder="07:00"
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
  content: { paddingTop: space.md, paddingBottom: space.lg },
  descriptionCard: {
    marginHorizontal: space.md,
    marginBottom: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    padding: space.md,
    gap: space.xs,
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
  prefCard: {
    marginHorizontal: space.md,
    marginBottom: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    padding: space.md,
  },
  prefHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: space.sm,
  },
  prefHeaderCopy: {
    flex: 1,
    gap: space['2xs'],
    paddingRight: space.sm,
  },
  prefTeamName: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  prefHelperText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  defaultBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space['2xs'],
    borderRadius: radius.full,
  },
  defaultBadgeText: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: space.sm,
    borderBottomWidth: hairline,
  },
  toggleLabel: {
    flex: 1,
    marginLeft: space.sm,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  quietSection: {
    marginTop: space.sm,
    paddingTop: space.sm,
  },
  quietLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
    marginBottom: space.xs,
  },
  quietRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  timeInput: {
    flex: 1,
    height: 44,
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
