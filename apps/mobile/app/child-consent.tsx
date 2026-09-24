import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActionSheetIOS,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Skeleton } from '../src/components/Skeleton'
import {
  Banner,
  ListRow,
  Screen,
  SectionGroup,
  SoftIcon,
  Text,
  type IconName,
} from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { RADIUS_CARD, space } from '../src/theme/tokens'

/**
 * Privacy: guardian consent overview + withdrawal (GDPR Art. 7(3)).
 *
 * Lists every parental consent the signed-in guardian gave or was asked for,
 * grouped by child. An approved consent can be withdrawn behind one native
 * destructive confirmation that spells out the effect. Re-granting runs
 * through the normal club consent request, so the screen only explains it.
 *
 * API: GET /consent/mine, POST /consent/:id/withdraw
 */

type ConsentStatus = 'APPROVED' | 'PENDING' | 'WITHDRAWN'

type GuardianConsent = {
  id: string
  status: ConsentStatus
  requestedAt: string
  approvedAt: string | null
  withdrawnAt: string | null
  club: { id: string; name: string; badgeUrl: string | null }
  team: { id: string; displayName: string }
  player: { id: string; name: string | null; avatarUrl: string | null }
}

type ChildGroup = { playerId: string; name: string; consents: GuardianConsent[] }

const STATUS_ORDER: Record<ConsentStatus, number> = { APPROVED: 0, PENDING: 1, WITHDRAWN: 2 }

export default function ChildConsentScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())
  const [consents, setConsents] = useState<GuardianConsent[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const rows = await api<GuardianConsent[]>('/consent/mine')
      setConsents(Array.isArray(rows) ? rows : [])
      setLoadFailed(false)
    } catch {
      // Never leave a stuck skeleton: a failed load resolves to the error state.
      setLoadFailed(true)
      setConsents((prev) => prev ?? [])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }, [load])

  const formatDate = useCallback(
    (iso: string | null) => {
      if (!iso) return ''
      try {
        return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso))
      } catch {
        return new Date(iso).toLocaleDateString()
      }
    },
    [locale],
  )

  const groups = useMemo<ChildGroup[]>(() => {
    const byChild = new Map<string, ChildGroup>()
    for (const consent of consents ?? []) {
      const key = consent.player.id
      const group = byChild.get(key) ?? {
        playerId: key,
        name: consent.player.name ?? '',
        consents: [],
      }
      group.consents.push(consent)
      byChild.set(key, group)
    }
    const list = [...byChild.values()]
    for (const group of list) {
      group.consents.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, locale))
  }, [consents, locale])

  const hasWithdrawn = (consents ?? []).some((consent) => consent.status === 'WITHDRAWN')

  const withdraw = useCallback(
    async (consent: GuardianConsent) => {
      const name = consent.player.name ?? ''
      const team = consent.team.displayName
      setWithdrawingId(consent.id)
      try {
        const updated = await api<Partial<GuardianConsent>>(`/consent/${consent.id}/withdraw`, {
          method: 'POST',
          body: {},
        })
        setConsents((prev) =>
          (prev ?? []).map((row) =>
            row.id === consent.id
              ? {
                  ...row,
                  status: 'WITHDRAWN',
                  withdrawnAt:
                    typeof updated?.withdrawnAt === 'string'
                      ? updated.withdrawnAt
                      : new Date().toISOString(),
                }
              : row,
          ),
        )
        Alert.alert(t('childConsent.withdrawnTitle'), t('childConsent.withdrawnBody', { name, team }))
      } catch {
        Alert.alert(t('childConsent.withdrawFailedTitle'), t('childConsent.withdrawFailedBody'))
      } finally {
        setWithdrawingId(null)
      }
    },
    [t],
  )

  // One native destructive confirmation that explains the effect. iOS: action
  // sheet; Android: system dialog (hardware back dismisses it as Cancel).
  const confirmWithdraw = useCallback(
    (consent: GuardianConsent) => {
      const vars = {
        name: consent.player.name ?? '',
        team: consent.team.displayName,
        club: consent.club.name,
      }
      const title = t('childConsent.confirmTitle', vars)
      const message = t('childConsent.confirmBody', vars)
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title,
            message,
            options: [t('childConsent.confirmCta'), t('common.cancel')],
            destructiveButtonIndex: 0,
            cancelButtonIndex: 1,
          },
          (index) => {
            if (index === 0) void withdraw(consent)
          },
        )
        return
      }
      Alert.alert(
        title,
        message,
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('childConsent.confirmCta'),
            style: 'destructive',
            onPress: () => void withdraw(consent),
          },
        ],
        { cancelable: true },
      )
    },
    [t, withdraw],
  )

  const statusLine = (consent: GuardianConsent) => {
    if (consent.status === 'APPROVED') {
      return t('childConsent.approvedOn', { date: formatDate(consent.approvedAt ?? consent.requestedAt) })
    }
    if (consent.status === 'WITHDRAWN') {
      return t('childConsent.withdrawnOn', { date: formatDate(consent.withdrawnAt) })
    }
    return t('childConsent.pendingSince', { date: formatDate(consent.requestedAt) })
  }

  const statusIcon = (status: ConsentStatus): { name: IconName; color?: string } => {
    if (status === 'APPROVED') return { name: 'checkmark.shield.fill' }
    if (status === 'PENDING') return { name: 'clock.fill', color: c.textTertiary }
    return { name: 'shield', color: c.textTertiary }
  }

  const statusLabel = (status: ConsentStatus) =>
    status === 'APPROVED'
      ? t('childConsent.statusApproved')
      : status === 'PENDING'
        ? t('childConsent.statusPending')
        : t('childConsent.statusWithdrawn')

  const isLoading = consents === null

  return (
    <Screen header={<ModalHeader title={t('childConsent.title')} mode="back" />} padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.textTertiary} />
        }
      >
        <Text variant="subheadline" color="secondary" style={styles.intro}>
          {t('childConsent.intro')}
        </Text>

        {loadFailed ? (
          <Banner
            tone="error"
            icon="exclamationmark.triangle.fill"
            title={t('childConsent.loadError')}
            action={{ label: t('common.retry'), onPress: () => void load() }}
            style={styles.banner}
          />
        ) : null}

        {isLoading ? (
          <View style={styles.skeleton} accessibilityLabel={t('childConsent.title')}>
            {[0, 1].map((i) => (
              <View key={i} style={[styles.skeletonGroup, { backgroundColor: c.surface }]}>
                <Skeleton shape="line" width="40%" height={14} />
                <Skeleton shape="line" width="80%" height={18} />
                <Skeleton shape="line" width="55%" height={14} />
              </View>
            ))}
          </View>
        ) : groups.length === 0 && !loadFailed ? (
          <View style={styles.empty}>
            <SoftIcon name="figure.and.child.holdinghands" size={56} />
            <Text variant="headline" style={styles.centerText}>
              {t('childConsent.emptyTitle')}
            </Text>
            <Text variant="subheadline" color="secondary" style={styles.centerText}>
              {t('childConsent.emptyBody')}
            </Text>
          </View>
        ) : (
          groups.map((group) => (
            <SectionGroup
              key={group.playerId}
              header={t('childConsent.sectionChild', { name: group.name })}
              style={styles.section}
            >
              {group.consents.map((consent) => {
                const icon = statusIcon(consent.status)
                const subtitle = `${consent.club.name} · ${statusLine(consent)}`
                return (
                  <View key={consent.id}>
                    <ListRow
                      left={<SoftIcon name={icon.name} color={icon.color} />}
                      title={consent.team.displayName}
                      subtitle={subtitle}
                      subtitleNumberOfLines={3}
                      accessibilityLabel={`${consent.team.displayName}, ${statusLabel(consent.status)}, ${subtitle}`}
                    />
                    {consent.status === 'APPROVED' ? (
                      <ListRow
                        title={t('childConsent.withdrawCta')}
                        destructive
                        disabled={withdrawingId !== null}
                        onPress={() => confirmWithdraw(consent)}
                        accessibilityLabel={t('childConsent.withdrawA11y', {
                          name: group.name,
                          team: consent.team.displayName,
                        })}
                        testID={`child-consent-withdraw-${consent.id}`}
                      />
                    ) : null}
                  </View>
                )
              })}
            </SectionGroup>
          ))
        )}

        {hasWithdrawn ? (
          <Text variant="footnote" color="secondary" style={styles.hint}>
            {t('childConsent.regrantHint')}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'],
    gap: space.md,
  },
  intro: {
    paddingHorizontal: space.xs,
  },
  banner: {},
  section: {},
  skeleton: {
    gap: space.md,
  },
  skeletonGroup: {
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    padding: space.md,
    gap: space.sm,
  },
  empty: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xl,
    paddingHorizontal: space.md,
  },
  centerText: {
    textAlign: 'center',
  },
  hint: {
    paddingHorizontal: space.xs,
  },
})
