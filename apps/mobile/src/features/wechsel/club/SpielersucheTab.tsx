import { useEffect, useMemo, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { FreeAgentListResponse } from '@anstoss/shared'
import { EmptyState } from '../../../components/EmptyState'
import { ErrorState } from '../../../components/ErrorState'
import { FormInput } from '../../../components/FormInput'
import {
  BottomSheet,
  Button,
  FilterChipRow,
  Icon,
  SearchBar,
  SectionGroup,
  Text,
} from '../../../components/ui'
import { SPACING_LG, SPACING_MD, SPACING_SM } from '../../../theme/tokens'
import { buildQuery, paths, wechselApi, type TeamOption } from '../api'
import { PlayerRow } from '../components/Cards'
import { CardListSkeleton } from '../components/Primitives'
import { apiErrorMessage, InviteSheet } from '../components/Sheets'
import { LEAGUE_OPTIONS, POSITIONS, leagueLabel, positionLabel } from '../format'
import { invalidateApi, useApiQuery } from '../query'

const RADII = [10, 25, 50, 100] as const
const PAGE = 20

type InviteTarget = { id: string; name: string }

/**
 * Spielersuche. With `clubId` and `teams` each row carries the one-tap
 * "Probetraining" invite (same InviteSheet + endpoint as the player profile);
 * players with an open trial invite show "Eingeladen".
 */
export function SpielersucheTab({
  clubId,
  teams = [],
  invitedProfileIds,
}: {
  clubId?: string | null
  teams?: TeamOption[]
  invitedProfileIds?: ReadonlySet<string>
} = {}) {
  const { t } = useTranslation()
  const [inviteTarget, setInviteTarget] = useState<InviteTarget | null>(null)
  const [sending, setSending] = useState(false)
  const [sentIds, setSentIds] = useState<ReadonlySet<string>>(new Set())
  const canInvite = Boolean(clubId) && teams.length > 0

  const sendInvite = async (input: { teamId: string; sessionEventIds: string[]; message?: string }) => {
    if (!clubId || !inviteTarget) return
    setSending(true)
    try {
      await wechselApi.createInvite(clubId, {
        freeAgentProfileId: inviteTarget.id,
        teamId: input.teamId,
        sessionEventIds: input.sessionEventIds,
        message: input.message,
      })
      invalidateApi(paths.clubTrials(clubId))
      setSentIds((prev) => new Set([...prev, inviteTarget.id]))
      Alert.alert(t('wechsel.inviteSent', { name: inviteTarget.name }))
      setInviteTarget(null)
    } catch (error) {
      Alert.alert(t('common.error'), apiErrorMessage(t, error))
    } finally {
      setSending(false)
    }
  }
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [position, setPosition] = useState<'ALL' | (typeof POSITIONS)[number]>('ALL')
  const [postalCode, setPostalCode] = useState<string | null>(null)
  const [radius, setRadius] = useState<number>(25)
  const [league, setLeague] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState(PAGE)
  const [sheet, setSheet] = useState<'area' | 'league' | null>(null)
  const [draftPlz, setDraftPlz] = useState('')
  const [draftRadius, setDraftRadius] = useState(25)

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(text.trim()), 300)
    return () => clearTimeout(handle)
  }, [text])

  useEffect(() => {
    setPageSize(PAGE)
  }, [debounced, position, postalCode, radius, league])

  const path = useMemo(
    () =>
      paths.freeAgents(
        buildQuery({
          query: debounced.length >= 2 ? debounced : null,
          position: position === 'ALL' ? null : position,
          postalCode,
          radiusKm: postalCode ? radius : null,
          league,
          pageSize,
          sort: 'recent',
        }),
      ),
    [debounced, position, postalCode, radius, league, pageSize],
  )
  const query = useApiQuery<FreeAgentListResponse>(path)
  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const hasFilters = position !== 'ALL' || Boolean(postalCode) || Boolean(league) || debounced.length >= 2

  const resetFilters = () => {
    setText('')
    setPosition('ALL')
    setPostalCode(null)
    setLeague(null)
  }

  let body: React.ReactNode
  if (query.isLoading) {
    body = <CardListSkeleton rows={4} />
  } else if (query.error && !query.data) {
    body = (
      <ErrorState
        message={t('wechsel.playersError')}
        hint={apiErrorMessage(t, query.error)}
        onRetry={() => void query.refetch()}
      />
    )
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon="magnifyingglass"
        title={t('wechsel.playersEmptyTitle')}
        description={hasFilters ? t('wechsel.playersEmptyFiltered') : t('wechsel.playersEmptyBody')}
        actionLabel={hasFilters ? t('wechsel.filtersReset') : undefined}
        onAction={hasFilters ? resetFilters : undefined}
      />
    )
  } else {
    body = (
      <>
        <Text variant="footnote" color="secondary" tabular>
          {t('wechsel.playersCount', { count: total })}
        </Text>
        <SectionGroup>
          {items.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
              invited={sentIds.has(player.id) || Boolean(invitedProfileIds?.has(player.id))}
              onInvite={
                canInvite ? () => setInviteTarget({ id: player.id, name: player.name }) : undefined
              }
              onPress={() => router.push({ pathname: '/free-agent/[id]', params: { id: player.id } })}
            />
          ))}
        </SectionGroup>
        {items.length < total && pageSize < 50 ? (
          <Button
            label={t('wechsel.loadMore')}
            variant="plain"
            loading={query.isRefetching}
            onPress={() => setPageSize((size) => Math.min(size + PAGE, 50))}
          />
        ) : null}
      </>
    )
  }

  return (
    <View style={styles.root}>
      <SearchBar value={text} onChangeText={setText} placeholder={t('wechsel.playersSearch')} />
      <FilterChipRow
        singleSelect
        chips={[
          { key: 'ALL' as const, label: t('wechsel.allPositions') },
          ...POSITIONS.map((key) => ({ key, label: positionLabel(t, key) ?? key })),
        ]}
        selected={position}
        onToggle={setPosition}
      />
      <View style={styles.filters}>
        <Button
          size="sm"
          variant={postalCode ? 'tinted' : 'bordered'}
          label={
            postalCode
              ? t('wechsel.areaValue', { plz: postalCode, km: radius })
              : t('wechsel.areaAny')
          }
          leftIcon={<Icon name="mappin" size="sm" color={postalCode ? 'tint' : 'secondary'} />}
          onPress={() => {
            setDraftPlz(postalCode ?? '')
            setDraftRadius(radius)
            setSheet('area')
          }}
        />
        <Button
          size="sm"
          variant={league ? 'tinted' : 'bordered'}
          label={league ? (leagueLabel(t, league) ?? league) : t('wechsel.leagueAny')}
          leftIcon={<Icon name="trophy" size="sm" color={league ? 'tint' : 'secondary'} />}
          onPress={() => setSheet('league')}
        />
      </View>
      {body}

      {canInvite && clubId ? (
        <InviteSheet
          visible={Boolean(inviteTarget)}
          onClose={() => setInviteTarget(null)}
          clubId={clubId}
          teams={teams}
          playerName={inviteTarget?.name ?? ''}
          submitting={sending}
          onSubmit={(input) => void sendInvite(input)}
        />
      ) : null}

      <BottomSheet visible={sheet === 'area'} onClose={() => setSheet(null)} heightPct="auto">
        <View style={styles.sheet}>
          <Text variant="title3" weight="bold" color="primary">
            {t('wechsel.areaTitle')}
          </Text>
          <Text variant="subheadline" color="secondary">
            {t('wechsel.areaHint')}
          </Text>
          <FormInput
            label={t('spielerprofil.fieldPostalCode')}
            value={draftPlz}
            onChangeText={(value) => setDraftPlz(value.replace(/\D/g, '').slice(0, 5))}
            keyboardType="number-pad"
            maxLength={5}
            placeholder="14482"
          />
          <FilterChipRow
            wrap
            singleSelect
            chips={RADII.map((km) => ({ key: String(km), label: t('wechsel.radiusKm', { km }) }))}
            selected={String(draftRadius)}
            onToggle={(key) => setDraftRadius(Number(key))}
          />
          <Button
            label={t('wechsel.applyFilter')}
            disabled={draftPlz.length !== 5}
            onPress={() => {
              setPostalCode(draftPlz)
              setRadius(draftRadius)
              setSheet(null)
            }}
            fullWidth
          />
          {postalCode ? (
            <Button
              label={t('wechsel.areaClear')}
              variant="plain"
              onPress={() => {
                setPostalCode(null)
                setSheet(null)
              }}
              fullWidth
            />
          ) : null}
        </View>
      </BottomSheet>

      <BottomSheet visible={sheet === 'league'} onClose={() => setSheet(null)} heightPct="auto">
        <View style={styles.sheet}>
          <Text variant="title3" weight="bold" color="primary">
            {t('wechsel.leagueTitle')}
          </Text>
          <FilterChipRow
            wrap
            singleSelect
            chips={[
              { key: 'ANY', label: t('wechsel.leagueAny') },
              ...LEAGUE_OPTIONS.map((key) => ({ key: key as string, label: leagueLabel(t, key) ?? key })),
            ]}
            selected={league ?? 'ANY'}
            onToggle={(key) => {
              setLeague(key === 'ANY' ? null : key)
              setSheet(null)
            }}
          />
        </View>
      </BottomSheet>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: SPACING_MD },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_SM },
  sheet: { gap: SPACING_LG, paddingBottom: SPACING_SM },
})
