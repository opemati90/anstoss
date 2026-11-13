import { useEffect, useMemo, useState } from 'react'
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { PlayerSearch, TrialInvite } from '@anstoss/shared'
import { EmptyState } from '../../src/components/EmptyState'
import { ClubScreenHeader } from '../../src/components/club/ClubScreenHeader'
import {
  Badge,
  BottomSheet,
  Button,
  Icon,
  IconButton,
  ListRow,
  Screen,
  SectionGroup,
} from '../../src/components/ui'
import { useClubColors } from '../../src/context/ClubThemeContext'
import {
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_XL,
  SPACING_XXL,
} from '../../src/theme/tokens'
import { useSafeAreaInsetsSafe } from '../../src/utils/useSafeAreaInsetsSafe'
import { paths, wechselApi } from '../../src/features/wechsel/api'
import { apiErrorMessage, GesuchSheet } from '../../src/features/wechsel/components/Sheets'
import { GesucheTab } from '../../src/features/wechsel/club/GesucheTab'
import { ProbetrainingTab } from '../../src/features/wechsel/club/ProbetrainingTab'
import { SpielersucheTab } from '../../src/features/wechsel/club/SpielersucheTab'
import { WechselTab } from '../../src/features/wechsel/club/WechselTab'
import { stageOf } from '../../src/features/wechsel/format'
import { useManagedTeams, useWechselAccess } from '../../src/features/wechsel/hooks'
import { invalidateApi, useApiQuery } from '../../src/features/wechsel/query'
import { OPEN_STATUSES } from '../../src/features/wechsel/status'

type Segment = 'gesuche' | 'spieler' | 'probetraining' | 'wechsel'
const SEGMENTS: Segment[] = ['spieler', 'gesuche', 'probetraining', 'wechsel']
/** Design 22: "Vereinslose Spieler in 10 km Umkreis". */
const BOARD_RADIUS_KM = 10

/**
 * Wechselbörse (redesign 21): outlined back + title header, horizontal ink
 * chips for the four desks, grouped player rows with a one-tap
 * "Probetraining" invite, and a sticky "Gesuch veröffentlichen" footer on the
 * player search. The club's recruiting desk. Gesuche (what we are looking
 * for), Spielersuche (who is looking for a club), Probetraining (the trial
 * pipeline) and Wechsel (Aufnahmeantrag → Freigabe → Passantrag →
 * spielberechtigt). DFBnet stays the system of record for the pass.
 */
export default function WechselboerseScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const params = useLocalSearchParams<{ tab?: string }>()
  const access = useWechselAccess()
  const initial = SEGMENTS.includes(params.tab as Segment)
    ? (params.tab as Segment)
    : 'spieler'
  const [segment, setSegment] = useState<Segment>(initial)
  const [gesuchOpen, setGesuchOpen] = useState(false)
  const [creatingGesuch, setCreatingGesuch] = useState(false)
  const [desksOpen, setDesksOpen] = useState(false)
  const insets = useSafeAreaInsetsSafe()

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
      probetraining: list.filter(
        (invite) => stageOf(invite) !== 'DONE' && invite.status !== 'OFFERED',
      ).length,
      wechsel: list.filter(
        (invite) =>
          (invite.status === 'OFFERED' || invite.status === 'JOINED') &&
          !invite.joinRequest?.eligibleFrom,
      ).length,
    }
  }, [trials.data, searches.data])

  // Players with an open trial invite show "Eingeladen" in the search list.
  const invitedProfileIds = useMemo(
    () =>
      new Set(
        (trials.data ?? [])
          .filter((invite) => (OPEN_STATUSES as ReadonlyArray<string>).includes(invite.status))
          .map((invite) => invite.freeAgentProfileId),
      ),
    [trials.data],
  )

  const deskLabel: Record<Segment, string> = {
    gesuche: t('wechsel.tabGesuche'),
    spieler: t('wechsel.tabSpieler'),
    probetraining: t('wechsel.tabProbetraining'),
    wechsel: t('wechsel.tabWechsel'),
  }
  const deskCount: Record<Segment, number> = {
    gesuche: counts.gesuche,
    spieler: 0,
    probetraining: counts.probetraining,
    wechsel: counts.wechsel,
  }
  const otherOpen = counts.gesuche + counts.probetraining + counts.wechsel

  // Design 22: back + title + one muted line. The main view is the player
  // search ("Vereinslose Spieler in 10 km Umkreis"); Gesuche, Probetraining
  // and Wechsel sit behind the trailing button.
  const header = (
    <ClubScreenHeader
      title={t('wechsel.title')}
      subtitle={
        segment === 'spieler'
          ? t('wechsel.nearbySubtitle', { km: BOARD_RADIUS_KM })
          : deskLabel[segment]
      }
      titleSize={24}
      fallbackHref="/(tabs)"
      right={
        access.canManage ? (
          <View>
            <IconButton
              variant="outlined"
              accessibilityLabel={
                otherOpen > 0 ? `${t('wechsel.desksA11y')}, ${otherOpen}` : t('wechsel.desksA11y')
              }
              onPress={() => setDesksOpen(true)}
              testID="wechsel-desks"
            >
              <Icon name="ellipsis" size="md" color="primary" />
            </IconButton>
            {otherOpen > 0 ? (
              <View
                pointerEvents="none"
                style={[styles.dot, { backgroundColor: c.alertDot, borderColor: c.background }]}
              />
            ) : null}
          </View>
        ) : undefined
      }
    />
  )

  if (!access.canManage || !clubId) {
    return (
      <Screen padded={false} contentStyle={styles.content}>
        {header}
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

  const createGesuch = async (input: Parameters<typeof wechselApi.createSearch>[1]) => {
    setCreatingGesuch(true)
    try {
      await wechselApi.createSearch(clubId, input)
      invalidateApi(paths.clubSearches(clubId))
      setGesuchOpen(false)
      setSegment('gesuche')
    } catch (error) {
      Alert.alert(t('common.error'), apiErrorMessage(t, error))
    } finally {
      setCreatingGesuch(false)
    }
  }

  const showFooter = segment === 'spieler' && teams.length > 0

  return (
    <Screen padded={false} edges={['top', 'left', 'right']}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.textTertiary}
          />
        }
        contentContainerStyle={[
          styles.content,
          { paddingBottom: (showFooter ? 120 : SPACING_XXL) + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {header}
        <View style={styles.body}>
          {segment === 'gesuche' ? (
            <GesucheTab clubId={clubId} query={searches} teams={teams} />
          ) : null}
          {segment === 'spieler' ? (
            <SpielersucheTab
              clubId={clubId}
              teams={teams}
              invitedProfileIds={invitedProfileIds}
              board
              radius={BOARD_RADIUS_KM}
            />
          ) : null}
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
      </ScrollView>
      {showFooter ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: c.background,
              borderTopColor: c.borderDefault,
              paddingBottom: FOOTER_BOTTOM + insets.bottom,
            },
          ]}
        >
          <Button
            variant="bordered"
            size="lg"
            fullWidth
            label={t('wechsel.publishSearch', { defaultValue: 'Publish a search' })}
            leftIcon={<Icon name="megaphone" size={18} color="primary" />}
            onPress={() => setGesuchOpen(true)}
            testID="wechsel-publish-search"
          />
        </View>
      ) : null}
      <BottomSheet visible={desksOpen} onClose={() => setDesksOpen(false)} heightPct="auto">
        <View style={styles.desks}>
          <SectionGroup>
            {SEGMENTS.map((key) => (
              <ListRow
                key={key}
                title={deskLabel[key]}
                right={deskCount[key] > 0 ? <Badge label={String(deskCount[key])} variant="club" /> : undefined}
                accessibilityLabel={deskCount[key] > 0 ? `${deskLabel[key]}, ${deskCount[key]}` : deskLabel[key]}
                selected={segment === key}
                showChevron
                onPress={() => {
                  setSegment(key)
                  setDesksOpen(false)
                }}
                testID={`wechsel-desk-${key}`}
              />
            ))}
          </SectionGroup>
        </View>
      </BottomSheet>
      <GesuchSheet
        visible={gesuchOpen}
        onClose={() => setGesuchOpen(false)}
        teams={teams}
        submitting={creatingGesuch}
        onSubmit={(input) => void createGesuch(input)}
      />
    </Screen>
  )
}

// Design 22: 18pt rhythm; footer padding 12 / 32 (incl. home indicator).
const BOARD_GAP = 18
const FOOTER_BOTTOM = SPACING_XL
const DOT = 10

const styles = StyleSheet.create({
  content: {
    gap: BOARD_GAP,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: SPACING_MD,
    paddingBottom: SPACING_XXL,
  },
  body: { gap: SPACING_LG },
  desks: { paddingHorizontal: SCREEN_PADDING, paddingTop: SPACING_MD, paddingBottom: SPACING_XL },
  dot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: SPACING_MD,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
})
