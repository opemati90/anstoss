import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  View,
  StyleSheet,
  SectionList,
  RefreshControl,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import type { EnhancedRosterMember } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { ErrorState } from '../src/components/ErrorState'
import { Screen, Text} from '../src/components/ui'
import { fonts, radius, space, fontSize ,
  hairline} from '../src/theme/tokens'

type RosterSection = {
  title: string
  data: EnhancedRosterMember[]
}

export default function RosterAggregateScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const [sections, setSections] = useState<RosterSection[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const clubId = activeClub?.club.id

  const fetchRoster = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<Record<string, { teamName: string; teamDisplayName: string | null; groupName: string; members: EnhancedRosterMember[] }>>(
        `/clubs/${clubId}/roster-aggregate`,
      )
      if (data) {
        const result: RosterSection[] = Object.entries(data).map(
          ([_teamId, team]) => ({
            title: team.teamDisplayName || team.teamName,
            data: team.members,
          }),
        )
        setSections(result)
      }
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    fetchRoster()
  }, [fetchRoster])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchRoster()
    } finally {
      setRefreshing(false)
    }
  }

  const renderMember = ({ item }: { item: EnhancedRosterMember }) => (
    <View style={[styles.memberRow, { backgroundColor: c.surface, borderBottomColor: c.borderDefault }]}>
      {item.jerseyNumber != null && (
        <Text style={[styles.jerseyNumber, { color: c.textSecondary }]}>{item.jerseyNumber}</Text>
      )}
      <View style={styles.memberInfo}>
        <Text style={[styles.memberName, { color: c.textPrimary }]}>{item.name}</Text>
        <Text style={[styles.memberDetail, { color: c.textSecondary }]}>
          {item.position || t('roster.noPosition')}
          {item.loanedFromTeamName ? ` · ${t('loans.badge')}` : ''}
        </Text>
      </View>
      {item.loanedFromTeamId && (
        <View style={[styles.loanBadge, { backgroundColor: c.warning + '15' }]}>
          <Text style={[styles.loanBadgeText, { color: c.warning }]}>
            {t('loans.badge')}
          </Text>
        </View>
      )}
    </View>
  )

  const renderSectionHeader = ({ section }: { section: RosterSection }) => (
    <View style={[styles.sectionHeader, { backgroundColor: c.primary + '10' }]}>
      <Text style={[styles.sectionTitle, { color: c.primary }]}>
        {section.title}
      </Text>
      <Text style={[styles.sectionCount, { color: c.textSecondary }]}>{section.data.length}</Text>
    </View>
  )

  if (loading) {
    return (
      <Screen header={<ModalHeader title={t('roster.aggregateTitle')} />} padded={false}>
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} />
        </View>
      </Screen>
    )
  }

  if (error) {
    return (
      <Screen header={<ModalHeader title={t('roster.aggregateTitle')} />} padded={false}>
        <ErrorState onRetry={fetchRoster} />
      </Screen>
    )
  }

  return (
    <Screen header={<ModalHeader title={t('roster.aggregateTitle')} />} padded={false}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.userId}`}
        renderItem={renderMember}
        renderSectionHeader={renderSectionHeader}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={[styles.emptyText, { color: c.textSecondary }]}>{t('roster.aggregateEmpty')}</Text>
          </View>
        }
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: space['2xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.heading,
  },
  sectionCount: {
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: hairline,
  },
  jerseyNumber: {
    width: 32,
    fontSize: fontSize.sm,
    fontFamily: fonts.data,
    textAlign: 'center',
  },
  memberInfo: {
    flex: 1,
    marginLeft: space.sm,
  },
  memberName: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  memberDetail: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
  },
  loanBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space['2xs'],
    borderRadius: radius.sm,
  },
  loanBadgeText: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.heading,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  emptyText: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    textAlign: 'center',
  },
})
