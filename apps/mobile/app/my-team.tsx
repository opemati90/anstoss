import { useCallback, useEffect, useState } from 'react'
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { Screen, Text} from '../src/components/ui'
import { space, fontSize, radius, fonts ,
  hairline} from '../src/theme/tokens'

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
  const c = useClubColors()
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
      <Screen header={<ModalHeader title={t('myTeam.title')} mode="back" />} padded={false}>
        <ErrorState onRetry={fetchMembers} />
      </Screen>
    )
  }

  if (!loading && members.length === 0) {
    return (
      <Screen header={<ModalHeader title={t('myTeam.title')} mode="back" />} padded={false}>
        <EmptyState
          icon="person.2"
          title={t('myTeam.empty')}
          description={t('myTeam.emptyDescription')}
        />
      </Screen>
    )
  }

  return (
    <Screen header={<ModalHeader title={t('myTeam.title')} mode="back" />} padded={false}>
      {teamName ? (
        <View
          style={[
            styles.teamHeader,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
            },
          ]}
        >
          <Text style={[styles.teamName, { color: c.textPrimary }]}>{teamName}</Text>
          <Text style={[styles.memberCount, { color: c.textSecondary }]}>
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
          <View
            style={[
              styles.memberRow,
              { borderColor: c.border, backgroundColor: c.surface },
            ]}
          >
            <View style={[styles.avatar, { backgroundColor: c.primary50 }]}>
              <Text style={[styles.avatarText, { color: c.primary }]}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.memberInfo}>
              <Text style={[styles.memberName, { color: c.textPrimary }]}>{item.name}</Text>
              {item.position ? (
                <Text style={[styles.memberMeta, { color: c.textSecondary }]}>{item.position}</Text>
              ) : null}
            </View>
            {item.jerseyNumber != null ? (
              <View style={[styles.jerseyBadge, { borderColor: c.primary }]}>
                <Text style={[styles.jerseyNumber, { color: c.primary }]}>
                  {item.jerseyNumber}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  teamHeader: {
    marginHorizontal: space.md,
    marginBottom: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  teamName: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
  },
  memberCount: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    marginTop: space['2xs'],
  },
  list: {
    paddingHorizontal: space.md,
    paddingBottom: space['2xl'],
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    marginBottom: space.sm,
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
    fontFamily: fonts.heading,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  memberMeta: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    marginTop: space['2xs'],
  },
  jerseyBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    borderWidth: hairline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  jerseyNumber: {
    fontSize: fontSize.sm,
    fontFamily: fonts.data,
  },
})
