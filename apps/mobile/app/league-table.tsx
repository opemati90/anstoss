import { useCallback, useEffect, useState } from 'react'
import {
  View,
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
import { Screen, Text } from '../src/components/ui'
import { hairline, space, radius, fonts, fontSize } from '../src/theme/tokens'

export default function LeagueTableScreen() {
  const { t } = useTranslation()
  const { activeTeamAccess } = useAuth()
  const c = useClubColors()
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
    try {
      await fetchTable()
    } finally {
      setRefreshing(false)
    }
  }

  const isOwnTeam = (row: TableSnapshotRow) =>
    teamLabel.length > 3 &&
    row.team.toLowerCase().includes(teamLabel.toLowerCase().slice(0, 6))

  return (
    <Screen header={<ModalHeader title={t('matches.leagueTable')} />} padded={false}>
      {competition ? (
        <Text variant="caption2" color="tertiary" tracking="wide" style={styles.competition}>
          {competition}
        </Text>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Table header */}
        <View style={[styles.tableHeader, { borderBottomColor: c.border }]}>
          <Text variant="caption2" color="tertiary" tabular style={styles.placeCol}>#</Text>
          <Text variant="caption2" color="tertiary" style={styles.teamCol}>{t('matches.colTeam')}</Text>
          <Text variant="caption2" color="tertiary" tabular style={styles.numCol}>{t('matches.colP')}</Text>
          <Text variant="caption2" color="tertiary" tabular style={styles.numCol}>{t('matches.colW')}</Text>
          <Text variant="caption2" color="tertiary" tabular style={styles.numCol}>{t('matches.colD')}</Text>
          <Text variant="caption2" color="tertiary" tabular style={styles.numCol}>{t('matches.colL')}</Text>
          <Text variant="caption2" color="tertiary" tabular style={styles.gdCol}>{t('matches.colGD')}</Text>
          <Text variant="caption2" color="tertiary" tabular style={styles.ptsCol}>{t('matches.colPts')}</Text>
        </View>

        {table.map((row, index) => {
          const own = isOwnTeam(row)
          return (
            <View
              key={`${row.place}-${index}`}
              style={[
                styles.tableRow,
                { borderBottomColor: c.border },
                own && { backgroundColor: `${c.clubPrimary}12` },
                row.isPromotion && { borderLeftWidth: 3, borderLeftColor: c.success },
                row.isRelegation && { borderLeftWidth: 3, borderLeftColor: c.error },
              ]}
            >
              <Text
                variant="footnote"
                weight={own ? 'bold' : 'regular'}
                color="primary"
                tabular
                style={styles.placeCol}
              >
                {row.place}
              </Text>
              <View style={[styles.teamCol, styles.teamCell]}>
                {row.img ? (
                  <Image source={{ uri: row.img }} style={styles.rowLogo} />
                ) : null}
                <Text
                  variant="footnote"
                  weight={own ? 'bold' : 'regular'}
                  color={own ? c.clubPrimary : 'primary'}
                  numberOfLines={1}
                  style={styles.teamText}
                >
                  {row.team}
                </Text>
              </View>
              <Text variant="footnote" color="primary" tabular style={styles.numCol}>{row.games}</Text>
              <Text variant="footnote" color="primary" tabular style={styles.numCol}>{row.won}</Text>
              <Text variant="footnote" color="primary" tabular style={styles.numCol}>{row.draw}</Text>
              <Text variant="footnote" color="primary" tabular style={styles.numCol}>{row.lost}</Text>
              <Text variant="footnote" color="primary" tabular style={styles.gdCol}>
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </Text>
              <Text
                variant="footnote"
                weight="bold"
                color={own ? c.clubPrimary : 'primary'}
                tabular
                style={styles.ptsCol}
              >
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
                <View style={[styles.legendDot, { backgroundColor: c.success }]} />
                <Text variant="caption2" color="secondary">{t('matches.promotion')}</Text>
              </View>
            )}
            {table.some((r) => r.isRelegation) && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: c.error }]} />
                <Text variant="caption2" color="secondary">{t('matches.relegation')}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.sm, paddingBottom: 40 },
  competition: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: hairline,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: hairline,
  },
  placeCol: { width: 28, textAlign: 'center' },
  teamCol: { flex: 1 },
  teamCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  teamText: {
    flex: 1,
    textAlign: 'left',
  },
  rowLogo: {
    width: space.md,
    height: space.md,
    borderRadius: radius.sm,
  },
  numCol: { width: 26, textAlign: 'center' },
  gdCol: { width: 32, textAlign: 'center' },
  ptsCol: { width: 30, textAlign: 'center' },
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
    width: space.sm,
    height: space.sm,
    borderRadius: radius.full,
  },
})
