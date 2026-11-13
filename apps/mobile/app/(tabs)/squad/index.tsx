import { eventDisplayTitle } from '../../../src/components/events/eventFormat'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { RosterOpsSnapshot } from '@anstoss/shared'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api } from '../../../src/api/client'
import {
  Badge,
  Button,
  FilterChipRow,
  Icon,
  ListRow,
  SearchBar,
  SectionGroup,
  SoftIcon,
  Text,
  type FilterChip,
  type IconName,
} from '../../../src/components/ui'
import { EmptyState } from '../../../src/components/EmptyState'
import { ErrorState } from '../../../src/components/ErrorState'
import { RosterSkeleton } from '../../../src/components/Skeleton'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import {
  INPUT_HEIGHT,
  RADIUS_CARD,
  RADIUS_INPUT,
  SCREEN_PADDING,
  space,
  TAB_BAR_CLEARANCE,
} from '../../../src/theme/tokens'
import { KaderRow } from '../../../src/components/squad/KaderRow'
import { PlayerEditSheet } from '../../../src/components/squad/PlayerEditSheet'
import { InjurySheet } from '../../../src/components/squad/InjurySheet'
import { MEDIC_FEATURE_ENABLED } from '../../../src/components/squad/medicFeature'
import { useIsTeamCoach } from '../../../src/components/squad/useIsTeamCoach'
import { attendanceFor, useTrainingAttendance } from '../../../src/components/squad/useTrainingAttendance'
import { RequestsSheet } from '../../../src/components/squad/RequestsSheet'
import { SelfStatusSheet } from '../../../src/components/squad/SelfStatusSheet'
import { lineLabel } from '../../../src/components/squad/format'
import {
  buildKader,
  canMessageMember,
  groupKader,
  jerseyHolders,
  pendingDutyCount,
  showSelfPin,
  type AvailabilityKind,
  type KaderFilter,
  type KaderMember,
  type KaderSectionKey,
  type RsvpAnswer,
} from '../../../src/components/squad/squadModel'

type FeedEvent = { id: string; title: string; date: string; cancelledAt?: string | null }
type DetailEvent = {
  id: string
  title: string
  date: string
  rsvps?: Array<{ status: RsvpAnswer; userId?: string; user?: { id: string } | null }>
}
type NextEvent = { id: string; title: string; date: string; byUser: Record<string, RsvpAnswer> }

type Section = { key: KaderSectionKey | 'OFF_SQUAD'; data: KaderMember[] }

/** The design's four attendance bars: the last four trainings. */
const ROW_TRAININGS = 4

const SUMMARY_ORDER: AvailabilityKind[] = ['FIT', 'INJURED', 'SUSPENDED', 'UNAVAILABLE', 'AWAY']

/**
 * Kader — the Team tab. One list of the people, grouped the way a coach
 * thinks about them (TW, Abwehr, Mittelfeld, Sturm, Trainerteam), with each
 * player's availability and answer for the next event on their row. Team
 * tools sit below as three rows. Everything a coach changes about a player
 * lives in PlayerEditSheet; players change their own Urlaub from the pinned
 * "Du" row.
 */
export default function KaderScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const { user, activeClub, activeTeamId } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const userId = user?.id ?? null

  const [snapshot, setSnapshot] = useState<RosterOpsSnapshot | null>(null)
  const [nextEvent, setNextEvent] = useState<NextEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<KaderFilter>('ALL')
  const [query, setQuery] = useState('')
  const [offSquadOpen, setOffSquadOpen] = useState(false)
  const [editing, setEditing] = useState<KaderMember | null>(null)
  const [injuryOpen, setInjuryOpen] = useState(false)
  const [requestsOpen, setRequestsOpen] = useState(false)
  const [selfOpen, setSelfOpen] = useState(false)

  const isCoach = useIsTeamCoach()
  const { attendance, reload: reloadAttendance } = useTrainingAttendance(clubId, activeTeamId, ROW_TRAININGS)
  // Ignore responses for a team the user has already switched away from.
  const teamRef = useRef(activeTeamId)
  teamRef.current = activeTeamId
  // L3: a request sequence per load, so an older response that lands after
  // a newer one (focus + pull-to-refresh + save reload) never overwrites it.
  const snapshotSeq = useRef(0)
  const eventSeq = useRef(0)
  useEffect(() => {
    setSnapshot(null)
    setNextEvent(null)
    setLoading(true)
    setFilter('ALL')
    setQuery('')
  }, [activeTeamId])

  const fetchSnapshot = useCallback(async () => {
    if (!clubId || !activeTeamId) {
      setLoading(false)
      return
    }
    const requestedTeam = activeTeamId
    const seq = ++snapshotSeq.current
    const current = () => teamRef.current === requestedTeam && snapshotSeq.current === seq
    try {
      const data = await api<RosterOpsSnapshot>(`/clubs/${clubId}/teams/${activeTeamId}/roster-ops`)
      if (!current()) return
      setSnapshot(data && Array.isArray(data.squad) ? data : null)
      setError(false)
    } catch {
      if (current()) setError(true)
    } finally {
      if (current()) setLoading(false)
    }
  }, [clubId, activeTeamId])

  // Answers for the next event ride on the roster. Separate request on
  // purpose: the roster answers "who is on the team", the event "who is
  // coming", and either can fail without taking the other down.
  const fetchNextEvent = useCallback(async () => {
    if (!clubId || !activeTeamId) return
    const requestedTeam = activeTeamId
    const seq = ++eventSeq.current
    const current = () => teamRef.current === requestedTeam && eventSeq.current === seq
    try {
      const params = new URLSearchParams({ teamId: activeTeamId, scope: 'upcoming' })
      const feed = await api<FeedEvent[]>(`/clubs/${clubId}/events?${params.toString()}`)
      const upcoming = (Array.isArray(feed) ? feed : []).find((event) => !event.cancelledAt)
      if (!current()) return
      if (!upcoming) {
        setNextEvent(null)
        return
      }
      const detail = await api<DetailEvent>(`/clubs/${clubId}/events/${upcoming.id}`)
      const byUser: Record<string, RsvpAnswer> = {}
      for (const rsvp of detail?.rsvps ?? []) {
        const id = rsvp?.userId ?? rsvp?.user?.id
        if (id) byUser[id] = rsvp.status
      }
      if (!current()) return
      setNextEvent({
        id: upcoming.id,
        // Reader-language title ("Auswärtsspiel bei X"), never the stored
        // fallback or a legacy "@ X".
        title: eventDisplayTitle({ ...upcoming, ...(detail ?? {}) } as never, t),
        date: detail?.date ?? upcoming.date,
        byUser,
      })
    } catch {
      if (current()) setNextEvent(null)
    }
  }, [clubId, activeTeamId, t])

  useFocusEffect(
    useCallback(() => {
      void fetchSnapshot()
      void fetchNextEvent()
    }, [fetchSnapshot, fetchNextEvent]),
  )

  const reload = useCallback(() => {
    void fetchSnapshot()
    void fetchNextEvent()
  }, [fetchSnapshot, fetchNextEvent])

  const onRefresh = async () => {
    setRefreshing(true)
    reloadAttendance()
    try {
      await Promise.all([fetchSnapshot(), fetchNextEvent()])
    } finally {
      setRefreshing(false)
    }
  }

  const model = useMemo(
    () =>
      snapshot
        ? buildKader(snapshot, { userId, rsvpByUser: nextEvent ? nextEvent.byUser : null })
        : null,
    [snapshot, userId, nextEvent],
  )

  // "Spieler suchen": name, position or shirt number, across every section.
  const needle = query.trim().toLocaleLowerCase()
  const matches = useCallback(
    (member: KaderMember) =>
      !needle ||
      member.name.toLocaleLowerCase().includes(needle) ||
      (member.position ?? '').toLocaleLowerCase().includes(needle) ||
      (member.jerseyNumber != null && String(member.jerseyNumber) === needle),
    [needle],
  )

  const sections = useMemo<Section[]>(() => {
    if (!model) return []
    const grouped: Section[] = groupKader(model, filter)
      .map((section) => ({ ...section, data: section.data.filter(matches) }))
      .filter((section) => section.data.length > 0)
    if (isCoach && filter === 'ALL') {
      const offSquad = [...model.inactive, ...model.trials].filter(matches)
      if (offSquad.length > 0) {
        grouped.push({ key: 'OFF_SQUAD', data: offSquadOpen || needle ? offSquad : [] })
      }
    }
    return grouped
  }, [model, filter, isCoach, offSquadOpen, matches, needle])

  const dutyBadge = pendingDutyCount(snapshot, userId, isCoach)

  const openMember = (member: KaderMember) => {
    if (member.phase === 'TRIAL' || member.status === 'PENDING') {
      setRequestsOpen(true)
      return
    }
    if (isCoach && !member.isCoach) {
      setEditing(member)
      return
    }
    // H2: only offer a private chat the DM API will actually allow.
    if (!canMessageMember(member)) return
    openMessage(member)
  }

  const openMessage = (member: KaderMember) => {
    if (!canMessageMember(member)) return
    router.push({ pathname: '/dm-chat', params: { userId: member.userId, userName: member.name } })
  }

  /**
   * Row press (board 16 → 17): every squad member opens their profile;
   * trials and pending requests open the requests sheet. Editing and the
   * private chat live on the profile (edit icon, Rollen, Nachricht).
   */
  const rowPress = (member: KaderMember) => {
    if (member.phase === 'TRIAL' || member.status === 'PENDING') return () => openMember(member)
    return () => router.push({ pathname: '/member/[id]', params: { id: member.userId } })
  }

  const rowHint = (member: KaderMember) =>
    member.phase === 'TRIAL' || member.status === 'PENDING' ? undefined : t('kader.row.profileHint')

  if (!activeClub || !activeTeamId) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <View style={styles.pad}>
          <TabScreenHeader title={t('kader.title')} />
          <EmptyState
            icon="person.2.fill"
            title={!activeClub ? t('kader.empty.noClubTitle') : t('kader.empty.noTeamTitle')}
            description={!activeClub ? t('kader.empty.noClubBody') : t('kader.empty.noTeamBody')}
          />
        </View>
      </View>
    )
  }

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.titleRow}>
        <Text variant="largeTitle" color="primary" accessibilityRole="header" style={styles.flex}>
          {t('kader.title')}
        </Text>
        {isCoach ? (
          <Button
            label={t('kader.invite', { defaultValue: 'Invite' })}
            size="sm"
            leftIcon={<Icon name="plus" size={16} color={c.onInk} />}
            onPress={() => router.push('/invite')}
            style={styles.inviteButton}
            testID="kader-invite"
          />
        ) : null}
      </View>

      {model && model.players.length > 0 ? (
        <>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder={t('kader.search', { defaultValue: 'Search players' })}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            containerStyle={styles.search}
            testID="kader-search"
          />
          <SummaryLine
            counts={model.counts}
            // "Alle 22": the one squad number (roster-ops squadCount).
            total={model.squadCount}
            filter={filter}
            requests={isCoach ? model.openRequests : 0}
            onRequests={() => setRequestsOpen(true)}
            onFilter={(kind) => setFilter((prev) => (kind === 'ALL' || prev === kind ? 'ALL' : kind))}
          />
        </>
      ) : null}

      {model && model.players.length === 0 ? (
        <EmptyState
          icon="person.2.fill"
          title={isCoach ? t('kader.empty.coachTitle') : t('kader.empty.memberTitle')}
          description={isCoach ? t('kader.empty.coachBody') : t('kader.empty.memberBody')}
          actionLabel={isCoach ? t('kader.menu.invite') : undefined}
          onAction={isCoach ? () => router.push('/invite') : undefined}
          compact
        />
      ) : null}

      {model?.selfPlayer && showSelfPin(model, filter) && !needle ? (
        <View style={styles.selfBlock}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            {t('kader.self.section')}
          </Text>
          <View>
            <KaderRow
              member={model.selfPlayer}
              isFirst
              isLast={false}
              attendance={attendanceFor(attendance, model.selfPlayer.userId, ROW_TRAININGS)}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('kader.self.change')}
              onPress={() => setSelfOpen(true)}
              android_ripple={{ color: c.borderSubtle }}
              testID="kader-self-status"
              style={({ pressed }) => [
                styles.selfAction,
                {
                  backgroundColor: pressed ? c.surfaceMuted : c.surface,
                  borderTopColor: c.borderSubtle,
                },
              ]}
            >
              <Text variant="body" color="primary" weight="semibold">
                {t('kader.self.change')}
              </Text>
              <Icon name="chevron.right" size="sm" color="tertiary" />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  )

  const footer = model ? (
    <View style={styles.footer}>
      <SectionGroup header={t('kader.tools.title')}>
        <ToolRow
          icon="list.clipboard"
          title={t('kader.tools.duties')}
          subtitle={t('kader.tools.dutiesHint')}
          count={dutyBadge}
          onPress={() => router.push('/aufgaben')}
          testID="kader-tool-duties"
        />
        <ToolRow
          icon="calendar"
          title={t('kader.tools.matches')}
          subtitle={t('kader.tools.matchesHint')}
          onPress={() => router.push('/team-spiele')}
          testID="kader-tool-matches"
        />
        <ToolRow
          icon="chart.bar"
          title={t('kader.tools.stats')}
          subtitle={t('kader.tools.statsHint')}
          onPress={() => router.push('/team-stats')}
          testID="kader-tool-stats"
        />
        {isCoach ? (
          <ToolRow
            icon="arrow.left.arrow.right"
            title={t('kader.menu.requests')}
            subtitle={t('kader.tools.exchangeHint')}
            count={model.trials.filter((m) => m.phase === 'TRIAL').length}
            onPress={() => router.push('/wechselboerse' as never)}
            testID="kader-menu-requests"
          />
        ) : null}
        {isCoach ? (
          <ToolRow
            icon="figure.and.child.holdinghands"
            title={t('kader.menu.parents')}
            subtitle={t('kader.tools.parentsHint')}
            onPress={() => router.push('/team-families')}
            testID="kader-menu-parents"
          />
        ) : null}
        {isCoach && MEDIC_FEATURE_ENABLED ? (
          <ToolRow
            icon="heart"
            title={t('kader.menu.injury')}
            subtitle={t('kader.tools.injuryHint')}
            onPress={() => setInjuryOpen(true)}
            testID="kader-menu-injury"
          />
        ) : null}
      </SectionGroup>
    </View>
  ) : null

  const renderBody = () => {
    if (loading && !snapshot) {
      return (
        <View style={styles.pad}>
          {header}
          <RosterSkeleton />
        </View>
      )
    }
    if (!snapshot || !model) {
      return (
        <View style={styles.pad}>
          {header}
          {error ? (
            <ErrorState
              message={t('kader.errors.loadTitle')}
              hint={t('kader.errors.loadBody')}
              onRetry={() => {
                setLoading(true)
                reload()
              }}
              retryLabel={t('kader.actions.retry')}
            />
          ) : (
            <EmptyState
              icon="person.2.fill"
              title={isCoach ? t('kader.empty.coachTitle') : t('kader.empty.memberTitle')}
              description={isCoach ? t('kader.empty.coachBody') : t('kader.empty.memberBody')}
              actionLabel={isCoach ? t('kader.menu.invite') : undefined}
              onAction={isCoach ? () => router.push('/invite') : undefined}
            />
          )}
        </View>
      )
    }

    return (
      <SectionList<KaderMember, Section>
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        // An amateur squad is 20-30 rows: render them all up front so a
        // fast scroll never shows blank cells.
        initialNumToRender={40}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          model.players.length > 0 ? (
            <View style={styles.filterEmpty}>
              <Text variant="body" color="secondary">
                {t('kader.filterEmpty')}
              </Text>
              <Button label={t('kader.showAll')} variant="plain" size="sm" onPress={() => {
                  setFilter('ALL')
                  setQuery('')
                }}
              />
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) =>
          section.key === 'OFF_SQUAD' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: offSquadOpen }}
              accessibilityLabel={t('kader.offSquad.title', {
                count: model.inactive.length + model.trials.length,
              })}
              onPress={() => setOffSquadOpen((open) => !open)}
              android_ripple={{ color: c.borderSubtle }}
              style={styles.sectionHeaderRow}
              testID="kader-off-squad-toggle"
            >
              <Text variant="label" color="secondary" style={styles.flex}>
                {t('kader.offSquad.title', { count: model.inactive.length + model.trials.length })}
              </Text>
              <Icon name={offSquadOpen ? 'chevron.up' : 'chevron.down'} size="sm" color="tertiary" />
            </Pressable>
          ) : (
            <View style={styles.sectionHeaderRow} accessibilityRole="header">
              <Text variant="label" color="secondary" style={styles.flex}>
                {`${lineLabel(t, section.key)} · ${section.data.length}`}
              </Text>
            </View>
          )
        }
        renderSectionFooter={() => <View style={styles.sectionGap} />}
        renderItem={({ item, index, section }) => (
          <KaderRow
            member={item}
            isFirst={index === 0}
            isLast={index === section.data.length - 1}
            onPress={rowPress(item)}
            actionHint={rowHint(item)}
            attendance={attendanceFor(attendance, item.userId, ROW_TRAININGS)}
            testID={`kader-row-${item.userId}`}
          />
        )}
      />
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      {renderBody()}

      {clubId && activeTeamId ? (
        <>
          <PlayerEditSheet
            visible={Boolean(editing)}
            member={editing}
            clubId={clubId}
            teamId={activeTeamId}
            onClose={() => setEditing(null)}
            onSaved={reload}
            onMessage={(member) => setTimeout(() => openMessage(member), 250)}
            takenNumbers={jerseyHolders(model, editing?.userId ?? null)}
          />
          {MEDIC_FEATURE_ENABLED ? (
            <InjurySheet
              visible={injuryOpen}
              onClose={() => setInjuryOpen(false)}
              onSaved={reload}
              clubId={clubId}
              teamId={activeTeamId}
              players={model?.players ?? []}
            />
          ) : null}
          <RequestsSheet
            visible={requestsOpen}
            onClose={() => setRequestsOpen(false)}
            onChanged={reload}
            onOpenExchange={() => router.push('/wechselboerse' as never)}
            clubId={clubId}
            requests={model?.trials ?? []}
          />
          <SelfStatusSheet
            visible={selfOpen}
            member={model?.selfPlayer ?? null}
            clubId={clubId}
            teamId={activeTeamId}
            onClose={() => setSelfOpen(false)}
            onSaved={reload}
          />
        </>
      ) : null}
    </View>
  )
}

/**
 * The design's segmented filter: "Alle 22 · 19 fit · 2 gesperrt …" as ink
 * chips. A second tap on the selected chip goes back to Alle.
 */
function SummaryLine({
  counts,
  total,
  filter,
  requests,
  onRequests,
  onFilter,
}: {
  counts: Record<AvailabilityKind, number>
  total: number
  filter: KaderFilter
  /** Trials + coach requests: a last chip that opens the requests sheet. */
  requests: number
  onRequests: () => void
  onFilter: (kind: KaderFilter) => void
}) {
  const { t } = useTranslation()
  const parts = SUMMARY_ORDER.filter((kind) => kind === 'FIT' || counts[kind] > 0)
  const REQUESTS = 'REQUESTS' as KaderFilter
  const labelKey: Record<AvailabilityKind, string> = {
    FIT: 'kader.summary.fit',
    INJURED: 'kader.summary.injured',
    SUSPENDED: 'kader.summary.suspended',
    UNAVAILABLE: 'kader.summary.unavailable',
    AWAY: 'kader.summary.away',
  }
  const chips: FilterChip<KaderFilter>[] = [
    {
      key: 'ALL',
      label: t('kader.summary.all', { count: total, defaultValue: 'All {{count}}' }),
      testID: 'kader-summary-ALL',
    },
    ...parts.map((kind) => ({
      key: kind,
      label: t(labelKey[kind], { count: counts[kind] }),
      testID: `kader-summary-${kind}`,
    })),
    ...(requests > 0
      ? [{ key: REQUESTS, label: t('kader.summary.requests', { n: requests }), testID: 'kader-requests-banner' }]
      : []),
  ]
  return (
    <FilterChipRow<KaderFilter>
      chips={chips}
      selected={filter}
      onToggle={(key) => (key === REQUESTS ? onRequests() : onFilter(key))}
      singleSelect
      contentStyle={styles.chips}
      testID="kader-summary"
    />
  )
}

function ToolRow({
  icon,
  title,
  subtitle,
  count = 0,
  onPress,
  testID,
}: {
  icon: IconName
  title: string
  subtitle: string
  count?: number
  onPress: () => void
  testID?: string
}) {
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      left={<SoftIcon name={icon} size={32} />}
      right={count > 0 ? <Badge label={String(count)} variant="club" /> : undefined}
      showChevron
      onPress={onPress}
      accessibilityLabel={count > 0 ? `${title}, ${count}` : title}
      testID={testID}
    />
  )
}

// Design "Kader": 18pt between header blocks, 10pt label → group, 44pt invite pill.
const HEADER_GAP = 18
const SECTION_LABEL_GAP = 10
const INVITE_HEIGHT = 44

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  pad: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.sm, gap: space.md },
  list: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.sm,
    // Clear the floating tab bar so the last row isn't pinned under it.
    paddingBottom: TAB_BAR_CLEARANCE + space['2xl'],
  },
  headerBlock: { gap: HEADER_GAP, marginBottom: HEADER_GAP + space['2xs'] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  inviteButton: { height: INVITE_HEIGHT, borderRadius: INVITE_HEIGHT / 2 },
  search: { height: INPUT_HEIGHT, borderRadius: RADIUS_INPUT, borderCurve: 'continuous' },
  chips: { paddingHorizontal: 0 },
  selfBlock: { gap: space.sm + 2 },
  selfAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: RADIUS_CARD,
    borderBottomRightRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  sectionTitle: { paddingHorizontal: space['2xs'] },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space['2xs'],
    paddingBottom: SECTION_LABEL_GAP,
  },
  sectionGap: { height: HEADER_GAP + space['2xs'] },
  filterEmpty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  footer: { marginTop: space.sm },
})
