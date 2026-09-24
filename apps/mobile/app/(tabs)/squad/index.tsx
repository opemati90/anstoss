import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { RosterOpsSnapshot } from '@anstoss/shared'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api } from '../../../src/api/client'
import { getAppLanguage, getAppLocale } from '../../../src/i18n'
import {
  Badge,
  BottomSheet,
  Button,
  Icon,
  ListRow,
  SectionGroup,
  SoftIcon,
  Text,
  type IconName,
} from '../../../src/components/ui'
import { EmptyState } from '../../../src/components/EmptyState'
import { ErrorState } from '../../../src/components/ErrorState'
import { RosterSkeleton } from '../../../src/components/Skeleton'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { hairline, radius, space, TAB_BAR_CLEARANCE } from '../../../src/theme/tokens'
import { KaderRow } from '../../../src/components/squad/KaderRow'
import { PlayerEditSheet } from '../../../src/components/squad/PlayerEditSheet'
import { InjurySheet } from '../../../src/components/squad/InjurySheet'
import { MEDIC_FEATURE_ENABLED } from '../../../src/components/squad/medicFeature'
import { useIsTeamCoach } from '../../../src/components/squad/useIsTeamCoach'
import { RequestsSheet } from '../../../src/components/squad/RequestsSheet'
import { SelfStatusSheet } from '../../../src/components/squad/SelfStatusSheet'
import { SheetHeader } from '../../../src/components/squad/SheetHeader'
import { formatWeekdayDay, lineLabel, messageBlockedLabel } from '../../../src/components/squad/format'
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
  const locale = getAppLocale(getAppLanguage())
  const { user, activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const userId = user?.id ?? null

  const [snapshot, setSnapshot] = useState<RosterOpsSnapshot | null>(null)
  const [nextEvent, setNextEvent] = useState<NextEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<KaderFilter>('ALL')
  const [offSquadOpen, setOffSquadOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState<KaderMember | null>(null)
  const [injuryOpen, setInjuryOpen] = useState(false)
  const [requestsOpen, setRequestsOpen] = useState(false)
  const [selfOpen, setSelfOpen] = useState(false)

  const isCoach = useIsTeamCoach()
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
      setNextEvent({ id: upcoming.id, title: detail?.title ?? upcoming.title, date: detail?.date ?? upcoming.date, byUser })
    } catch {
      if (current()) setNextEvent(null)
    }
  }, [clubId, activeTeamId])

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

  const sections = useMemo<Section[]>(() => {
    if (!model) return []
    const grouped: Section[] = groupKader(model, filter)
    if (isCoach && filter === 'ALL') {
      const offSquad = [...model.inactive, ...model.trials]
      if (offSquad.length > 0) {
        grouped.push({ key: 'OFF_SQUAD', data: offSquadOpen ? offSquad : [] })
      }
    }
    return grouped
  }, [model, filter, isCoach, offSquadOpen])

  const teamName = activeTeamAccess?.team?.displayName || snapshot?.team.displayName || ''
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

  /** Row press: nothing at all when there is nothing to do (H2). */
  const rowPress = (member: KaderMember) => {
    if (member.isSelf && !isCoach) return () => setSelfOpen(true)
    if (member.phase === 'TRIAL' || member.status === 'PENDING') return () => openMember(member)
    if (isCoach && !member.isCoach) return () => openMember(member)
    return canMessageMember(member) ? () => openMember(member) : undefined
  }

  const rowHint = (member: KaderMember) => {
    if (isCoach && !member.isCoach) return t('kader.row.editHint')
    if (member.isSelf) return undefined
    return canMessageMember(member)
      ? t('kader.row.messageHint')
      : (messageBlockedLabel(t, member.messageBlockedReason) ?? undefined)
  }

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
      <TabScreenHeader
        title={t('kader.title')}
        subtitle={
          model
            ? t('kader.subtitle', { team: teamName, count: model.squadCount })
            : teamName || undefined
        }
        actionIcon={isCoach ? 'ellipsis' : undefined}
        actionAccessibilityLabel={isCoach ? t('kader.menu.a11y') : undefined}
        onActionPress={isCoach ? () => setMenuOpen(true) : undefined}
      />

      {model && model.players.length > 0 ? (
        <SummaryLine
          counts={model.counts}
          filter={filter}
          onFilter={(kind) => setFilter((prev) => (prev === kind ? 'ALL' : kind))}
        />
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

      {isCoach && model && model.openRequests > 0 ? (
        <View style={[styles.bannerCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <ListRow
            compact
            title={t('kader.requestsBanner', { count: model.openRequests })}
            left={<SoftIcon name="person.badge.plus" size={28} />}
            showChevron
            onPress={() => setRequestsOpen(true)}
            testID="kader-requests-banner"
          />
        </View>
      ) : null}

      {nextEvent && model && model.players.length > 0 ? (
        <View style={styles.legend}>
          <Icon name="checkmark.circle.fill" size={14} color="success" />
          <Text variant="footnote" color="secondary" numberOfLines={2} style={styles.legendText}>
            {t('kader.rsvpLegend', {
              title: nextEvent.title,
              date: formatWeekdayDay(nextEvent.date, locale),
            })}
          </Text>
        </View>
      ) : null}

      {model?.selfPlayer && showSelfPin(model, filter) ? (
        <View style={styles.selfBlock}>
          <Text variant="footnote" weight="semibold" color="secondary" style={styles.sectionTitle}>
            {t('kader.self.section')}
          </Text>
          <View>
            <KaderRow member={model.selfPlayer} isFirst isLast={false} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('kader.self.change')}
              onPress={() => setSelfOpen(true)}
              android_ripple={{ color: c.borderSubtle }}
              testID="kader-self-status"
              style={({ pressed }) => [
                styles.selfAction,
                {
                  backgroundColor: pressed ? c.surfaceSunken : c.surface,
                  borderColor: c.borderDefault,
                },
              ]}
            >
              <Text variant="body" color="tint" weight="medium">
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
              <Button label={t('kader.showAll')} variant="plain" size="sm" onPress={() => setFilter('ALL')} />
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
              <Text variant="footnote" weight="semibold" color="secondary" style={styles.flex}>
                {t('kader.offSquad.title', { count: model.inactive.length + model.trials.length })}
              </Text>
              <Icon name={offSquadOpen ? 'chevron.up' : 'chevron.down'} size="sm" color="tertiary" />
            </Pressable>
          ) : (
            <View style={styles.sectionHeaderRow}>
              <Text variant="footnote" weight="semibold" color="secondary" style={styles.flex}>
                {lineLabel(t, section.key)}
              </Text>
              <Text variant="footnote" color="tertiary" tabular>
                {section.data.length}
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
          <CoachMenuSheet
            visible={menuOpen}
            onClose={() => setMenuOpen(false)}
            openRequests={model?.trials.filter((m) => m.phase === 'TRIAL').length ?? 0}
            onInjury={() => setInjuryOpen(true)}
          />
        </>
      ) : null}
    </View>
  )
}

function SummaryLine({
  counts,
  filter,
  onFilter,
}: {
  counts: Record<AvailabilityKind, number>
  filter: KaderFilter
  onFilter: (kind: AvailabilityKind) => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const parts = SUMMARY_ORDER.filter((kind) => kind === 'FIT' || counts[kind] > 0)
  const labelKey: Record<AvailabilityKind, string> = {
    FIT: 'kader.summary.fit',
    INJURED: 'kader.summary.injured',
    SUSPENDED: 'kader.summary.suspended',
    UNAVAILABLE: 'kader.summary.unavailable',
    AWAY: 'kader.summary.away',
  }
  return (
    <View style={styles.summary} accessibilityRole="tablist">
      {parts.map((kind, index) => {
        const selected = filter === kind
        const label = t(labelKey[kind], { count: counts[kind] })
        return (
          <View key={kind} style={styles.summaryItem}>
            {index > 0 ? (
              <Text variant="subheadline" color="tertiary">
                {'·'}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              accessibilityHint={t('kader.summary.filterHint')}
              onPress={() => onFilter(kind)}
              android_ripple={{ color: c.borderSubtle, borderless: false }}
              hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
              testID={`kader-summary-${kind}`}
              style={[
                styles.summaryChip,
                selected && { backgroundColor: c.surfaceSunken, borderColor: c.primary },
              ]}
            >
              <Text
                variant="subheadline"
                weight={selected ? 'semibold' : 'regular'}
                color={selected ? 'tint' : 'secondary'}
                tabular
              >
                {label}
              </Text>
            </Pressable>
          </View>
        )
      })}
    </View>
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

function CoachMenuSheet({
  visible,
  onClose,
  openRequests,
  onInjury,
}: {
  visible: boolean
  onClose: () => void
  openRequests: number
  onInjury: () => void
}) {
  const { t } = useTranslation()
  // Close first, then act: a push or a second sheet must not race the
  // closing modal.
  const go = (action: () => void) => {
    onClose()
    setTimeout(action, 250)
  }
  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <SheetHeader title={t('kader.menu.title')} cancelLabel={t('kader.actions.close')} onCancel={onClose} />
      <View style={styles.menuBody}>
        <SectionGroup>
          <ListRow
            title={t('kader.menu.invite')}
            left={<SoftIcon name="person.badge.plus" size={32} />}
            showChevron
            onPress={() => go(() => router.push('/invite'))}
            testID="kader-menu-invite"
          />
          <ListRow
            title={t('kader.menu.requests')}
            left={<SoftIcon name="figure.soccer" size={32} />}
            right={openRequests > 0 ? <Badge label={String(openRequests)} variant="club" /> : undefined}
            accessibilityLabel={
              openRequests > 0 ? `${t('kader.menu.requests')}, ${openRequests}` : t('kader.menu.requests')
            }
            showChevron
            onPress={() => go(() => router.push('/wechselboerse' as never))}
            testID="kader-menu-requests"
          />
          {MEDIC_FEATURE_ENABLED ? (
            <ListRow
              title={t('kader.menu.injury')}
              left={<SoftIcon name="heart" size={32} />}
              showChevron
              onPress={() => go(onInjury)}
              testID="kader-menu-injury"
            />
          ) : null}
          <ListRow
            title={t('kader.menu.parents')}
            left={<SoftIcon name="figure.and.child.holdinghands" size={32} />}
            showChevron
            onPress={() => go(() => router.push('/team-families'))}
            testID="kader-menu-parents"
          />
        </SectionGroup>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  pad: { paddingHorizontal: space.md, paddingTop: space.sm, gap: space.md },
  list: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    // Clear the floating tab bar so the last row isn't pinned under it.
    paddingBottom: TAB_BAR_CLEARANCE + space['2xl'],
  },
  headerBlock: { gap: space.md, marginBottom: space.md },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: space.xs },
  summaryItem: { flexDirection: 'row', alignItems: 'center' },
  summaryChip: {
    paddingHorizontal: space.xs + 2,
    paddingVertical: space['2xs'] + 2,
    borderRadius: radius.full,
    borderWidth: hairline,
    borderColor: 'transparent',
  },
  bannerCard: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  legendText: { flex: 1 },
  selfBlock: { gap: space.sm },
  selfAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    borderWidth: hairline,
    borderTopWidth: hairline,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderCurve: 'continuous',
  },
  sectionTitle: { paddingHorizontal: space.xs },
  sectionHeaderRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.xs,
    paddingBottom: space.sm,
  },
  sectionGap: { height: space.lg },
  filterEmpty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  footer: { marginTop: space.sm },
  menuBody: { paddingHorizontal: space.md, paddingTop: space.md },
})
