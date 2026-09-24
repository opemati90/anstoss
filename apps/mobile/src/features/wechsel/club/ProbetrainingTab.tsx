import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { TrialInvite, TrialStage } from '@anstoss/shared'
import { EmptyState } from '../../../components/EmptyState'
import { ErrorState } from '../../../components/ErrorState'
import { Text } from '../../../components/ui'
import { SPACING_MD } from '../../../theme/tokens'
import type { TeamOption } from '../api'
import { TrialCard } from '../components/Cards'
import { CardListSkeleton, StageStrip } from '../components/Primitives'
import { apiErrorMessage } from '../components/Sheets'
import { STAGES, stageOf } from '../format'
import type { ApiQuery } from '../query'
import { useClubTrialActions } from './useClubTrialActions'

export function countByStage(invites: TrialInvite[], now = new Date()) {
  const counts = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<TrialStage, number>
  for (const invite of invites) counts[stageOf(invite, now)] += 1
  return counts
}

export function ProbetrainingTab({
  clubId,
  query,
  teams,
  onFindPlayers,
}: {
  clubId: string
  query: ApiQuery<TrialInvite[]>
  teams: TeamOption[]
  onFindPlayers: () => void
}) {
  const { t } = useTranslation()
  const invites = useMemo(() => query.data ?? [], [query.data])
  const counts = useMemo(() => countByStage(invites), [invites])
  const [stage, setStage] = useState<TrialStage | null>(null)
  const { run, sheets, busyId } = useClubTrialActions(clubId, teams)

  // Open on the first stage that needs attention; keep the user's choice after.
  useEffect(() => {
    if (stage || invites.length === 0) return
    setStage(STAGES.find((key) => key !== 'DONE' && counts[key] > 0) ?? 'REQUESTED')
  }, [stage, invites.length, counts])

  const active: TrialStage = stage ?? 'REQUESTED'
  const visible = invites.filter((invite) => stageOf(invite) === active)

  if (query.isLoading) return <CardListSkeleton rows={3} />
  if (query.error && !query.data) {
    return (
      <ErrorState
        message={t('wechsel.trialsError')}
        hint={apiErrorMessage(t, query.error)}
        onRetry={() => void query.refetch()}
      />
    )
  }
  if (invites.length === 0) {
    return (
      <EmptyState
        icon="figure.soccer"
        title={t('wechsel.trialsEmptyTitle')}
        description={t('wechsel.trialsEmptyBody')}
        actionLabel={t('wechsel.trialsEmptyCta')}
        onAction={onFindPlayers}
      />
    )
  }

  return (
    <View style={styles.root}>
      <StageStrip counts={counts} value={active} onChange={setStage} />
      <Text variant="footnote" color="secondary">
        {t(`probetraining.stageHint.${active}`)}
      </Text>
      {visible.length === 0 ? (
        <EmptyState
          compact
          icon="checkmark.circle"
          title={t('wechsel.stageEmptyTitle')}
          description={t(`wechsel.stageEmpty.${active}`)}
        />
      ) : (
        visible.map((invite) => (
          <TrialCard
            key={invite.id}
            invite={invite}
            busy={busyId === invite.id}
            onOpen={() => router.push({ pathname: '/trial/[id]', params: { id: invite.id } })}
            onAction={(action) => run(invite, action)}
          />
        ))
      )}
      {sheets}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: SPACING_MD },
})
