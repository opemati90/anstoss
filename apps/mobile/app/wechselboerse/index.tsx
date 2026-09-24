import { useEffect, useMemo, useState } from 'react'
import { RefreshControl, StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { PlayerSearch, TrialInvite } from '@anstoss/shared'
import { EmptyState } from '../../src/components/EmptyState'
import { ModalHeader } from '../../src/components/ModalHeader'
import { FilterChipRow, Screen } from '../../src/components/ui'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { SPACING_LG, SPACING_XXL } from '../../src/theme/tokens'
import { paths } from '../../src/features/wechsel/api'
import { GesucheTab } from '../../src/features/wechsel/club/GesucheTab'
import { ProbetrainingTab } from '../../src/features/wechsel/club/ProbetrainingTab'
import { SpielersucheTab } from '../../src/features/wechsel/club/SpielersucheTab'
import { WechselTab } from '../../src/features/wechsel/club/WechselTab'
import { stageOf } from '../../src/features/wechsel/format'
import { useManagedTeams, useWechselAccess } from '../../src/features/wechsel/hooks'
import { useApiQuery } from '../../src/features/wechsel/query'

type Segment = 'gesuche' | 'spieler' | 'probetraining' | 'wechsel'
const SEGMENTS: Segment[] = ['gesuche', 'spieler', 'probetraining', 'wechsel']

/**
 * Wechselbörse: the club's recruiting desk. Gesuche (what we are looking
 * for), Spielersuche (who is looking for a club), Probetraining (the trial
 * pipeline) and Wechsel (Aufnahmeantrag → Freigabe → Passantrag →
 * spielberechtigt). DFBnet stays the system of record for the pass.
 */
export default function WechselboerseScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const params = useLocalSearchParams<{ tab?: string }>()
  const access = useWechselAccess()
  const initial = SEGMENTS.includes(params.tab as Segment) ? (params.tab as Segment) : 'probetraining'
  const [segment, setSegment] = useState<Segment>(initial)

  useEffect(() => {
    if (SEGMENTS.includes(params.tab as Segment)) setSegment(params.tab as Segment)
  }, [params.tab])

  const clubId = access.canManage ? access.clubId : null
  const trials = useApiQuery<TrialInvite[]>(clubId ? paths.clubTrials(clubId) : null)
  const searches = useApiQuery<PlayerSearch[]>(clubId ? paths.clubSearches(clubId) : null)
  const { teams } = useManagedTeams()

  const counts = useMemo(() => {
    const list = trials.data ?? []
    return {
      gesuche: (searches.data ?? []).filter((search) => search.status === 'OPEN').length,
      probetraining: list.filter((invite) => stageOf(invite) !== 'DONE' && invite.status !== 'OFFERED')
        .length,
      wechsel: list.filter(
        (invite) =>
          (invite.status === 'OFFERED' || invite.status === 'JOINED') && !invite.joinRequest?.eligibleFrom,
      ).length,
    }
  }, [trials.data, searches.data])

  const header = <ModalHeader title={t('wechsel.title')} mode="back" fallbackHref="/(tabs)" />

  if (!access.canManage || !clubId) {
    return (
      <Screen header={header} padded={false} contentStyle={styles.content}>
        <EmptyState
          icon="lock"
          title={t('wechsel.noAccessTitle')}
          description={t('wechsel.noAccessBody')}
        />
      </Screen>
    )
  }

  const refreshing = trials.isRefetching || searches.isRefetching
  const onRefresh = () => {
    void trials.refetch()
    void searches.refetch()
  }

  return (
    <Screen
      header={header}
      scroll
      padded={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.textTertiary} />
      }
      contentStyle={styles.content}
    >
      <FilterChipRow
        wrap
        singleSelect
        chips={[
          { key: 'gesuche' as const, label: t('wechsel.tabGesuche'), count: counts.gesuche || undefined },
          { key: 'spieler' as const, label: t('wechsel.tabSpieler') },
          {
            key: 'probetraining' as const,
            label: t('wechsel.tabProbetraining'),
            count: counts.probetraining || undefined,
          },
          { key: 'wechsel' as const, label: t('wechsel.tabWechsel'), count: counts.wechsel || undefined },
        ]}
        selected={segment}
        onToggle={setSegment}
      />
      <View style={styles.body}>
        {segment === 'gesuche' ? <GesucheTab clubId={clubId} query={searches} teams={teams} /> : null}
        {segment === 'spieler' ? <SpielersucheTab /> : null}
        {segment === 'probetraining' ? (
          <ProbetrainingTab
            clubId={clubId}
            query={trials}
            teams={teams}
            onFindPlayers={() => setSegment('spieler')}
          />
        ) : null}
        {segment === 'wechsel' ? (
          <WechselTab clubId={clubId} query={trials} isAdmin={access.isAdmin} />
        ) : null}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: SPACING_LG,
    paddingHorizontal: SPACING_LG,
    paddingTop: SPACING_LG,
    paddingBottom: SPACING_XXL,
  },
  body: { gap: SPACING_LG },
})
