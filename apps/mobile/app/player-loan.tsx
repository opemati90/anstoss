import { useCallback, useEffect, useState } from 'react'
import { View, TextInput, StyleSheet, Pressable, Alert } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { ErrorState } from '../src/components/ErrorState'
import { Screen, Button, Text, Icon } from '../src/components/ui'
import { radius, space, fontSize, fonts, hairline } from '../src/theme/tokens'
import { formatGermanDateInput, parseGermanDateInput } from '../src/utils/germanDate'

type TeamOption = { id: string; name: string }
type PlayerOption = { userId: string; name: string }

export default function PlayerLoanScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId } = useAuth()
  const c = useClubColors()
  const params = useLocalSearchParams<{ teamId?: string }>()
  const sourceTeamId = params.teamId || activeTeamId

  const [players, setPlayers] = useState<PlayerOption[]>([])
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const [loanEndDate, setLoanEndDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const clubId = activeClub?.club.id

  const fetchData = useCallback(async () => {
    if (!clubId || !sourceTeamId) return
    try {
      const [membersData, groupsData] = await Promise.all([
        api<{ userId: string; name: string }[]>(`/clubs/${clubId}/members?teamId=${sourceTeamId}`),
        api<{ teams: { id: string; name: string }[] }[]>(`/clubs/${clubId}/team-groups`),
      ])
      setPlayers((membersData || []).map((m) => ({ userId: m.userId, name: m.name })))
      const allTeams = (groupsData || []).flatMap((g) => g.teams || [])
      setTeams(allTeams.filter((t) => t.id !== sourceTeamId))
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [clubId, sourceTeamId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSubmit = async () => {
    if (!selectedPlayer || !selectedTeam || !clubId || !sourceTeamId) return

    const parsedLoanEndDate = loanEndDate.trim() ? parseGermanDateInput(loanEndDate) : null

    if (loanEndDate.trim() && !parsedLoanEndDate) {
      Alert.alert(t('common.error'), t('event.dateRequiredBody'))
      return
    }

    setSubmitting(true)
    try {
      await api(`/clubs/${clubId}/teams/${sourceTeamId}/loans`, {
        method: 'POST',
        body: {
          playerUserId: selectedPlayer,
          targetTeamId: selectedTeam,
          loanEndDate: parsedLoanEndDate?.iso || undefined,
        },
      })
      Alert.alert(t('loans.success'))
      router.back()
    } catch (err) {
      Alert.alert(
        t('errors.server'),
        err instanceof Error ? err.message : t('errors.server'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <Screen header={<ModalHeader title={t('loans.title')} />} padded={false}>
        <ErrorState onRetry={fetchData} />
      </Screen>
    )
  }

  return (
    <Screen header={<ModalHeader title={t('loans.title')} />} scroll padded>
      <Text style={[styles.label, { color: c.textSecondary }]}>{t('loans.selectPlayer')}</Text>
      <View style={styles.optionList}>
        {players.map((p) => (
          <Pressable
            key={p.userId}
            style={[
              styles.option,
              { borderColor: c.border, backgroundColor: c.surface },
              selectedPlayer === p.userId && {
                borderColor: c.primary,
                backgroundColor: c.primary + '10',
              },
            ]}
            onPress={() => setSelectedPlayer(p.userId)}
            accessibilityRole="button"
            accessibilityLabel={p.name}
          >
            <Text numberOfLines={2} style={[styles.optionText, { color: c.textPrimary }]}>
              {p.name}
            </Text>
            {selectedPlayer === p.userId && (
              <Icon name="checkmark" size="md" color={c.primary} />
            )}
          </Pressable>
        ))}
      </View>

      <Text style={[styles.label, { color: c.textSecondary }]}>{t('loans.selectTargetTeam')}</Text>
      <View style={styles.optionList}>
        {teams.map((team) => (
          <Pressable
            key={team.id}
            style={[
              styles.option,
              { borderColor: c.border, backgroundColor: c.surface },
              selectedTeam === team.id && {
                borderColor: c.primary,
                backgroundColor: c.primary + '10',
              },
            ]}
            onPress={() => setSelectedTeam(team.id)}
            accessibilityRole="button"
            accessibilityLabel={team.name}
          >
            <Text numberOfLines={2} style={[styles.optionText, { color: c.textPrimary }]}>
              {team.name}
            </Text>
            {selectedTeam === team.id && <Icon name="checkmark" size="md" color={c.primary} />}
          </Pressable>
        ))}
      </View>

      <Text style={[styles.label, { color: c.textSecondary }]}>{t('loans.endDate')}</Text>
      <TextInput
        style={[
          styles.dateInput,
          { borderColor: c.border, backgroundColor: c.surface, color: c.textPrimary },
        ]}
        placeholder={t('loans.datePlaceholder')}
        placeholderTextColor={c.textTertiary}
        value={loanEndDate}
        onChangeText={(value) => setLoanEndDate(formatGermanDateInput(value))}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />

      <View style={styles.submitWrapper}>
        <Button
          label={t('loans.submit')}
          variant="filled"
          size="lg"
          fullWidth
          loading={submitting}
          disabled={!selectedPlayer || !selectedTeam || submitting}
          onPress={handleSubmit}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  label: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
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
    minHeight: 56,
    padding: space.md + 2,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  optionText: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    flex: 1,
    flexShrink: 1,
    paddingRight: space.sm,
  },
  dateInput: {
    minHeight: 52,
    borderWidth: hairline,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    justifyContent: 'center',
  },
  submitWrapper: {
    marginTop: space.xl,
  },
})
