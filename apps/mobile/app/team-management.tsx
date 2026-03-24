import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { TeamGroupType } from '@anstoss/shared'
import { api } from '../src/api/client'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { neutralColors } from '../src/theme/tokens'

type TeamResponse = {
  id: string
  displayName: string
  squadLabel: string | null
  leagueName: string | null
}

type TeamGroupResponse = {
  id: string
  displayName: string
  type: TeamGroupType
  teams: TeamResponse[]
}

const GROUP_TYPES: Array<{ value: TeamGroupType; labelKey: string }> = [
  { value: TeamGroupType.SENIOR, labelKey: 'teamManagement.groupTypeSenior' },
  { value: TeamGroupType.YOUTH, labelKey: 'teamManagement.groupTypeYouth' },
  { value: TeamGroupType.MINI, labelKey: 'teamManagement.groupTypeMini' },
  { value: TeamGroupType.CUSTOM, labelKey: 'teamManagement.groupTypeCustom' },
]

export default function TeamManagementScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const theme = useClubColors()
  const [groups, setGroups] = useState<TeamGroupResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmittingGroup, setIsSubmittingGroup] = useState(false)
  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false)

  const [groupName, setGroupName] = useState('')
  const [groupType, setGroupType] = useState<TeamGroupType>(TeamGroupType.SENIOR)

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [teamName, setTeamName] = useState('')
  const [squadLabel, setSquadLabel] = useState('')
  const [leagueName, setLeagueName] = useState('')

  const loadGroups = async () => {
    if (!activeClub) return

    try {
      const data = await api<TeamGroupResponse[]>(
        `/clubs/${activeClub.club.id}/team-groups`,
      )
      setGroups(data || [])
      if (!selectedGroupId) {
        setSelectedGroupId(data?.[0]?.id || null)
      }
    } catch {
      Alert.alert(t('common.error'), t('teamManagement.loadError'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadGroups()
  }, [activeClub])

  const handleCreateGroup = async () => {
    if (!activeClub || !groupName.trim()) {
      Alert.alert(t('teamManagement.groupNameRequiredTitle'), t('teamManagement.groupNameRequiredBody'))
      return
    }

    setIsSubmittingGroup(true)
    try {
      await api(`/clubs/${activeClub.club.id}/team-groups`, {
        method: 'POST',
        body: {
          displayName: groupName.trim(),
          type: groupType,
        },
      })
      setGroupName('')
      await loadGroups()
    } catch {
      Alert.alert(t('common.error'), t('teamManagement.groupCreateError'))
    } finally {
      setIsSubmittingGroup(false)
    }
  }

  const handleCreateTeam = async () => {
    if (!activeClub || !selectedGroupId || !teamName.trim()) {
      Alert.alert(t('teamManagement.teamNameRequiredTitle'), t('teamManagement.teamNameRequiredBody'))
      return
    }

    setIsSubmittingTeam(true)
    try {
      await api(`/clubs/${activeClub.club.id}/team-groups/${selectedGroupId}/teams`, {
        method: 'POST',
        body: {
          name: teamName.trim(),
          squadLabel: squadLabel.trim() || undefined,
          leagueName: leagueName.trim() || undefined,
        },
      })
      setTeamName('')
      setSquadLabel('')
      setLeagueName('')
      await loadGroups()
    } catch {
      Alert.alert(t('common.error'), t('teamManagement.teamCreateError'))
    } finally {
      setIsSubmittingTeam(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={neutralColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('teamManagement.screenTitle')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.title}>{t('teamManagement.title')}</Text>
      <Text style={styles.subtitle}>
        {t('teamManagement.subtitle', { clubName: activeClub?.club.name || 'Anstoss' })}
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('teamManagement.structureLabel')}</Text>
        {isLoading ? (
          <ActivityIndicator color={theme.clubPrimary} />
        ) : (
          <View style={styles.listCard}>
            {groups.map((group) => (
              <View key={group.id} style={styles.groupRow}>
                <Text style={styles.groupTitle}>{group.displayName}</Text>
                <Text style={styles.groupMeta}>
                  {group.teams.length === 0
                    ? t('teamManagement.noTeamsInGroup')
                    : group.teams
                        .map((team) =>
                          team.leagueName
                            ? `${team.displayName} (${team.leagueName})`
                            : team.displayName,
                        )
                        .join(' · ')}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('teamManagement.addGroupLabel')}</Text>
        <View style={styles.formCard}>
          <TextInput
            style={styles.input}
            value={groupName}
            onChangeText={setGroupName}
            placeholder={t('teamManagement.groupNamePlaceholder')}
            placeholderTextColor={neutralColors.textTertiary}
          />
          <View style={styles.chipRow}>
            {GROUP_TYPES.map((option) => {
              const isActive = option.value === groupType
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.chip,
                    isActive && {
                      borderColor: theme.clubPrimary,
                      backgroundColor: theme.clubPrimaryLight,
                    },
                  ]}
                  onPress={() => setGroupType(option.value)}
                >
                  <Text style={styles.chipText}>{t(option.labelKey)}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.clubPrimary }]}
            onPress={() => void handleCreateGroup()}
            disabled={isSubmittingGroup}
          >
            {isSubmittingGroup ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.primaryButtonText}>{t('teamManagement.addGroupCta')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('teamManagement.addTeamLabel')}</Text>
        <View style={styles.formCard}>
          <View style={styles.chipRow}>
            {groups.map((group) => {
              const isActive = group.id === selectedGroupId
              return (
                <TouchableOpacity
                  key={group.id}
                  style={[
                    styles.chip,
                    isActive && {
                      borderColor: theme.clubPrimary,
                      backgroundColor: theme.clubPrimaryLight,
                    },
                  ]}
                  onPress={() => setSelectedGroupId(group.id)}
                >
                  <Text style={styles.chipText}>{group.displayName}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <TextInput
            style={styles.input}
            value={teamName}
            onChangeText={setTeamName}
            placeholder={t('teamManagement.teamNamePlaceholder')}
            placeholderTextColor={neutralColors.textTertiary}
          />
          <TextInput
            style={[styles.input, styles.spacedInput]}
            value={squadLabel}
            onChangeText={setSquadLabel}
            placeholder={t('teamManagement.squadLabelPlaceholder')}
            placeholderTextColor={neutralColors.textTertiary}
          />
          <TextInput
            style={[styles.input, styles.spacedInput]}
            value={leagueName}
            onChangeText={setLeagueName}
            placeholder={t('teamManagement.leaguePlaceholder')}
            placeholderTextColor={neutralColors.textTertiary}
          />
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.clubPrimary }]}
            onPress={() => void handleCreateTeam()}
            disabled={isSubmittingTeam}
          >
            {isSubmittingTeam ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.primaryButtonText}>{t('teamManagement.addTeamCta')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 100 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: neutralColors.textPrimary },
  headerSpacer: { width: 28 },
  title: { fontSize: 28, fontWeight: '700', color: neutralColors.textPrimary },
  subtitle: {
    marginTop: 8,
    marginBottom: 28,
    fontSize: 15,
    lineHeight: 22,
    color: neutralColors.textSecondary,
  },
  section: { marginBottom: 24 },
  sectionLabel: {
    marginBottom: 10,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  listCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 12,
    backgroundColor: neutralColors.surface,
    padding: 16,
    gap: 14,
  },
  groupRow: { gap: 4 },
  groupTitle: { fontSize: 16, fontWeight: '600', color: neutralColors.textPrimary },
  groupMeta: { fontSize: 14, lineHeight: 20, color: neutralColors.textSecondary },
  formCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 12,
    backgroundColor: neutralColors.surface,
    padding: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: neutralColors.textPrimary,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 8,
    backgroundColor: neutralColors.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: neutralColors.textPrimary,
  },
  spacedInput: { marginTop: 10 },
  primaryButton: {
    marginTop: 14,
    height: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: neutralColors.textInverse,
  },
})
