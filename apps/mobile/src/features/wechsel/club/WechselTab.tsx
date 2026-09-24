import { useMemo, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WechselReleaseStatus, type TrialInvite } from '@anstoss/shared'
import { EmptyState } from '../../../components/EmptyState'
import { ErrorState } from '../../../components/ErrorState'
import { Avatar, Banner, BottomSheet, ListRow, StatusPill, Text } from '../../../components/ui'
import { useClubColors } from '../../../context/ClubThemeContext'
import {
  hairline,
  RADIUS_CARD,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
} from '../../../theme/tokens'
import { paths, wechselApi } from '../api'
import { ChecklistRow } from '../components/Cards'
import { DatePickerSheet } from '../components/DatePickerSheet'
import { CardListSkeleton } from '../components/Primitives'
import { apiErrorMessage } from '../components/Sheets'
import { formatDate, fromIsoDate, toIsoDate, wechselperiodeHint } from '../format'
import { invalidateApi, type ApiQuery } from '../query'

const RELEASE: WechselReleaseStatus[] = [
  WechselReleaseStatus.PENDING,
  WechselReleaseStatus.GRANTED,
  WechselReleaseStatus.REFUSED,
  WechselReleaseStatus.NOT_NEEDED,
]

/** Accepted players on their way into the squad, with the DFBnet checklist. */
export function WechselTab({
  clubId,
  query,
  isAdmin,
}: {
  clubId: string
  query: ApiQuery<TrialInvite[]>
  isAdmin: boolean
}) {
  const { t } = useTranslation()
  const rows = useMemo(
    () =>
      (query.data ?? [])
        .filter((invite) => invite.status === 'OFFERED' || invite.status === 'JOINED')
        .sort((a, b) => {
          // Open cases first, then most recent.
          const openA = a.joinRequest?.eligibleFrom ? 1 : 0
          const openB = b.joinRequest?.eligibleFrom ? 1 : 0
          return openA - openB || b.createdAt.localeCompare(a.createdAt)
        }),
    [query.data],
  )
  const [releaseFor, setReleaseFor] = useState<TrialInvite | null>(null)
  const [dateFor, setDateFor] = useState<TrialInvite | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const update = async (
    invite: TrialInvite,
    body: Parameters<typeof wechselApi.updateWechsel>[2],
  ) => {
    if (!invite.joinRequest) return
    setSavingId(invite.id)
    try {
      await wechselApi.updateWechsel(clubId, invite.joinRequest.id, body)
      invalidateApi(paths.clubTrials(clubId), paths.trial(invite.id))
    } catch (error) {
      Alert.alert(t('common.error'), apiErrorMessage(t, error))
    } finally {
      setSavingId(null)
    }
  }

  if (query.isLoading) return <CardListSkeleton rows={2} />
  if (query.error && !query.data) {
    return (
      <ErrorState
        message={t('wechsel.trialsError')}
        hint={apiErrorMessage(t, query.error)}
        onRetry={() => void query.refetch()}
      />
    )
  }

  return (
    <View style={styles.root}>
      <Banner tone="info" icon="info.circle" title={t('wechsel.dfbnetTitle')} description={t('wechsel.dfbnetBody')} />
      {rows.length === 0 ? (
        <EmptyState
          icon="arrow.left.arrow.right"
          title={t('wechsel.wechselEmptyTitle')}
          description={t('wechsel.wechselEmptyBody')}
        />
      ) : (
        rows.map((invite) => (
          <WechselCard
            key={invite.id}
            invite={invite}
            isAdmin={isAdmin}
            saving={savingId === invite.id}
            onRelease={() => setReleaseFor(invite)}
            onPass={() => {
              const current = invite.joinRequest?.passApplicationAt
              if (!current) {
                void update(invite, { passApplicationAt: toIsoDate(new Date()) })
                return
              }
              Alert.alert(t('wechsel.passResetTitle'), t('wechsel.passResetBody'), [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('wechsel.passReset'),
                  style: 'destructive',
                  onPress: () => void update(invite, { passApplicationAt: null }),
                },
              ])
            }}
            onEligible={() => setDateFor(invite)}
          />
        ))
      )}

      <BottomSheet visible={Boolean(releaseFor)} onClose={() => setReleaseFor(null)} heightPct="auto">
        <View style={styles.sheet}>
          <Text variant="title2" color="primary">
            {t('wechsel.releaseTitle')}
          </Text>
          <Text variant="subheadline" color="secondary">
            {releaseFor?.joinRequest?.previousClubName
              ? t('wechsel.releaseHintClub', { club: releaseFor.joinRequest.previousClubName })
              : t('wechsel.releaseHint')}
          </Text>
          <View>
            {RELEASE.map((status) => (
              <ListRow
                key={status}
                title={t(`wechsel.release.${status}`)}
                selected={releaseFor?.joinRequest?.releaseStatus === status}
                onPress={() => {
                  const target = releaseFor
                  setReleaseFor(null)
                  if (target) void update(target, { releaseStatus: status })
                }}
              />
            ))}
          </View>
        </View>
      </BottomSheet>

      <DatePickerSheet
        visible={Boolean(dateFor)}
        title={t('wechsel.eligibleTitle')}
        value={dateFor?.joinRequest?.eligibleFrom ? fromIsoDate(dateFor.joinRequest.eligibleFrom) : null}
        onClose={() => setDateFor(null)}
        onConfirm={(date) => {
          const target = dateFor
          setDateFor(null)
          if (target) void update(target, { eligibleFrom: toIsoDate(date) })
        }}
        onClear={
          dateFor?.joinRequest?.eligibleFrom
            ? () => {
                const target = dateFor
                setDateFor(null)
                if (target) void update(target, { eligibleFrom: null })
              }
            : undefined
        }
        footer={(date) => (
          <Text variant="footnote" color="secondary">
            {wechselperiodeHint(t, date)}
          </Text>
        )}
      />
    </View>
  )
}

function WechselCard({
  invite,
  isAdmin,
  saving,
  onRelease,
  onPass,
  onEligible,
}: {
  invite: TrialInvite
  isAdmin: boolean
  saving: boolean
  onRelease: () => void
  onPass: () => void
  onEligible: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const request = invite.joinRequest
  const hasRequest = Boolean(request)
  const approved = request?.status === 'APPROVED' || invite.status === 'JOINED'
  const release = request?.releaseStatus ?? null
  const releaseDone = release === 'GRANTED' || release === 'NOT_NEEDED'
  const eligible = request?.eligibleFrom ? fromIsoDate(request.eligibleFrom) : null
  const disabledHint = hasRequest ? null : t('wechsel.needsApplication')

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
      <View style={styles.header}>
        <Avatar size="md" tone="neutral" src={invite.player.avatarUrl} fallbackText={invite.player.name} />
        <View style={styles.flex}>
          <Text variant="headline" color="primary" numberOfLines={1}>
            {invite.player.name}
          </Text>
          <Text variant="footnote" color="secondary" numberOfLines={1}>
            {invite.team.displayName}
          </Text>
        </View>
        <StatusPill
          label={eligible ? t('wechsel.eligibleShort', { date: formatDate(eligible) }) : t('wechsel.inProgress')}
          tone={eligible ? 'success' : 'warning'}
        />
      </View>
      <View style={[styles.list, { borderTopColor: c.borderSubtle }]}>
        <ChecklistRow
          done={approved}
          title={t('wechsel.stepApplication')}
          value={
            !request
              ? t('wechsel.applicationMissing')
              : approved
                ? t('wechsel.applicationApproved')
                : t('wechsel.applicationPending', { date: formatDate(request.createdAt) })
          }
          hint={
            request && !approved
              ? isAdmin
                ? t('wechsel.applicationReviewHint')
                : t('wechsel.applicationAdminHint')
              : null
          }
          onPress={request && !approved && isAdmin ? () => router.push('/pending-requests') : undefined}
        />
        <ChecklistRow
          done={releaseDone}
          title={t('wechsel.stepRelease')}
          value={release ? t(`wechsel.release.${release}`) : null}
          hint={
            disabledHint ??
            (request?.previousClubName
              ? t('wechsel.releaseFrom', { club: request.previousClubName })
              : null)
          }
          onPress={onRelease}
          disabled={!hasRequest || saving}
        />
        <ChecklistRow
          done={Boolean(request?.passApplicationAt)}
          title={t('wechsel.stepPass')}
          value={request?.passApplicationAt ? formatDate(fromIsoDate(request.passApplicationAt)) : null}
          hint={disabledHint ?? (request?.passApplicationAt ? null : t('wechsel.passHint'))}
          onPress={onPass}
          disabled={!hasRequest || saving}
        />
        <ChecklistRow
          done={Boolean(eligible)}
          title={t('wechsel.stepEligible')}
          value={eligible ? formatDate(eligible) : null}
          hint={disabledHint ?? (eligible ? wechselperiodeHint(t, eligible) : t('wechsel.eligibleHint'))}
          onPress={onEligible}
          disabled={!hasRequest || saving}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: SPACING_MD },
  card: {
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    padding: SPACING_LG,
  },
  flex: { flex: 1, minWidth: 0 },
  list: { borderTopWidth: hairline, paddingVertical: SPACING_SM },
  sheet: { gap: SPACING_MD, paddingBottom: SPACING_SM },
})
