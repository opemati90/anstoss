import { useMemo, useState } from 'react'
import { Alert, Image, RefreshControl, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { FreeAgentProfile, TrialInvite } from '@anstoss/shared'
import { EmptyState } from '../../src/components/EmptyState'
import { ErrorState } from '../../src/components/ErrorState'
import { ModalHeader } from '../../src/components/ModalHeader'
import { Avatar, Button, Screen, SectionGroup, StatusPill, Text } from '../../src/components/ui'
import { useClubColors } from '../../src/context/ClubThemeContext'
import {
  hairline,
  RADIUS_CARD,
  RADIUS_MD,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXL,
} from '../../src/theme/tokens'
import { ApiError } from '../../src/api/client'
import { paths, wechselApi } from '../../src/features/wechsel/api'
import { CardListSkeleton } from '../../src/features/wechsel/components/Primitives'
import { apiErrorMessage, InviteSheet } from '../../src/features/wechsel/components/Sheets'
import {
  footLabel,
  formatDate,
  leagueLabel,
  ageLabel,
  positionLabel,
  regionLabel,
  statusChip,
} from '../../src/features/wechsel/format'
import { useManagedTeams, useWechselAccess } from '../../src/features/wechsel/hooks'
import { invalidateApi, useApiQuery } from '../../src/features/wechsel/query'
import { OPEN_STATUSES } from '../../src/features/wechsel/status'

/** A free agent's card as a club sees it, with "Zum Probetraining einladen". */
export default function FreeAgentDetailScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const { id } = useLocalSearchParams<{ id: string }>()
  const access = useWechselAccess()
  const { teams } = useManagedTeams()
  const profile = useApiQuery<FreeAgentProfile>(id ? paths.freeAgent(id) : null)
  const trials = useApiQuery<TrialInvite[]>(
    access.canManage && access.clubId ? paths.clubTrials(access.clubId) : null,
  )
  const [inviteOpen, setInviteOpen] = useState(false)
  const [sending, setSending] = useState(false)

  const openTrial = useMemo(
    () =>
      (trials.data ?? []).find(
        (invite) => invite.freeAgentProfileId === id && OPEN_STATUSES.includes(invite.status),
      ) ?? null,
    [trials.data, id],
  )

  const header = <ModalHeader title={t('wechsel.playerTitle')} mode="back" fallbackHref="/wechselboerse" />

  if (profile.isLoading) {
    return (
      <Screen header={header} padded={false} contentStyle={styles.content}>
        <CardListSkeleton rows={2} />
      </Screen>
    )
  }
  if (!profile.data) {
    const notFound = profile.error instanceof ApiError && profile.error.status === 404
    return (
      <Screen header={header} padded={false} contentStyle={styles.content}>
        {notFound ? (
          <EmptyState
            icon="person.crop.circle.badge.exclamationmark"
            title={t('wechsel.playerGoneTitle')}
            description={t('wechsel.playerGoneBody')}
          />
        ) : (
          <ErrorState
            message={t('wechsel.playerError')}
            hint={apiErrorMessage(t, profile.error)}
            onRetry={() => void profile.refetch()}
          />
        )}
      </Screen>
    )
  }

  const player = profile.data
  const facts: Array<{ label: string; value: string }> = [
    { label: t('spielerprofil.fieldPosition'), value: positionLabel(t, player.position) ?? '–' },
    { label: t('spielerprofil.fieldFoot'), value: footLabel(t, player.preferredFoot) ?? '–' },
    {
      label: t('spielerprofil.fieldLeague'),
      value: leagueLabel(t, player.highestLeague) ?? '–',
    },
    {
      label: t('spielerprofil.fieldCurrentClub'),
      value: player.currentClubName ?? t('spielerprofil.noClub'),
    },
    {
      label: t('spielerprofil.fieldAvailableFrom'),
      value:
        player.availableFrom && new Date(player.availableFrom).getTime() > Date.now()
          ? formatDate(player.availableFrom)
          : t('spielerprofil.availableNow'),
    },
    {
      label: t('spielerprofil.fieldArea'),
      // H2: clubs see the region, never the postcode.
      value: [regionLabel(t, player.postalRegion), player.city].filter(Boolean).join(' · ') || '–',
    },
  ]
  const photos = player.media.filter((media) => media.type === 'PHOTO')
  const chip = openTrial ? statusChip(t, openTrial) : null

  const sendInvite = async (input: { teamId: string; sessionEventIds: string[]; message?: string }) => {
    if (!access.clubId) return
    setSending(true)
    try {
      await wechselApi.createInvite(access.clubId, {
        freeAgentProfileId: player.id,
        teamId: input.teamId,
        sessionEventIds: input.sessionEventIds,
        message: input.message,
      })
      invalidateApi(paths.clubTrials(access.clubId))
      setInviteOpen(false)
      Alert.alert(t('wechsel.inviteSent', { name: player.user.name }))
    } catch (error) {
      Alert.alert(t('common.error'), apiErrorMessage(t, error))
    } finally {
      setSending(false)
    }
  }

  return (
    <Screen
      header={header}
      scroll
      padded={false}
      contentStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={profile.isRefetching}
          onRefresh={() => void profile.refetch()}
          tintColor={c.textTertiary}
        />
      }
    >
      <View style={styles.hero}>
        <Avatar size="xl" src={player.avatarUrl} fallbackText={player.user.name} />
        <Text variant="title1" color="primary" align="center">
          {player.user.name}
        </Text>
        <Text variant="subheadline" color="secondary" align="center">
          {[
            ageLabel(t, player),
            positionLabel(t, player.position),
            player.city,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {player.isOnTransferList ? (
          <StatusPill label={t('spielerprofil.searching')} tone="success" icon="checkmark.circle.fill" />
        ) : null}
      </View>

      {access.canManage ? (
        openTrial && chip ? (
          <View style={[styles.trialBox, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
            <View style={styles.flex}>
              <Text variant="headline" color="primary">
                {t('wechsel.trialRunning', { team: openTrial.team.displayName })}
              </Text>
              <Text variant="footnote" color="secondary">
                {chip.label}
              </Text>
            </View>
            <Button
              label={t('wechsel.openTrial')}
              variant="bordered"
              size="sm"
              onPress={() => router.push({ pathname: '/trial/[id]', params: { id: openTrial.id } })}
            />
          </View>
        ) : (
          <Button
            label={t('wechsel.inviteCta')}
            onPress={() => setInviteOpen(true)}
            disabled={teams.length === 0 || !player.isOnTransferList}
            fullWidth
          />
        )
      ) : null}

      <View style={[styles.facts, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
        {facts.map((fact) => (
          <View key={fact.label} style={styles.fact}>
            <Text variant="footnote" color="secondary">
              {fact.label}
            </Text>
            <Text variant="body" weight="semibold" color="primary">
              {fact.value}
            </Text>
          </View>
        ))}
      </View>

      {player.bio ? (
        <SectionGroup header={t('spielerprofil.sectionAbout')}>
          <Text variant="body" color="primary" style={styles.bio}>
            {player.bio}
          </Text>
        </SectionGroup>
      ) : null}

      {player.experience.length > 0 ? (
        <SectionGroup header={t('spielerprofil.sectionStations')}>
          {player.experience.map((entry) => (
            <View key={entry.id} style={styles.station}>
              <View style={styles.flex}>
                <Text variant="body" weight="semibold" color="primary">
                  {entry.clubName}
                </Text>
                <Text variant="footnote" color="secondary">
                  {entry.roleLabel}
                </Text>
              </View>
              {entry.fromYear ? (
                <Text variant="footnote" color="secondary" tabular>
                  {entry.toYear ? `${entry.fromYear}–${entry.toYear}` : `${entry.fromYear}–`}
                </Text>
              ) : null}
            </View>
          ))}
        </SectionGroup>
      ) : null}

      {photos.length > 0 ? (
        <View style={styles.photos}>
          {photos.slice(0, 6).map((photo) => (
            <Image
              key={photo.id}
              source={{ uri: photo.url }}
              style={[styles.photo, { backgroundColor: c.surfaceSunken }]}
              accessibilityIgnoresInvertColors
            />
          ))}
        </View>
      ) : null}

      {access.canManage && access.clubId ? (
        <InviteSheet
          visible={inviteOpen}
          onClose={() => setInviteOpen(false)}
          clubId={access.clubId}
          teams={teams}
          playerName={player.user.name}
          submitting={sending}
          onSubmit={(input) => void sendInvite(input)}
        />
      ) : null}
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
  hero: { alignItems: 'center', gap: SPACING_SM, paddingVertical: SPACING_SM },
  flex: { flex: 1, minWidth: 0 },
  trialBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACING_MD,
    padding: SPACING_LG,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: SPACING_SM,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  fact: {
    flexGrow: 1,
    flexBasis: 140,
    padding: SPACING_SM,
    gap: SPACING_XS,
  },
  bio: { padding: SPACING_MD },
  station: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM + SPACING_XS,
  },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_SM },
  photo: {
    flexGrow: 1,
    flexBasis: '30%',
    aspectRatio: 1,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
  },
})
