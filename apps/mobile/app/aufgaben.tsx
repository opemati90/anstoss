import { useCallback, useMemo, useState } from 'react'
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { RosterOpsSnapshot, TeamDutyAssignment, TeamDutyKind } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api, ApiError } from '../src/api/client'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { RosterSkeleton } from '../src/components/Skeleton'
import { Avatar, Button, Screen, SectionGroup, SoftIcon, Text } from '../src/components/ui'
import { hairline, radius, space } from '../src/theme/tokens'
import { dutyKindLabelKey, formatWeekdayDay } from '../src/components/squad/format'
import { rotateDuty, updateDuty } from '../src/components/squad/rosterApi'
import { useIsTeamCoach } from '../src/components/squad/useIsTeamCoach'
import { isOwnDuty } from '../src/components/squad/squadModel'

const DUTY_KINDS: TeamDutyKind[] = ['JERSEY_CLEANUP', 'LOCKER_ROOM', 'BIB_CLEANUP']

function dutyIcon(kind: string) {
  return kind === 'LOCKER_ROOM' ? 'building.2' : 'shirt'
}

/**
 * Aufgaben — the team's real duty rota (Trikotwäsche, Kabinendienst,
 * Leibchen) on the team duties API. Coaches assign the next person in the
 * rota and close duties; a player ticks off their own. Replaces the
 * mock-only duty roster and Trikotwart screens.
 */
export default function AufgabenScreen() {
  const { t } = useTranslation()
  const locale = getAppLocale(getAppLanguage())
  const { user, activeClub, activeTeamId } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const userId = user?.id ?? null
  const isCoach = useIsTeamCoach()

  const [snapshot, setSnapshot] = useState<RosterOpsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!clubId || !activeTeamId) {
      setLoading(false)
      return
    }
    try {
      const data = await api<RosterOpsSnapshot>(`/clubs/${clubId}/teams/${activeTeamId}/roster-ops`)
      setSnapshot(data ?? null)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [clubId, activeTeamId])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const pending = useMemo(
    () =>
      [...(snapshot?.kit.pending ?? [])].sort((a, b) =>
        (a.dueDate ?? a.createdAt).localeCompare(b.dueDate ?? b.createdAt),
      ),
    [snapshot],
  )
  // M2: a parent's "Deine Aufgaben" also holds their linked child's duty,
  // which they may tick off for the child.
  const mine = pending.filter((duty) => isOwnDuty(duty, userId))
  const hasChildDuty = mine.some((duty) => duty.viewerRelation === 'CHILD')
  // Own duties already sit under "Deine Aufgaben"; never list them twice.
  const others = pending.filter((duty) => !isOwnDuty(duty, userId))
  const recent = snapshot?.kit.recent ?? []

  const complete = async (duty: TeamDutyAssignment, status: 'COMPLETED' | 'SKIPPED') => {
    if (!clubId || !activeTeamId) return
    setPendingId(duty.id)
    try {
      await updateDuty(clubId, activeTeamId, duty.id, status)
      await load()
    } catch (err) {
      // M3: someone else closed the duty first; show the current state.
      if (err instanceof ApiError && err.status === 409) {
        Alert.alert(t('kader.errors.title'), t('kader.duties.changed'))
        await load()
      } else {
        Alert.alert(t('kader.errors.title'), t('kader.errors.saveFailed'))
      }
    } finally {
      setPendingId(null)
    }
  }

  const assignNext = async (kind: TeamDutyKind) => {
    if (!clubId || !activeTeamId) return
    setPendingId(kind)
    try {
      await rotateDuty(clubId, activeTeamId, kind)
      await load()
    } catch (err) {
      Alert.alert(
        t('kader.errors.title'),
        err instanceof ApiError && err.status === 400
          ? t('kader.duties.noEligible')
          : t('kader.errors.saveFailed'),
      )
    } finally {
      setPendingId(null)
    }
  }

  const dutyDetail = (duty: TeamDutyAssignment) =>
    [
      duty.assignedUser?.name ?? t('kader.duties.unknownPlayer'),
      duty.dueDate ? t('kader.duties.due', { date: formatWeekdayDay(duty.dueDate, locale) }) : null,
    ]
      .filter(Boolean)
      .join(' · ')

  const renderDuty = (duty: TeamDutyAssignment, canComplete: boolean, canSkip: boolean) => (
    <View key={duty.id} style={styles.dutyRow}>
      <SoftIcon name={dutyIcon(duty.kind)} size={32} />
      <View style={styles.dutyCopy}>
        <Text variant="body" weight="semibold" color="primary">
          {t(dutyKindLabelKey(duty.kind))}
        </Text>
        <Text variant="footnote" color="secondary">
          {dutyDetail(duty)}
        </Text>
      </View>
      {canComplete || canSkip ? (
        <View style={styles.dutyActions}>
          {canSkip ? (
            <Button
              label={t('kader.duties.skip')}
              variant="plain"
              size="sm"
              disabled={pendingId === duty.id}
              onPress={() => void complete(duty, 'SKIPPED')}
              accessibilityLabel={t('kader.duties.skipA11y', { duty: t(dutyKindLabelKey(duty.kind)) })}
            />
          ) : null}
          {canComplete ? (
            <Button
              label={t('kader.duties.done')}
              variant="tinted"
              size="sm"
              loading={pendingId === duty.id}
              disabled={pendingId === duty.id}
              onPress={() => void complete(duty, 'COMPLETED')}
              accessibilityLabel={t('kader.duties.doneA11y', { duty: t(dutyKindLabelKey(duty.kind)) })}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  )

  const header = <ModalHeader mode="back" title={t('kader.duties.title')} />

  if (loading && !snapshot) {
    return (
      <Screen header={header} padded={false}>
        <RosterSkeleton />
      </Screen>
    )
  }

  if (!snapshot) {
    return (
      <Screen header={header} padded={false}>
        <View style={styles.state}>
          {error ? (
            <ErrorState
              message={t('kader.errors.loadTitle')}
              hint={t('kader.errors.loadBody')}
              onRetry={() => {
                setLoading(true)
                void load()
              }}
              retryLabel={t('kader.actions.retry')}
            />
          ) : (
            <EmptyState
              icon="list.clipboard"
              title={t('kader.duties.noTeamTitle')}
              description={t('kader.duties.noTeamBody')}
            />
          )}
        </View>
      </Screen>
    )
  }

  const nothingYet = pending.length === 0 && recent.length === 0

  return (
    <Screen header={header} padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {nothingYet ? (
          <EmptyState
            icon="list.clipboard"
            title={t('kader.duties.emptyTitle')}
            description={isCoach ? t('kader.duties.emptyCoachBody') : t('kader.duties.emptyMemberBody')}
            compact
          />
        ) : null}

        {mine.length > 0 ? (
          <Group title={hasChildDuty ? t('kader.duties.mineFamily') : t('kader.duties.mine')}>
            {mine.map((duty) => renderDuty(duty, true, isCoach))}
          </Group>
        ) : null}

        {others.length > 0 ? (
          <Group title={isCoach ? t('kader.duties.open') : t('kader.duties.team')}>
            {others.map((duty) =>
              renderDuty(duty, isCoach, isCoach),
            )}
          </Group>
        ) : null}

        {isCoach ? (
          <SectionGroup header={t('kader.duties.assignTitle')} footer={t('kader.duties.assignFooter')}>
            {DUTY_KINDS.map((kind) => (
              <View key={kind} style={styles.dutyRow}>
                <SoftIcon name={dutyIcon(kind)} size={32} />
                <Text variant="body" color="primary" style={styles.dutyCopy}>
                  {t(dutyKindLabelKey(kind))}
                </Text>
                <Button
                  label={t('kader.duties.assignNext')}
                  variant="bordered"
                  size="sm"
                  loading={pendingId === kind}
                  disabled={pendingId === kind}
                  onPress={() => void assignNext(kind)}
                  accessibilityLabel={t('kader.duties.assignA11y', { duty: t(dutyKindLabelKey(kind)) })}
                  testID={`aufgaben-assign-${kind}`}
                />
              </View>
            ))}
          </SectionGroup>
        ) : null}

        {recent.length > 0 ? (
          <Group title={t('kader.duties.recent')}>
            {recent.map((duty) => (
              <View key={duty.id} style={styles.dutyRow}>
                <Avatar
                  size="md"
                  src={duty.assignedUser?.avatarUrl ?? null}
                  fallbackText={duty.assignedUser?.name ?? '?'}
                />
                <View style={styles.dutyCopy}>
                  <Text variant="body" color="primary">
                    {t(dutyKindLabelKey(duty.kind))}
                  </Text>
                  <Text variant="footnote" color="secondary">
                    {[
                      duty.assignedUser?.name ?? t('kader.duties.unknownPlayer'),
                      duty.status === 'COMPLETED'
                        ? t('kader.duties.doneOn', {
                            date: formatWeekdayDay(duty.completedAt ?? duty.updatedAt, locale),
                          })
                        : t('kader.duties.skipped'),
                    ].join(' · ')}
                  </Text>
                </View>
              </View>
            ))}
          </Group>
        ) : null}
      </ScrollView>
    </Screen>
  )

}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useClubColors()
  const rows = Array.isArray(children) ? children : [children]
  return (
    <View style={styles.group}>
      <Text variant="footnote" weight="semibold" color="secondary" style={styles.groupTitle}>
        {title}
      </Text>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        {rows.map((child, index) => (
          <View
            key={index}
            style={index > 0 ? { borderTopWidth: hairline, borderTopColor: c.borderSubtle } : undefined}
          >
            {child}
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'],
    gap: space.lg,
  },
  state: { flex: 1, justifyContent: 'center', paddingHorizontal: space.md },
  group: { gap: space.sm },
  groupTitle: { paddingHorizontal: space.xs },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  // Wraps at 320pt / large text: the actions drop under the copy instead of
  // squeezing it.
  dutyRow: {
    minHeight: 64,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm + 4,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
  },
  dutyCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 140, gap: space['2xs'] },
  dutyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.xs,
    flexGrow: 1,
  },
})
