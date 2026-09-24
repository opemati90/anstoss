import { useMemo, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { FreeAgentProfile, PlayerSearch, PlayerSearchListResponse } from '@anstoss/shared'
import { EmptyState } from '../EmptyState'
import { ErrorState } from '../ErrorState'
import { Banner, FilterChipRow, Text } from '../ui'
import { SPACING_LG, SPACING_MD, SPACING_XS } from '../../theme/tokens'
import { buildQuery, paths, wechselApi } from '../../features/wechsel/api'
import { GesuchCard } from '../../features/wechsel/components/Cards'
import { CardListSkeleton } from '../../features/wechsel/components/Primitives'
import { apiErrorMessage, RequestTrialSheet } from '../../features/wechsel/components/Sheets'
import { positionLabel } from '../../features/wechsel/format'
import { invalidateApi, useApiQuery } from '../../features/wechsel/query'

type ProfileGap = 'create' | 'complete' | 'inactive' | null

/** What the free agent should fix first so clubs can find them. */
export function profileGap(profile: FreeAgentProfile | null | undefined): ProfileGap {
  if (!profile) return 'create'
  if (!profile.position || !profile.postalCode) return 'complete'
  if (!profile.isOnTransferList || profile.visibility === 'PRIVATE') return 'inactive'
  return null
}

const RADII = ['10', '25', '50'] as const

/**
 * "Entdecken" for free agents: open Gesuche from clubs near them, with
 * "Probetraining anfragen" right on the card.
 */
export function FreeAgentHome() {
  const { t } = useTranslation()
  const profileQuery = useApiQuery<FreeAgentProfile | null>(paths.myProfile)
  const profile = profileQuery.data ?? null
  const [onlyMyPosition, setOnlyMyPosition] = useState(true)
  const [radius, setRadius] = useState<(typeof RADII)[number] | null>(null)
  const [requestFor, setRequestFor] = useState<PlayerSearch | null>(null)
  const [sending, setSending] = useState(false)

  const effectiveRadius = radius ?? (profile?.searchRadiusKm ? String(profile.searchRadiusKm) : '25')
  const position = onlyMyPosition ? profile?.position ?? null : null
  const searchPath = useMemo(
    () =>
      paths.openSearches(
        buildQuery({
          position,
          postalCode: profile?.postalCode ?? null,
          radiusKm: profile?.postalCode ? effectiveRadius : null,
          pageSize: 30,
        }),
      ),
    [position, profile?.postalCode, effectiveRadius],
  )
  const searches = useApiQuery<PlayerSearchListResponse>(profileQuery.isLoading ? null : searchPath)
  const gap = profileQuery.isLoading || profileQuery.error ? null : profileGap(profile)

  const sendRequest = async (message: string | undefined) => {
    if (!requestFor) return
    setSending(true)
    try {
      await wechselApi.requestTrial(requestFor.id, message)
      invalidateApi('/player-searches', paths.myTrials)
      setRequestFor(null)
      Alert.alert(
        t('entdecken.requestSentTitle'),
        t('entdecken.requestSentBody', { club: requestFor.club.name }),
      )
    } catch (error) {
      Alert.alert(t('common.error'), apiErrorMessage(t, error))
    } finally {
      setSending(false)
    }
  }

  const items = searches.data?.items ?? []
  let list: React.ReactNode
  if (profileQuery.isLoading || searches.isLoading) {
    list = <CardListSkeleton rows={2} />
  } else if (searches.error && !searches.data) {
    list = (
      <ErrorState
        message={t('entdecken.loadError')}
        hint={apiErrorMessage(t, searches.error)}
        onRetry={() => void searches.refetch()}
      />
    )
  } else if (items.length === 0) {
    const narrowed = Boolean(position) || Boolean(profile?.postalCode)
    list = (
      <EmptyState
        compact
        icon="megaphone"
        title={t('entdecken.emptyTitle')}
        description={narrowed ? t('entdecken.emptyNarrowed') : t('entdecken.emptyBody')}
        actionLabel={position ? t('entdecken.allPositions') : undefined}
        onAction={position ? () => setOnlyMyPosition(false) : undefined}
      />
    )
  } else {
    list = items.map((search) => (
      <GesuchCard
        key={search.id}
        search={search}
        variant="player"
        busy={sending}
        onPrimary={() => {
          if (!profile) {
            router.navigate('/(tabs)/profile')
            return
          }
          setRequestFor(search)
        }}
        onSecondary={() =>
          search.myTrialInviteId
            ? router.push({ pathname: '/trial/[id]', params: { id: search.myTrialInviteId } })
            : undefined
        }
      />
    ))
  }

  return (
    <View style={styles.root}>
      {gap ? (
        <Banner
          tone={gap === 'inactive' ? 'warning' : 'tint'}
          icon={gap === 'inactive' ? 'eye.slash' : 'person.circle'}
          title={t(`entdecken.gap.${gap}.title`)}
          description={t(`entdecken.gap.${gap}.body`)}
          action={{
            label: t(`entdecken.gap.${gap}.cta`),
            onPress: () => router.navigate('/(tabs)/profile'),
          }}
        />
      ) : null}

      <View style={styles.header}>
        <Text variant="title2" color="primary">
          {profile?.postalCode ? t('entdecken.titleNearby') : t('entdecken.title')}
        </Text>
        <Text variant="subheadline" color="secondary">
          {profile?.postalCode
            ? t('entdecken.subtitleNearby', { plz: profile.postalCode, km: effectiveRadius })
            : t('entdecken.subtitle')}
        </Text>
      </View>

      <View style={styles.filters}>
        {profile?.position ? (
          <FilterChipRow
            wrap
            singleSelect
            chips={[
              {
                key: 'mine' as const,
                label: positionLabel(t, profile.position) ?? t('entdecken.myPosition'),
              },
              { key: 'all' as const, label: t('entdecken.allPositions') },
            ]}
            selected={onlyMyPosition ? 'mine' : 'all'}
            onToggle={(key) => setOnlyMyPosition(key === 'mine')}
          />
        ) : null}
        {profile?.postalCode ? (
          <FilterChipRow
            wrap
            singleSelect
            chips={RADII.map((km) => ({ key: km, label: t('wechsel.radiusKm', { km }) }))}
            selected={effectiveRadius as (typeof RADII)[number]}
            onToggle={setRadius}
          />
        ) : null}
      </View>

      <View style={styles.list}>{list}</View>

      <RequestTrialSheet
        visible={Boolean(requestFor)}
        onClose={() => setRequestFor(null)}
        clubName={requestFor?.club.name ?? ''}
        teamName={requestFor?.team.displayName ?? ''}
        submitting={sending}
        onSubmit={(message) => void sendRequest(message)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: SPACING_LG },
  header: { gap: SPACING_XS },
  filters: { gap: SPACING_MD },
  list: { gap: SPACING_MD },
})
