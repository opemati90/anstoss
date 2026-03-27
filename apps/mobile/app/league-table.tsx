import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
} from 'react-native'
import type { ImportedFixture, TableSnapshotRow } from '@anstoss/shared'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { neutralColors, semanticColors, fontSize, fontWeight, space, radius } from '../src/theme/tokens'

export default function LeagueTableScreen() {
  const { t } = useTranslation()
  const { activeTeamAccess } = useAuth()
  const theme = useClubColors()
  const { teamId } = useLocalSearchParams<{ teamId: string }>()

  const [table, setTable] = useState<TableSnapshotRow[]>([])
  const [competition, setCompetition] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const teamLabel = activeTeamAccess?.team.displayName || ''

  const fetchTable = useCallback(async () => {
    if (!teamId) return
    try {
      const fixtures = await api<ImportedFixture[]>(
        `/teams/${teamId}/fixtures?scope=recent&limit=10`,
      )
      const withTable = fixtures?.find(
        (f) => f.tableSnapshot && (f.tableSnapshot as unknown[]).length > 0,
      )
      if (withTable) {
        setTable(withTable.tableSnapshot as TableSnapshotRow[])
        setCompetition(withTable.competition)
      }
    } catch {
      // stale-while-revalidate
    }
  }, [teamId])

  useEffect(() => {
    void fetchTable()
  }, [fetchTable])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchTable()
    setRefreshing(false)
  }

  const isOwnTeam = (row: TableSnapshotRow) =>
    teamLabel.length > 3 &&
    row.team.toLowerCase().includes(teamLabel.toLowerCase().slice(0, 6))

  return (
    <View style={styles.container}>
      <ModalHeader title={t('matches.leagueTable')} />

      {competition ? (
        <Text style={styles.competition}>{competition}</Text>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.placeCol]}>#</Text>
          <Text style={[styles.headerCell, styles.teamCol]}>{t('matches.colTeam')}</Text>
          <Text style={[styles.headerCell, styles.numCol]}>{t('matches.colP')}</Text>
          <Text style={[styles.headerCell, styles.numCol]}>{t('matches.colW')}</Text>
          <Text style={[styles.headerCell, styles.numCol]}>{t('matches.colD')}</Text>
          <Text style={[styles.headerCell, styles.numCol]}>{t('matches.colL')}</Text>
          <Text style={[styles.headerCell, styles.gdCol]}>{t('matches.colGD')}</Text>
          <Text style={[styles.headerCell, styles.ptsCol]}>{t('matches.colPts')}</Text>
        </View>

        {table.map((row, index) => {
          const own = isOwnTeam(row)
          return (
            <View
              key={`${row.place}-${index}`}
              style={[
                styles.tableRow,
                own && { backgroundColor: `${theme.clubPrimary}12` },
                row.isPromotion && styles.promotionRow,
                row.isRelegation && styles.relegationRow,
              ]}
            >
              <Text style={[styles.cell, styles.placeCol, own && { fontWeight: fontWeight.bold }]}>
                {row.place}
              </Text>
              <View style={[styles.teamCol, styles.teamCell]}>
                {row.img ? (
                  <Image source={{ uri: row.img }} style={styles.rowLogo} />
                ) : null}
                <Text
                  style={[styles.cell, styles.teamText, own && { fontWeight: fontWeight.bold, color: theme.clubPrimary }]}
                  numberOfLines={1}
                >
                  {row.team}
                </Text>
              </View>
              <Text style={[styles.cell, styles.numCol]}>{row.games}</Text>
              <Text style={[styles.cell, styles.numCol]}>{row.won}</Text>
              <Text style={[styles.cell, styles.numCol]}>{row.draw}</Text>
              <Text style={[styles.cell, styles.numCol]}>{row.lost}</Text>
              <Text style={[styles.cell, styles.gdCol]}>
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </Text>
              <Text style={[styles.cell, styles.ptsCol, own && { color: theme.clubPrimary }]}>
                {row.points}
              </Text>
            </View>
          )
        })}

        {/* Legend */}
        {table.some((r) => r.isPromotion || r.isRelegation) && (
          <View style={styles.legend}>
            {table.some((r) => r.isPromotion) && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: semanticColors.success }]} />
                <Text style={styles.legendText}>{t('matches.promotion')}</Text>
              </View>
            )}
            {table.some((r) => r.isRelegation) && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: semanticColors.error }]} />
                <Text style={styles.legendText}>{t('matches.relegation')}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: { paddingHorizontal: space.sm, paddingBottom: 40 },
  competition: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
  },
  headerCell: {
    fontSize: fontSize['2xs'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: neutralColors.border,
  },
  promotionRow: {
    borderLeftWidth: 3,
    borderLeftColor: semanticColors.success,
  },
  relegationRow: {
    borderLeftWidth: 3,
    borderLeftColor: semanticColors.error,
  },
  cell: {
    fontSize: fontSize.xs,
    color: neutralColors.textPrimary,
    textAlign: 'center',
  },
  placeCol: { width: 28 },
  teamCol: { flex: 1 },
  teamCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  teamText: {
    flex: 1,
    textAlign: 'left',
    fontSize: fontSize.xs,
    color: neutralColors.textPrimary,
  },
  rowLogo: {
    width: 18,
    height: 18,
    borderRadius: 3,
  },
  numCol: { width: 26 },
  gdCol: { width: 32 },
  ptsCol: {
    width: 30,
    fontWeight: fontWeight.bold,
  },
  legend: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.sm,
    paddingTop: space.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: fontSize.xs,
    color: neutralColors.textSecondary,
  },
})
