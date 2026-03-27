import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { NotificationPreference } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
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

export default function NotificationSettingsScreen() {
  const { t } = useTranslation()
  const { activeClub, teamsForActiveClub } = useAuth()
  const theme = useClubColors()
  const [prefs, setPrefs] = useState<LocalPref[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const clubId = activeClub?.club.id

  const fetchPrefs = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<NotificationPreference[]>(
        `/clubs/${clubId}/notification-preferences`,
      )
      // Build local state: one entry per team + one club-wide entry
      const teamRows: LocalPref[] = teamsForActiveClub.map((tm) => {
        const existing = (data || []).find((p) => p.teamId === tm.team.id)
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
      // Club-wide default (teamId=null)
      const clubWide = (data || []).find((p) => !p.teamId)
      const clubRow: LocalPref = {
        teamId: null,
        teamName: t('notificationSettings.clubWide'),
        mutedChat: clubWide?.mutedChat ?? false,
        mutedEvents: clubWide?.mutedEvents ?? false,
        mutedAnnouncements: clubWide?.mutedAnnouncements ?? false,
        quietStart: clubWide?.quietStart ?? '',
        quietEnd: clubWide?.quietEnd ?? '',
      }
      setPrefs([clubRow, ...teamRows])
    } catch {
      // stale is ok
    } finally {
      setLoading(false)
    }
  }, [clubId, teamsForActiveClub, t])

  useEffect(() => {
    fetchPrefs()
  }, [fetchPrefs])

  const updatePref = (index: number, field: keyof LocalPref, value: boolean | string) => {
    setPrefs((current) =>
      current.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    )
  }

  const savePref = async (pref: LocalPref) => {
    if (!clubId) return
    setSaving(true)
    try {
      await api(`/clubs/${clubId}/notification-preferences`, {
        method: 'PUT',
        body: {
          teamId: pref.teamId,
          mutedChat: pref.mutedChat,
          mutedEvents: pref.mutedEvents,
          mutedAnnouncements: pref.mutedAnnouncements,
          quietStart: pref.quietStart || null,
          quietEnd: pref.quietEnd || null,
        },
      })
    } catch {
      Alert.alert(t('common.error'), t('errors.server'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = (index: number, field: keyof LocalPref) => {
    const current = prefs[index]
    const newValue = !current[field]
    updatePref(index, field, newValue)
    void savePref({ ...current, [field]: newValue })
  }

  const handleQuietHour = (index: number, field: 'quietStart' | 'quietEnd', value: string) => {
    updatePref(index, field, value)
  }

  const handleQuietHourBlur = (index: number) => {
    void savePref(prefs[index])
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={neutralColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('notificationSettings.title')}</Text>
      </View>

      <Text style={styles.description}>
        {t('notificationSettings.description')}
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: space.xl }} />
      ) : (
        prefs.map((pref, index) => (
          <View key={pref.teamId ?? 'club'} style={styles.prefCard}>
            <View style={styles.prefHeader}>
              <Text style={styles.prefTeamName}>{pref.teamName}</Text>
              {pref.teamId === null && (
                <View style={[styles.defaultBadge, { backgroundColor: theme.clubPrimaryLight }]}>
                  <Text style={[styles.defaultBadgeText, { color: theme.clubPrimary }]}>
                    {t('notificationSettings.defaultBadge')}
                  </Text>
                </View>
              )}
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
  content: { paddingBottom: 100 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  backButton: {
    marginRight: space.sm,
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  description: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
    lineHeight: 20,
    paddingHorizontal: space.md,
    marginBottom: space.md,
  },
  prefCard: {
    marginHorizontal: space.md,
    marginBottom: space.sm,
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.md,
  },
  prefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  prefTeamName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    flex: 1,
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
