/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { TrialInviteStatus, type TrialInvite } from '@anstoss/shared'
import { Screen, Button, Icon, Text } from '../../../src/components/ui'
import { EmptyState } from '../../../src/components/EmptyState'
import { LoadingBoundary } from '../../../src/components/LoadingBoundary'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api } from '../../../src/api/client'
import {
  TAB_BAR_CLEARANCE,
  fontSize,
  fonts,
  hairline,
  radius,
  space,
} from '../../../src/theme/tokens'
import { formatGermanShortDate } from '../../../src/utils/germanDate'

export default function InvitesTab() {
  const { t } = useTranslation()
  const { refreshUser } = useAuth()
  const c = useClubColors()
  const [invites, setInvites] = useState<TrialInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [decisionId, setDecisionId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await api<TrialInvite[]>('/me/trial-invites').catch(() => [])
      setInvites(list || [])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onRefresh = () => {
    setRefreshing(true)
    void load()
  }

  const decide = async (
    inviteId: string,
    status: TrialInviteStatus.ACCEPTED | TrialInviteStatus.DECLINED,
  ) => {
    setDecisionId(inviteId)
    try {
      const updated = await api<TrialInvite>(`/trial-invites/${inviteId}`, {
        method: 'PATCH',
        body: { status },
      })
      setInvites((cur) =>
        cur.map((inv) => (inv.id === inviteId ? updated : inv)),
      )
      await refreshUser()
    } catch (err) {
      Alert.alert(
        t('common.error'),
        err instanceof Error
          ? err.message
          : t('freeAgent.trialDecisionError', {
              defaultValue: 'Could not update the trial invite.',
            }),
      )
    } finally {
      setDecisionId(null)
    }
  }

  const pending = useMemo(
    () => invites.filter((i) => i.status === TrialInviteStatus.PENDING),
    [invites],
  )
  const past = useMemo(
    () => invites.filter((i) => i.status !== TrialInviteStatus.PENDING),
    [invites],
  )

  return (
    <Screen padded={false}>
      <View style={[styles.hero, { backgroundColor: c.background }]}>
        <Text variant="caption2" tracking="wide" weight="semibold" color="tertiary">
          {t('invites.eyebrow', { defaultValue: 'TRIALS · WAITING ON YOU' }).toUpperCase()}
        </Text>
        <Text variant="title2" weight="bold" color="primary" style={styles.heroTitle}>
          {pending.length === 0
            ? t('invites.heroEmpty', { defaultValue: 'No pending invites' })
            : pending.length === 1
              ? t('invites.heroOne', { defaultValue: '1 club waiting' })
              : t('invites.heroMany', {
                  defaultValue: '{{count}} clubs waiting',
                  count: pending.length,
                })}
        </Text>
        <Text variant="footnote" color="secondary" style={styles.heroSub}>
          {t('invites.heroSub', {
            defaultValue:
              'Accept to start training with the club. Declines are private.',
          })}
        </Text>
      </View>

      <LoadingBoundary isLoading={loading} skeleton={<View />}>
        {invites.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="envelope"
              title={t('invites.emptyTitle', { defaultValue: 'No invites yet' })}
              description={t('invites.emptyBody', {
                defaultValue:
                  'Clubs scouting your position will reach out here. Make sure your profile is public.',
              })}
            />
          </View>
        ) : (
          <FlatList
            data={[...pending, ...past]}
            keyExtractor={(i) => i.id}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: TAB_BAR_CLEARANCE + space.lg },
            ]}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
            renderItem={({ item }) => (
              <InviteCard
                invite={item}
                isDeciding={decisionId === item.id}
                onAccept={() => void decide(item.id, TrialInviteStatus.ACCEPTED)}
                onDecline={() => void decide(item.id, TrialInviteStatus.DECLINED)}
              />
            )}
          />
        )}
      </LoadingBoundary>
    </Screen>
  )
}

function InviteCard({
  invite,
  isDeciding,
  onAccept,
  onDecline,
}: {
  invite: TrialInvite
  isDeciding: boolean
  onAccept: () => void
  onDecline: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const isPending = invite.status === TrialInviteStatus.PENDING

  const statusColor =
    invite.status === TrialInviteStatus.ACCEPTED
      ? c.success
      : invite.status === TrialInviteStatus.DECLINED
        ? c.error
        : invite.status === TrialInviteStatus.EXPIRED
          ? c.textSecondary
          : c.primary

  return (
    <View
      style={[
        styles.card,
        { borderColor: c.borderDefault, backgroundColor: c.surface },
        isPending && { borderColor: c.primary, borderWidth: 1.5 },
      ]}
    >
      <View style={styles.cardHead}>
        <View
          style={[
            styles.crest,
            {
              backgroundColor: invite.club?.primaryColor || c.primary,
            },
          ]}
        >
          <Text style={[styles.crestLetter]}>
            {(invite.club?.name ?? '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardCopy}>
          <Text variant="callout" weight="semibold" color="primary" numberOfLines={1}>
            {invite.club?.name ?? ''}
          </Text>
          <Text variant="caption1" color="secondary" numberOfLines={1}>
            {invite.team?.displayName ?? ''}
          </Text>
        </View>
        <View
          style={[
            styles.statusPill,
            { borderColor: `${statusColor}33`, backgroundColor: `${statusColor}10` },
          ]}
        >
          <Text style={[styles.statusText, { color: statusColor }]}>
            {t(`freeAgent.trialStatus.${invite.status}`)}
          </Text>
        </View>
      </View>

      {invite.message ? (
        <Text variant="footnote" color="primary" style={styles.message} numberOfLines={4}>
          {invite.message}
        </Text>
      ) : null}

      {invite.sender?.name ? (
        <View style={styles.senderRow}>
          <Icon name="person.circle" size={14} color={c.textTertiary} />
          <Text variant="caption1" color="tertiary" numberOfLines={1}>
            {invite.sender.name}
          </Text>
          <View style={[styles.dot, { backgroundColor: c.textTertiary }]} />
          <Text variant="caption1" color="tertiary">
            {t('invites.expires', {
              defaultValue: 'Expires {{date}}',
              date: formatGermanShortDate(invite.expiresAt),
            })}
          </Text>
        </View>
      ) : null}

      {isPending ? (
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('freeAgent.decline', { defaultValue: 'Decline' })}
              variant="secondary"
              size="md"
              fullWidth
              onPress={onDecline}
              disabled={isDeciding}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t('freeAgent.accept', { defaultValue: 'Accept' })}
              variant="filled"
              size="md"
              fullWidth
              onPress={onAccept}
              disabled={isDeciding}
              loading={isDeciding}
            />
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: 4,
  },
  heroTitle: { letterSpacing: -0.4 },
  heroSub: { marginTop: 4 },
  list: {
    paddingHorizontal: space.md,
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: space.md,
    paddingTop: space['2xl'],
  },
  card: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  crest: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestLetter: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardCopy: {
    flex: 1,
    gap: 2,
  },
  statusPill: {
    minHeight: 26,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontFamily: fonts.label,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  message: {
    lineHeight: 20,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
})
