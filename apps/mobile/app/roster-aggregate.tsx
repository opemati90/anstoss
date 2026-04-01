import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  View,
  Text,
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
import { fonts, neutralColors, radius, space, fontSize, fontWeight, semanticColors } from '../src/theme/tokens'

type RosterSection = {
  title: string
  data: EnhancedRosterMember[]
}

export default function RosterAggregateScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const theme = useClubColors()
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
    <View style={styles.memberRow}>
      {item.jerseyNumber != null && (
        <Text style={styles.jerseyNumber}>{item.jerseyNumber}</Text>
      )}
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{item.name}</Text>
        <Text style={styles.memberDetail}>
          {item.position || t('roster.noPosition')}
          {item.loanedFromTeamName ? ` · ${t('loans.badge')}` : ''}
        </Text>
      </View>
      {item.loanedFromTeamId && (
        <View style={[styles.loanBadge, { backgroundColor: semanticColors.warning + '15' }]}>
          <Text style={[styles.loanBadgeText, { color: semanticColors.warning }]}>
            {t('loans.badge')}
          </Text>
        </View>
      )}
    </View>
  )

  const renderSectionHeader = ({ section }: { section: RosterSection }) => (
    <View style={[styles.sectionHeader, { backgroundColor: theme.clubPrimary + '10' }]}>
      <Text style={[styles.sectionTitle, { color: theme.clubPrimary }]}>
        {section.title}
      </Text>
      <Text style={styles.sectionCount}>{section.data.length}</Text>
    </View>
  )

  return (
    <View style={styles.container}>
      <ModalHeader title={t('roster.aggregateTitle')} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.clubPrimary} />
        </View>
      ) : error ? (
        <ErrorState onRetry={fetchRoster} />
      ) : (
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
              <Text style={styles.emptyText}>{t('roster.aggregateEmpty')}</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  heading: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    padding: space.md,
  },
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
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
  },
  sectionCount: {
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
    color: neutralColors.textSecondary,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: neutralColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
  },
  jerseyNumber: {
    width: 32,
    fontSize: fontSize.sm,
    fontFamily: fonts.data,
    fontWeight: fontWeight.bold,
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
  memberInfo: {
    flex: 1,
    marginLeft: space.sm,
  },
  memberName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  memberDetail: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  loanBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space['2xs'],
    borderRadius: radius.sm,
  },
  loanBadgeText: {
    fontSize: fontSize['2xs'],
    fontWeight: fontWeight.bold,
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
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
})
