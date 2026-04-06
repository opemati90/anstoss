import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { neutralColors, space, fontSize, fontWeight, radius, fonts, TAB_BAR_CLEARANCE } from '../src/theme/tokens'

type TeamMember = {
  userId: string
  name: string
  avatarUrl?: string | null
  position?: string | null
  jerseyNumber?: number | null
  teamRole?: string
}

export default function MyTeamScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const theme = useClubColors()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)

  const clubId = activeClub?.club.id
  const teamName = activeTeamAccess?.team.displayName || activeTeamAccess?.team.name || ''

  const fetchMembers = useCallback(async () => {
    if (!clubId || !activeTeamId) return
    try {
      const data = await api<TeamMember[]>(
        `/clubs/${clubId}/members?teamId=${activeTeamId}`,
      )
      setMembers(data || [])
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [clubId, activeTeamId])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchMembers()
    } finally {
      setRefreshing(false)
    }
  }

  if (!loading && error) {
    return (
      <View style={styles.container}>
        <ModalHeader title={t('myTeam.title')} mode="back" />
        <ErrorState onRetry={fetchMembers} />
      </View>
    )
  }

  if (!loading && members.length === 0) {
    return (
      <View style={styles.container}>
        <ModalHeader title={t('myTeam.title')} mode="back" />
        <EmptyState
          icon="people-outline"
          title={t('myTeam.empty')}
          description={t('myTeam.emptyDescription')}
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ModalHeader title={t('myTeam.title')} mode="back" />

      {teamName ? (
        <View style={styles.teamHeader}>
          <Text style={styles.teamName}>{teamName}</Text>
          <Text style={styles.memberCount}>
            {t('myTeam.memberCount', { count: members.length })}
          </Text>
        </View>
      ) : null}

      <FlatList
        data={members}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <View style={styles.memberRow}>
            <View style={[styles.avatar, { backgroundColor: theme.clubPrimaryLight }]}>
              <Text style={[styles.avatarText, { color: theme.clubPrimary }]}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{item.name}</Text>
              {item.position ? (
                <Text style={styles.memberMeta}>{item.position}</Text>
              ) : null}
            </View>
            {item.jerseyNumber != null ? (
              <View style={[styles.jerseyBadge, { borderColor: theme.clubPrimary }]}>
                <Text style={[styles.jerseyNumber, { color: theme.clubPrimary }]}>
                  {item.jerseyNumber}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  teamHeader: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  teamName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  memberCount: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
    marginTop: space['2xs'],
  },
  list: {
    paddingHorizontal: space.md,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
    gap: space.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  memberMeta: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
    marginTop: space['2xs'],
  },
  jerseyBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  jerseyNumber: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.data,
  },
})
