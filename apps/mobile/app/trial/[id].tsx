import { RefreshControl, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { TrialInvite } from '@anstoss/shared'
import { ApiError } from '../../src/api/client'
import { EmptyState } from '../../src/components/EmptyState'
import { ErrorState } from '../../src/components/ErrorState'
import { ModalHeader } from '../../src/components/ModalHeader'
import { Avatar, Button, Screen, SectionGroup, StatusPill, Text } from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import {
  hairline,
  RADIUS_CARD,
  RADIUS_FULL,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXL,
} from '../../src/theme/tokens'
import { paths } from '../../src/features/wechsel/api'
import { useClubTrialActions } from '../../src/features/wechsel/club/useClubTrialActions'
import { TrialCardActions } from '../../src/features/wechsel/components/Cards'
import {
  CardListSkeleton,
  ClubBadge,
  RatingStars,
} from '../../src/features/wechsel/components/Primitives'
import { apiErrorMessage } from '../../src/features/wechsel/components/Sheets'
import {
  formatDate,
  leagueLabel,
  playerMeta,
  STAGES,
  stageLabel,
  stageOf,
  statusChip,
} from '../../src/features/wechsel/format'
import { useManagedTeams } from '../../src/features/wechsel/hooks'
import {
  PlayerTrialCard,
  Quote,
  SessionLines,
} from '../../src/features/wechsel/player/PlayerTrialCard'
import { usePlayerTrialActions } from '../../src/features/wechsel/player/usePlayerTrialActions'
import { useApiQuery } from '../../src/features/wechsel/query'

/** One Probetraining, seen by the player or by the club's staff. */
export default function TrialDetailScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const query = useApiQuery<TrialInvite>(id ? paths.trial(id) : null)
  const invite = query.data
  const isPlayer = Boolean(invite && user && invite.player.userId === user.id)
  const { teams } = useManagedTeams()
  const club = useClubTrialActions(invite && !isPlayer ? invite.clubId : null, teams)
  const player = usePlayerTrialActions()

  const header = (
    <ModalHeader
      title={invite ? (isPlayer ? invite.club.name : invite.player.name) : t('probetraining.detailTitle')}
      mode="back"
      fallbackHref={isPlayer ? '/(tabs)/invites' : '/wechselboerse'}
    />
  )

  if (query.isLoading) {
    return (
      <Screen header={header} padded={false} contentStyle={styles.content}>
        <CardListSkeleton rows={2} />
      </Screen>
    )
  }
  if (!invite) {
    const gone = query.error instanceof ApiError && query.error.status === 404
    return (
      <Screen header={header} padded={false} contentStyle={styles.content}>
        {gone ? (
          <EmptyState
            icon="questionmark.circle"
            title={t('probetraining.goneTitle')}
            description={t('probetraining.goneBody')}
          />
        ) : (
          <ErrorState
            message={t('probetraining.loadError')}
            hint={apiErrorMessage(t, query.error)}
            onRetry={() => void query.refetch()}
          />
        )}
      </Screen>
    )
  }

  const stage = stageOf(invite)
  const chip = statusChip(t, invite)
  const stageIndex = STAGES.indexOf(stage)
  const history = [
    {
      key: 'start',
      label:
        invite.initiatedBy === 'PLAYER'
          ? t('probetraining.historyRequested')
          : t('probetraining.historyInvited'),
      date: invite.createdAt,
    },
    invite.respondedAt
      ? { key: 'answer', label: t('probetraining.historyAnswered'), date: invite.respondedAt }
      : null,
    invite.decidedAt
      ? { key: 'decision', label: t('probetraining.historyDecided'), date: invite.decidedAt }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; date: string }>

  return (
    <Screen
      header={header}
      scroll
      padded={false}
      contentStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={c.textTertiary}
        />
      }
    >
      {isPlayer ? (
        <PlayerTrialCard invite={invite} busy={player.busyId === invite.id} onAction={player.run} />
      ) : (
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
          <View style={styles.row}>
            <Avatar size="lg" tone="neutral" src={invite.player.avatarUrl} fallbackText={invite.player.name} />
            <View style={styles.flex}>
              <Text variant="title3" color="primary">
                {invite.player.name}
              </Text>
              <Text variant="footnote" color="secondary">
                {[playerMeta(t, invite.player), leagueLabel(t, invite.player.highestLeague)]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </View>
          <View style={styles.wrapRow}>
            <StatusPill label={chip.label} tone={chip.tone} />
            <View style={styles.teamLine}>
              <ClubBadge name={invite.club.name} badgeUrl={invite.club.badgeUrl} color={invite.club.primaryColor} size={20} />
              <Text variant="subheadline" color="secondary" style={styles.shrink}>
                {invite.team.displayName}
              </Text>
            </View>
          </View>
          <TrialCardActions
            stage={stage}
            invite={invite}
            busy={club.busyId === invite.id}
            onAction={(action) => club.run(invite, action)}
          />
          <Button
            label={t('probetraining.viewProfile')}
            variant="plain"
            size="sm"
            onPress={() =>
              router.push({ pathname: '/free-agent/[id]', params: { id: invite.freeAgentProfileId } })
            }
          />
        </View>
      )}

      <View style={styles.progress} accessibilityLabel={t('probetraining.progressA11y', { stage: stageLabel(t, stage) })}>
        {STAGES.map((key, index) => {
          const reached = index <= stageIndex
          return (
            <View key={key} style={styles.step}>
              <View
                style={[
                  styles.stepBar,
                  { backgroundColor: reached ? c.primary : c.borderDefault },
                ]}
              />
              <Text
                variant="caption2"
                color={index === stageIndex ? 'primary' : 'tertiary'}
                weight={index === stageIndex ? 'semibold' : 'regular'}
              >
                {stageLabel(t, key)}
              </Text>
            </View>
          )
        })}
      </View>

      {invite.sessions.length > 0 ? (
        <SectionGroup header={t('probetraining.sessions')}>
          <View style={styles.section}>
            <SessionLines sessions={invite.sessions} />
          </View>
        </SectionGroup>
      ) : null}

      {invite.message || invite.decisionMessage ? (
        <SectionGroup header={t('probetraining.messages')}>
          {invite.message ? (
            <View style={styles.section}>
              <Quote text={invite.message} author={invite.initiatedBy === 'PLAYER' ? invite.player.name : invite.sender?.name} />
            </View>
          ) : null}
          {invite.decisionMessage ? (
            <View style={styles.section}>
              <Quote text={invite.decisionMessage} author={invite.club.name} />
            </View>
          ) : null}
        </SectionGroup>
      ) : null}

      {!isPlayer && (invite.rating || invite.feedback || invite.attended != null) ? (
        <SectionGroup header={t('probetraining.feedback')} footer={t('wechsel.feedbackPrivate')}>
          <View style={styles.section}>
            {invite.rating ? <RatingStars value={invite.rating} size={20} /> : null}
            {invite.attended != null ? (
              <Text variant="subheadline" color="secondary">
                {invite.attended ? t('probetraining.attendedYes') : t('probetraining.attendedNo')}
              </Text>
            ) : null}
            {invite.feedback ? (
              <Text variant="body" color="primary">
                {invite.feedback}
              </Text>
            ) : null}
          </View>
        </SectionGroup>
      ) : null}

      <SectionGroup header={t('probetraining.historyTitle')}>
        {history.map((entry) => (
          <View key={entry.key} style={styles.historyRow}>
            <View style={[styles.dot, { backgroundColor: c.primary }]} />
            <Text variant="body" color="primary" style={styles.flex}>
              {entry.label}
            </Text>
            <Text variant="subheadline" color="secondary" tabular>
              {formatDate(entry.date)}
            </Text>
          </View>
        ))}
      </SectionGroup>

      {club.sheets}
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
  card: {
    padding: SPACING_LG,
    gap: SPACING_MD,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING_MD },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING_SM },
  teamLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING_XS, flexShrink: 1, minWidth: 0 },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  progress: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_XS },
  step: { flexGrow: 1, flexBasis: 56, gap: SPACING_XS },
  stepBar: { height: 4, borderRadius: RADIUS_FULL },
  section: { padding: SPACING_MD, gap: SPACING_SM },
  historyRow: {
    minHeight: 48,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
  },
  dot: { width: 8, height: 8, borderRadius: RADIUS_FULL },
})
