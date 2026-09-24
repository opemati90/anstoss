import { useMemo, useState } from 'react'
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { TrialInvite, TrialStage } from '@anstoss/shared'
import { EmptyState } from '../../../src/components/EmptyState'
import { ErrorState } from '../../../src/components/ErrorState'
import { Icon, Screen, StatusPill, Text } from '../../../src/components/ui'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import {
  hairline,
  RADIUS_CARD,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XXL,
} from '../../../src/theme/tokens'
import { paths } from '../../../src/features/wechsel/api'
import { CardListSkeleton, SectionLabel } from '../../../src/features/wechsel/components/Primitives'
import { apiErrorMessage } from '../../../src/features/wechsel/components/Sheets'
import { formatDate, stageLabel, stageOf, statusChip } from '../../../src/features/wechsel/format'
import { PlayerTrialCard } from '../../../src/features/wechsel/player/PlayerTrialCard'
import { usePlayerTrialActions } from '../../../src/features/wechsel/player/usePlayerTrialActions'
import { useApiQuery } from '../../../src/features/wechsel/query'

const OPEN_STAGES: TrialStage[] = ['DECISION', 'SCHEDULED', 'INVITED', 'REQUESTED']

/**
 * Free agent's "Probetrainings": every trial with a club, grouped by where
 * it stands. What needs an answer comes first; finished ones fold away.
 */
export default function ProbetrainingsTab() {
  const { t } = useTranslation()
  const c = useClubColors()
  const query = useApiQuery<TrialInvite[]>(paths.myTrials)
  const { run, busyId } = usePlayerTrialActions()
  const [showHistory, setShowHistory] = useState(false)

  const grouped = useMemo(() => {
    const groups: Record<TrialStage, TrialInvite[]> = {
      REQUESTED: [],
      INVITED: [],
      SCHEDULED: [],
      DECISION: [],
      DONE: [],
    }
    for (const invite of query.data ?? []) groups[stageOf(invite)].push(invite)
    return groups
  }, [query.data])

  const openCount = OPEN_STAGES.reduce((sum, stage) => sum + grouped[stage].length, 0)
  const needsAnswer = grouped.INVITED.length + grouped.DECISION.filter((i) => i.status === 'OFFERED' && !i.joinRequest).length

  let body: React.ReactNode
  if (query.isLoading) {
    body = <CardListSkeleton rows={2} />
  } else if (query.error && !query.data) {
    body = (
      <ErrorState
        message={t('probetraining.loadError')}
        hint={apiErrorMessage(t, query.error)}
        onRetry={() => void query.refetch()}
      />
    )
  } else if ((query.data ?? []).length === 0) {
    body = (
      <EmptyState
        icon="figure.soccer"
        title={t('probetraining.emptyTitle')}
        description={t('probetraining.emptyBody')}
        actionLabel={t('probetraining.emptyCta')}
        onAction={() => router.navigate('/(tabs)')}
      />
    )
  } else {
    body = (
      <>
        {openCount === 0 ? (
          <EmptyState
            compact
            icon="checkmark.circle"
            title={t('probetraining.noOpenTitle')}
            description={t('probetraining.noOpenBody')}
            actionLabel={t('probetraining.emptyCta')}
            onAction={() => router.navigate('/(tabs)')}
          />
        ) : null}
        {OPEN_STAGES.map((stage) =>
          grouped[stage].length > 0 ? (
            <View key={stage} style={styles.group}>
              <SectionLabel title={stageLabel(t, stage)} count={grouped[stage].length} />
              {grouped[stage].map((invite) => (
                <PlayerTrialCard
                  key={invite.id}
                  invite={invite}
                  busy={busyId === invite.id}
                  onAction={run}
                  showStatus={false}
                />
              ))}
            </View>
          ) : null,
        )}
        {grouped.DONE.length > 0 ? (
          <View style={styles.group}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showHistory }}
              accessibilityLabel={t('probetraining.historyToggle', { count: grouped.DONE.length })}
              onPress={() => setShowHistory((value) => !value)}
              android_ripple={{ color: c.borderSubtle }}
              style={styles.historyToggle}
            >
              <View style={styles.flex}>
                <SectionLabel title={t('probetraining.history')} count={grouped.DONE.length} />
              </View>
              <Icon name={showHistory ? 'chevron.up' : 'chevron.down'} size="sm" color="secondary" />
            </Pressable>
            {showHistory ? (
              <View style={[styles.history, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
                {grouped.DONE.map((invite, index) => {
                  const chip = statusChip(t, invite)
                  return (
                    <Pressable
                      key={invite.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${invite.club.name}, ${chip.label}`}
                      onPress={() => router.push({ pathname: '/trial/[id]', params: { id: invite.id } })}
                      android_ripple={{ color: c.borderSubtle }}
                      style={[
                        styles.historyRow,
                        index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
                      ]}
                    >
                      <View style={styles.flex}>
                        <Text variant="body" weight="semibold" color="primary">
                          {invite.club.name}
                        </Text>
                        <Text variant="footnote" color="secondary" tabular>
                          {`${invite.team.displayName} · ${formatDate(invite.createdAt)}`}
                        </Text>
                      </View>
                      <StatusPill label={chip.label} tone={chip.tone} />
                    </Pressable>
                  )
                })}
              </View>
            ) : null}
          </View>
        ) : null}
      </>
    )
  }

  return (
    <Screen
      scroll
      padded={false}
      edges={['left', 'right']}
      largeTitle={t('probetraining.title')}
      eyebrow={
        needsAnswer > 0 ? t('probetraining.needsAnswer', { count: needsAnswer }) : undefined
      }
      contentStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={c.textTertiary}
        />
      }
    >
      {body}
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: SPACING_LG,
    paddingHorizontal: SPACING_LG,
    paddingBottom: SPACING_XXL,
  },
  group: { gap: SPACING_MD },
  flex: { flex: 1, minWidth: 0 },
  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM,
    minHeight: 44,
  },
  history: {
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  historyRow: {
    minHeight: 60,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_MD,
  },
})
