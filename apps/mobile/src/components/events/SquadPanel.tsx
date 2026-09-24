import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { EventDetail, EventSquad } from '@anstoss/shared'
import { api } from '../../api/client'
import { Avatar, Button, Icon, Text } from '../ui'
import { Skeleton } from '../Skeleton'
import { EmptyState } from '../EmptyState'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space, RADIUS_FULL, SPACING_XXS } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import { reasonLabel } from './eventFormat'

export type SquadPanelProps = {
  clubId: string
  event: EventDetail
  locale: string
  onOpenLineup: () => void
  /** Called after a publish so the parent can refetch the event. */
  onPublished: () => void
}

/**
 * Kader: the coach ticks who travels, preselected from the Zusagen, and
 * publishes once. Players see the published list and whether they are in it.
 */
export function SquadPanel({ clubId, event, locale, onOpenLineup, onPublished }: SquadPanelProps) {
  if (!event.viewer.canManage) {
    return <PublishedSquad event={event} locale={locale} />
  }
  return (
    <SquadEditor
      clubId={clubId}
      event={event}
      locale={locale}
      onOpenLineup={onOpenLineup}
      onPublished={onPublished}
    />
  )
}

function SquadEditor({ clubId, event, locale, onOpenLineup, onPublished }: SquadPanelProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [squad, setSquad] = useState<EventSquad | null>(null)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const data = await api<EventSquad>(`/clubs/${clubId}/events/${event.id}/squad`)
      setSquad(data)
      setSelected(new Set(initialSelection(data)))
    } catch {
      setError(true)
    }
  }, [clubId, event.id])

  useEffect(() => {
    void load()
  }, [load])

  const candidates = useMemo(
    () =>
      (squad?.candidates ?? [])
        .slice()
        .sort((a, b) =>
          a.rsvp === b.rsvp ? a.name.localeCompare(b.name) : a.rsvp === 'YES' ? -1 : 1,
        ),
    [squad],
  )

  const candidateIds = useMemo(() => new Set(candidates.map((member) => member.userId)), [candidates])
  const selectedCount = candidates.filter((member) => selected.has(member.userId)).length
  const dropouts = squad?.dropouts ?? []

  const toggle = (userId: string) => {
    Haptics.select()
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const publish = async () => {
    if (saving) return
    setSaving(true)
    try {
      const data = await api<EventSquad>(`/clubs/${clubId}/events/${event.id}/squad`, {
        method: 'PUT',
        // Only ids that are still candidates: someone who said Absage since
        // the list loaded is not sent (the server would drop them anyway).
        body: { userIds: Array.from(selected).filter((id) => candidateIds.has(id)), publish: true },
      })
      setSquad(data)
      setSelected(new Set(initialSelection(data)))
      Haptics.success()
      onPublished()
    } catch {
      Haptics.fail()
      Alert.alert(t('eventFlow.squad.publishFailedTitle'), t('eventFlow.squad.publishFailedBody'))
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <EmptyState
        compact
        icon="exclamationmark.circle"
        title={t('eventFlow.squad.loadError')}
        description={t('eventFlow.squad.loadErrorBody')}
        actionLabel={t('eventFlow.retry')}
        onAction={() => void load()}
      />
    )
  }

  if (!squad) {
    return (
      <View style={styles.root}>
        <Skeleton shape="card" height={56} />
        <Skeleton shape="card" height={220} />
      </View>
    )
  }

  const dropoutNotice =
    dropouts.length > 0 ? (
      <View
        style={[styles.notice, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}
        testID="squad-dropouts"
        accessibilityRole="alert"
      >
        <Icon name="exclamationmark.triangle.fill" size={20} color={c.warning} />
        <View style={styles.rowText}>
          {dropouts.map((dropout) => {
            const reason = dropout.cause === 'declined' ? reasonLabel(dropout.reason, t) : null
            return (
              <Text key={dropout.userId} variant="subheadline" weight="semibold" color="primary">
                {dropout.cause === 'left'
                  ? t('eventFlow.squad.dropoutLeft', { name: dropout.name })
                  : reason
                    ? t('eventFlow.squad.dropoutDeclinedReason', { name: dropout.name, reason })
                    : t('eventFlow.squad.dropoutDeclined', { name: dropout.name })}
              </Text>
            )
          })}
          <Text variant="footnote" color="secondary">
            {t('eventFlow.squad.dropoutHint')}
          </Text>
        </View>
      </View>
    ) : null

  if (candidates.length === 0) {
    if (dropoutNotice) return <View style={styles.root}>{dropoutNotice}</View>
    return (
      <EmptyState
        compact
        icon="person.2"
        title={t('eventFlow.squad.emptyTitle')}
        description={t('eventFlow.squad.emptyBody')}
      />
    )
  }

  const publishedLabel = squad.publishedAt
    ? t('eventFlow.squad.publishedAt', {
        date: new Intl.DateTimeFormat(locale, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit', hourCycle: 'h23',
          minute: '2-digit',
        }).format(new Date(squad.publishedAt)),
      })
    : t('eventFlow.squad.notPublished')

  return (
    <View style={styles.root}>
      {dropoutNotice}
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text variant="headline" weight="semibold" color="primary" tabular>
            {t('eventFlow.squad.selectedCount', { count: selectedCount })}
          </Text>
          <Text variant="footnote" color="secondary">
            {publishedLabel}
          </Text>
        </View>
        <Button
          label={t('eventFlow.squad.lineup')}
          variant="bordered"
          size="md"
          onPress={onOpenLineup}
          leftIcon={<Icon name="figure.soccer" size={14} color="primary" />}
          testID="squad-open-lineup"
        />
      </View>

      <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
        {candidates.map((member, index) => {
          const checked = selected.has(member.userId)
          const hint =
            member.rsvp === 'MAYBE' ? t('eventFlow.squad.maybeHint') : t('eventFlow.squad.yesHint')
          return (
            <Pressable
              key={member.userId}
              testID={`squad-member-${member.userId}`}
              onPress={() => toggle(member.userId)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={`${member.name}, ${hint}`}
              android_ripple={{ color: c.surfaceSunken }}
              style={({ pressed }) => [
                styles.row,
                index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
                pressed && { backgroundColor: c.surfaceSunken },
              ]}
            >
              <Avatar size="sm" src={member.avatarUrl} fallbackText={member.name} />
              <View style={styles.rowText}>
                <Text variant="body" color="primary" numberOfLines={1}>
                  {member.name}
                </Text>
                <Text variant="footnote" color="secondary" numberOfLines={1}>
                  {hint}
                </Text>
              </View>
              <View
                style={[
                  styles.check,
                  checked
                    ? { backgroundColor: c.primary, borderColor: c.primary }
                    : { borderColor: c.borderStrong },
                ]}
              >
                {checked ? <Icon name="checkmark" size={14} color={c.textInverse} /> : null}
              </View>
            </Pressable>
          )
        })}
      </View>

      <Button
        label={
          squad.publishedAt ? t('eventFlow.squad.republish') : t('eventFlow.squad.publish')
        }
        variant="filled"
        size="lg"
        fullWidth
        loading={saving}
        disabled={saving || selectedCount === 0}
        onPress={() => void publish()}
        testID="squad-publish"
      />
      <Text variant="footnote" color="secondary" style={styles.footnote}>
        {t('eventFlow.squad.publishHint')}
      </Text>
    </View>
  )
}

function PublishedSquad({ event, locale }: { event: EventDetail; locale: string }) {
  const { t } = useTranslation()
  const c = useClubColors()
  if (!event.squadPublishedAt) {
    return (
      <EmptyState
        compact
        icon="person.2"
        title={t('eventFlow.squad.pendingTitle')}
        description={t('eventFlow.squad.pendingBody')}
      />
    )
  }
  const nominated = event.rsvps
    .filter((entry) => entry.nominated)
    .sort((a, b) => a.user.name.localeCompare(b.user.name))
  const inSquad = Boolean(event.myNominated) || event.children.some((child) => child.nominated)
  return (
    <View style={styles.root}>
      <View style={[styles.notice, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
        <Icon
          name={inSquad ? 'checkmark.circle.fill' : 'person.2'}
          size={20}
          color={inSquad ? c.primary : c.textSecondary}
        />
        <View style={styles.rowText}>
          <Text variant="headline" weight="semibold" color="primary">
            {inSquad ? t('eventFlow.squad.youAreIn') : t('eventFlow.squad.published')}
          </Text>
          <Text variant="footnote" color="secondary">
            {new Intl.DateTimeFormat(locale, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            }).format(new Date(event.squadPublishedAt))}
          </Text>
        </View>
      </View>
      <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
        {nominated.map((entry, index) => (
          <View
            key={entry.userId}
            style={[
              styles.row,
              index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
            ]}
          >
            <Avatar size="sm" src={entry.user.avatarUrl} fallbackText={entry.user.name} />
            <Text variant="body" color="primary" numberOfLines={1} style={styles.rowText}>
              {entry.user.name}
            </Text>
          </View>
        ))}
      </View>
      {event.lineup ? (
        <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
          <View style={styles.row}>
            <Icon name="figure.soccer" size={18} color="secondary" />
            <Text variant="body" color="primary" style={styles.rowText}>
              {t('eventFlow.squad.lineupFormation', { formation: event.lineup.formation })}
            </Text>
          </View>
          {event.lineup.starters.map((player, index) => (
            <View
              key={`${player.slotId ?? index}-${player.name}`}
              style={[styles.row, { borderTopWidth: hairline, borderTopColor: c.borderSubtle }]}
            >
              <Text variant="subheadline" color="secondary" tabular style={styles.slot}>
                {player.position ?? ''}
              </Text>
              <Text variant="body" color="primary" numberOfLines={1} style={styles.rowText}>
                {player.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

/**
 * H1: the coach's preselection is the published Kader, limited to players who
 * can still be picked (said yes or maybe and are on the team). Before a first
 * publish it is everyone who said yes.
 */
function initialSelection(data: EventSquad): string[] {
  const candidateIds = new Set(data.candidates.map((member) => member.userId))
  const nominated = data.nominatedUserIds.filter((id) => candidateIds.has(id))
  if (nominated.length > 0 || data.publishedAt) return nominated
  return data.candidates.filter((member) => member.rsvp === 'YES').map((member) => member.userId)
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  headerText: { flex: 1, minWidth: 160, gap: SPACING_XXS },
  list: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + space.xs,
    minHeight: 52,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rowText: { flex: 1, minWidth: 0 },
  check: {
    width: 26,
    height: 26,
    borderRadius: RADIUS_FULL,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + space.xs,
    padding: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  slot: { width: 36 },
  footnote: { paddingHorizontal: space.xs },
})
