import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { neutralColors, radius, space, fontSize, fontWeight } from '../src/theme/tokens'

type TeamOption = { id: string; name: string }
type PlayerOption = { userId: string; name: string }

export default function PlayerLoanScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId } = useAuth()
  const theme = useClubColors()
  const params = useLocalSearchParams<{ teamId?: string }>()
  const sourceTeamId = params.teamId || activeTeamId

  const [players, setPlayers] = useState<PlayerOption[]>([])
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const [loanEndDate, setLoanEndDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const clubId = activeClub?.club.id

  const fetchData = useCallback(async () => {
    if (!clubId || !sourceTeamId) return
    try {
      const [membersData, groupsData] = await Promise.all([
        api<{ userId: string; name: string }[]>(
          `/clubs/${clubId}/members?teamId=${sourceTeamId}`,
        ),
        api<{ teams: { id: string; name: string }[] }[]>(
          `/clubs/${clubId}/team-groups`,
        ),
      ])
      setPlayers(
        (membersData || []).map((m) => ({ userId: m.userId, name: m.name })),
      )
      const allTeams = (groupsData || []).flatMap((g) => g.teams || [])
      setTeams(allTeams.filter((t) => t.id !== sourceTeamId))
    } catch {
      // silent
    }
  }, [clubId, sourceTeamId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSubmit = async () => {
    if (!selectedPlayer || !selectedTeam || !clubId || !sourceTeamId) return
    setSubmitting(true)
    try {
      await api(`/clubs/${clubId}/teams/${sourceTeamId}/loans`, {
        method: 'POST',
        body: { playerUserId: selectedPlayer, targetTeamId: selectedTeam, loanEndDate: loanEndDate || undefined },
      })
      Alert.alert(t('loans.success'))
      router.back()
    } catch (err: any) {
      Alert.alert(t('errors.server'), err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>{t('loans.title')}</Text>

      <Text style={styles.label}>{t('loans.selectPlayer')}</Text>
      <View style={styles.optionList}>
        {players.map((p) => (
          <TouchableOpacity
            key={p.userId}
            style={[
              styles.option,
              selectedPlayer === p.userId && {
                borderColor: theme.clubPrimary,
                backgroundColor: theme.clubPrimary + '10',
              },
            ]}
            onPress={() => setSelectedPlayer(p.userId)}
          >
            <Text numberOfLines={2} style={styles.optionText}>
              {p.name}
            </Text>
            {selectedPlayer === p.userId && (
              <Ionicons name="checkmark" size={18} color={theme.clubPrimary} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{t('loans.selectTargetTeam')}</Text>
      <View style={styles.optionList}>
        {teams.map((team) => (
          <TouchableOpacity
            key={team.id}
            style={[
              styles.option,
              selectedTeam === team.id && {
                borderColor: theme.clubPrimary,
                backgroundColor: theme.clubPrimary + '10',
              },
            ]}
            onPress={() => setSelectedTeam(team.id)}
          >
            <Text numberOfLines={2} style={styles.optionText}>
              {team.name}
            </Text>
            {selectedTeam === team.id && (
              <Ionicons name="checkmark" size={18} color={theme.clubPrimary} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{t('loans.endDate')}</Text>
      <TextInput
        style={styles.dateInput}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={neutralColors.textTertiary}
        value={loanEndDate}
        onChangeText={setLoanEndDate}
        autoCapitalize="none"
      />

      <TouchableOpacity
        style={[
          styles.submitButton,
          { backgroundColor: theme.clubPrimary },
          (!selectedPlayer || !selectedTeam || submitting) && styles.disabled,
        ]}
        onPress={handleSubmit}
        disabled={!selectedPlayer || !selectedTeam || submitting}
      >
        <Text style={styles.submitText}>{t('loans.submit')}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
    padding: space.md,
  },
  heading: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    marginBottom: space.lg,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: neutralColors.textSecondary,
    marginBottom: space.sm,
    marginTop: space.md,
  },
  optionList: {
    gap: space.sm,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  optionText: {
    fontSize: fontSize.md,
    color: neutralColors.textPrimary,
    flex: 1,
    flexShrink: 1,
    paddingRight: space.sm,
  },
  submitButton: {
    marginTop: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  submitText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textInverse,
  },
  dateInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    backgroundColor: neutralColors.surface,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    color: neutralColors.textPrimary,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
})
