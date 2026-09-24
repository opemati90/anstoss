import { useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PlayerSearchStatus, type PlayerSearch } from '@anstoss/shared'
import { EmptyState } from '../../../components/EmptyState'
import { ErrorState } from '../../../components/ErrorState'
import { Button, Icon } from '../../../components/ui'
import { SPACING_MD } from '../../../theme/tokens'
import { paths, wechselApi, type TeamOption } from '../api'
import { GesuchCard } from '../components/Cards'
import { CardListSkeleton, SectionLabel } from '../components/Primitives'
import { apiErrorMessage, GesuchSheet } from '../components/Sheets'
import { invalidateApi, type ApiQuery } from '../query'

export function GesucheTab({
  clubId,
  query,
  teams,
}: {
  clubId: string
  query: ApiQuery<PlayerSearch[]>
  teams: TeamOption[]
}) {
  const { t } = useTranslation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const create = async (input: Parameters<typeof wechselApi.createSearch>[1]) => {
    setCreating(true)
    try {
      await wechselApi.createSearch(clubId, input)
      invalidateApi(paths.clubSearches(clubId))
      setSheetOpen(false)
    } catch (error) {
      Alert.alert(t('common.error'), apiErrorMessage(t, error))
    } finally {
      setCreating(false)
    }
  }

  const setStatus = async (search: PlayerSearch, status: PlayerSearch['status']) => {
    setBusyId(search.id)
    try {
      await wechselApi.updateSearch(clubId, search.id, { status })
      invalidateApi(paths.clubSearches(clubId))
    } catch (error) {
      Alert.alert(t('common.error'), apiErrorMessage(t, error))
    } finally {
      setBusyId(null)
    }
  }

  const all = query.data ?? []
  const open = all.filter((search) => search.status === 'OPEN')
  const closed = all.filter((search) => search.status !== 'OPEN')
  const canCreate = teams.length > 0

  let body: React.ReactNode
  if (query.isLoading) {
    body = <CardListSkeleton rows={2} />
  } else if (query.error && !query.data) {
    body = (
      <ErrorState
        message={t('wechsel.gesucheError')}
        hint={apiErrorMessage(t, query.error)}
        onRetry={() => void query.refetch()}
      />
    )
  } else if (all.length === 0) {
    body = (
      <EmptyState
        icon="megaphone"
        title={t('wechsel.gesucheEmptyTitle')}
        description={t('wechsel.gesucheEmptyBody')}
        actionLabel={canCreate ? t('wechsel.gesuchNew') : undefined}
        onAction={canCreate ? () => setSheetOpen(true) : undefined}
      />
    )
  } else {
    body = (
      <>
        <SectionLabel title={t('wechsel.gesucheOpen')} count={open.length} />
        {open.length === 0 ? (
          <EmptyState
            compact
            icon="megaphone"
            title={t('wechsel.gesucheNoneOpenTitle')}
            description={t('wechsel.gesucheNoneOpenBody')}
          />
        ) : (
          open.map((search) => (
            <GesuchCard
              key={search.id}
              search={search}
              variant="club"
              busy={busyId === search.id}
              onPrimary={() => void setStatus(search, PlayerSearchStatus.FILLED)}
              onSecondary={() => void setStatus(search, PlayerSearchStatus.CLOSED)}
            />
          ))
        )}
        {closed.length > 0 ? (
          <>
            <SectionLabel title={t('wechsel.gesucheClosed')} count={closed.length} />
            {closed.map((search) => (
              <GesuchCard
                key={search.id}
                search={search}
                variant="club"
                busy={busyId === search.id}
                onPrimary={() => void setStatus(search, PlayerSearchStatus.OPEN)}
              />
            ))}
          </>
        ) : null}
      </>
    )
  }

  return (
    <View style={styles.root}>
      {canCreate && all.length > 0 ? (
        <Button
          label={t('wechsel.gesuchNew')}
          variant="tinted"
          leftIcon={<Icon name="plus" size="sm" color="tint" />}
          onPress={() => setSheetOpen(true)}
          fullWidth
        />
      ) : null}
      {body}
      <GesuchSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        teams={teams}
        submitting={creating}
        onSubmit={(input) => void create(input)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: SPACING_MD },
})
