import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
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
  Text,
} from '../../../components/ui'
import { SPACING_LG, SPACING_MD, SPACING_SM } from '../../../theme/tokens'
import { buildQuery, paths } from '../api'
import { PlayerRow } from '../components/Cards'
import { CardListSkeleton } from '../components/Primitives'
import { apiErrorMessage } from '../components/Sheets'
import { LEAGUE_OPTIONS, POSITIONS, leagueLabel, positionLabel } from '../format'
import { useApiQuery } from '../query'

const RADII = [10, 25, 50, 100] as const
const PAGE = 20

export function SpielersucheTab() {
  const { t } = useTranslation()
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
        {items.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            onPress={() => router.push({ pathname: '/free-agent/[id]', params: { id: player.id } })}
          />
        ))}
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
        wrap
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
