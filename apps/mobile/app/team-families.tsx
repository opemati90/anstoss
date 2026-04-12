import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native'
import type { TeamFamilyAccessSnapshot, TeamFamilyRelationship } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Screen, Text } from '../src/components/ui'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { fontSize, space, radius, fonts, hairline, lineHeight } from '../src/theme/tokens'

export default function TeamFamiliesScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())
  const [snapshot, setSnapshot] = useState<TeamFamilyAccessSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [updatingRelationshipId, setUpdatingRelationshipId] = useState<string | null>(null)

  const canManageTeam =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeClub?.role === 'COACH' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'

  const loadSnapshot = useCallback(async () => {
    if (!activeClub || !activeTeamId || !canManageTeam) {
      setSnapshot(null)
      setIsLoading(false)
      return
    }

    try {
      const data = await api<TeamFamilyAccessSnapshot>(
        `/clubs/${activeClub.club.id}/teams/${activeTeamId}/family-access`,
      )
      setSnapshot(data)
    } catch {
      Alert.alert(t('common.error'), t('teamFamilies.loadError'))
    } finally {
      setIsLoading(false)
    }
  }, [activeClub, activeTeamId, canManageTeam, t])

  useEffect(() => {
    void loadSnapshot()
  }, [loadSnapshot])

  const onRefresh = async () => {
    setIsRefreshing(true)
    try {
      await loadSnapshot()
    } finally {
      setIsRefreshing(false)
    }
  }

  const submitLinkUpdate = async (
    relationshipId: string,
    body: { playerUserId?: string | null; childName?: string | null },
  ) => {
    if (!activeClub || !activeTeamId) return

    setUpdatingRelationshipId(relationshipId)
    try {
      await api(`/clubs/${activeClub.club.id}/teams/${activeTeamId}/family-links/${relationshipId}`, {
        method: 'PATCH',
        body,
      })
      await loadSnapshot()
    } catch (error) {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('teamFamilies.updateError'),
      )
    } finally {
      setUpdatingRelationshipId(null)
    }
  }

  const openLinkPicker = (relationship: TeamFamilyRelationship) => {
    if (!snapshot || snapshot.players.length === 0) {
      Alert.alert(t('teamFamilies.noPlayersTitle'), t('teamFamilies.noPlayersBody'))
      return
    }

    Alert.alert(
      t('teamFamilies.linkChoiceTitle', { name: relationship.parent.name }),
      t('teamFamilies.linkChoiceBody'),
      [
        ...snapshot.players.map((player) => ({
          text: player.name,
          onPress: () => {
            void submitLinkUpdate(relationship.id, {
              playerUserId: player.id,
            })
          },
        })),
        ...(relationship.player
          ? [
              {
                text: t('teamFamilies.unlinkChildCta'),
                style: 'destructive' as const,
                onPress: () => {
                  void submitLinkUpdate(relationship.id, {
                    playerUserId: null,
                    childName: relationship.childName || relationship.player?.name || null,
                  })
                },
              },
            ]
          : []),
        {
          text: t('common.cancel'),
          style: 'cancel' as const,
        },
      ],
    )
  }

  if (isLoading) {
    return (
      <Screen
        header={<ModalHeader title={t('teamFamilies.screenTitle')} mode="back" />}
        scroll={false}
        padded={false}
      >
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={c.clubPrimary} />
          <Text style={[styles.stateTitle, { color: c.textPrimary }]}>
            {t('teamFamilies.loadingTitle')}
          </Text>
          <Text style={[styles.stateBody, { color: c.textSecondary }]}>
            {t('teamFamilies.loadingBody')}
          </Text>
        </View>
      </Screen>
    )
  }

  if (!activeClub || !activeTeamId || !canManageTeam) {
    return (
      <Screen
        header={<ModalHeader title={t('teamFamilies.screenTitle')} mode="back" />}
        scroll={false}
        padded={false}
      >
        <View style={styles.centeredState}>
          <Text style={[styles.stateTitle, { color: c.textPrimary }]}>
            {t('teamFamilies.lockedTitle')}
          </Text>
          <Text style={[styles.stateBody, { color: c.textSecondary }]}>
            {t('teamFamilies.lockedBody')}
          </Text>
        </View>
      </Screen>
    )
  }

  const linkedRelationships =
    snapshot?.relationships.filter((relationship) => relationship.player).length || 0
  const unlinkedRelationships =
    snapshot?.relationships.filter((relationship) => !relationship.player).length || 0
  const pendingConsents = snapshot?.pendingConsents || []
  const relationships = snapshot?.relationships || []

  return (
    <Screen
      header={<ModalHeader title={t('teamFamilies.screenTitle')} mode="back" />}
      scroll
      contentStyle={styles.content}
    >
      <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />

      <View style={styles.hero}>
        <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
          {t('teamFamilies.eyebrow')}
        </Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          {snapshot?.team.displayName || activeTeamAccess?.team.displayName}
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <SummaryCard
          label={t('teamFamilies.summaryLinked')}
          value={linkedRelationships}
        />
        <SummaryCard
          label={t('teamFamilies.summaryPending')}
          value={pendingConsents.length}
        />
        <SummaryCard
          label={t('teamFamilies.summaryOpen')}
          value={unlinkedRelationships}
        />
      </View>

      {pendingConsents.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
            {t('teamFamilies.pendingTitle')}
          </Text>
          <Text style={[styles.sectionBody, { color: c.textSecondary }]}>
            {t('teamFamilies.pendingBody')}
          </Text>
          <View style={styles.stack}>
            {pendingConsents.map((consent) => (
              <View
                key={consent.id}
                style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}
              >
                <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
                  {consent.player.name}
                </Text>
                <Text style={[styles.cardMeta, { color: c.textSecondary }]}>
                  {consent.guardianEmail}
                </Text>
                <Text style={[styles.cardMeta, { color: c.textSecondary }]}>
                  {t('teamFamilies.pendingMeta', {
                    date: formatDate(consent.requestedAt, locale),
                  })}
                </Text>
                {consent.guardianUser ? (
                  <Text style={[styles.cardHint, { color: c.textTertiary }]}>
                    {t('teamFamilies.pendingGuardianLinked', {
                      name: consent.guardianUser.name,
                    })}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
          {t('teamFamilies.linksTitle')}
        </Text>
        <Text style={[styles.sectionBody, { color: c.textSecondary }]}>
          {t('teamFamilies.linksBody')}
        </Text>
        {relationships.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
              {t('teamFamilies.emptyTitle')}
            </Text>
            <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
              {t('teamFamilies.emptyBody')}
            </Text>
          </View>
        ) : (
          <View style={styles.stack}>
            {relationships.map((relationship) => {
              const isUpdating = updatingRelationshipId === relationship.id
              const initials = relationship.parent.name
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()

              return (
                <RelationshipCard
                  key={relationship.id}
                  relationship={relationship}
                  initials={initials}
                  isUpdating={isUpdating}
                  onLinkPress={() => openLinkPicker(relationship)}
                />
              )
            })}
          </View>
        )}
      </View>
    </Screen>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  const c = useClubColors()

  return (
    <View
      style={[
        styles.summaryCard,
        { borderColor: c.border, backgroundColor: c.surface },
      ]}
    >
      <Text style={[styles.summaryValue, { color: c.textPrimary }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: c.textSecondary }]}>{label}</Text>
    </View>
  )
}

function RelationshipCard({
  relationship,
  initials,
  isUpdating,
  onLinkPress,
}: {
  relationship: TeamFamilyRelationship
  initials: string
  isUpdating: boolean
  onLinkPress: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()

  return (
    <View style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}>
      <View style={styles.parentRow}>
        {relationship.parent.avatarUrl ? (
          <Image source={{ uri: relationship.parent.avatarUrl }} style={styles.avatar} />
        ) : (
          <View
            style={[styles.avatarFallback, { backgroundColor: c.clubPrimaryLight }]}
          >
            <Text style={[styles.avatarInitials, { color: c.clubPrimary }]}>
              {initials}
            </Text>
          </View>
        )}

        <View style={styles.parentCopy}>
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
            {relationship.parent.name}
          </Text>
          <Text style={[styles.cardMeta, { color: c.textSecondary }]}>
            {relationship.parent.email}
          </Text>
          <Text style={[styles.cardHint, { color: c.textTertiary }]}>
            {relationship.parentAccess?.phase === 'TRIAL'
              ? t('teamFamilies.parentTrialAccess')
              : relationship.parentAccess
                ? t('teamFamilies.parentFullAccess')
                : t('teamFamilies.parentNoAccess')}
          </Text>
        </View>
      </View>

      <View style={styles.childRow}>
        <View>
          <Text style={[styles.childLabel, { color: c.textTertiary }]}>
            {t('teamFamilies.childLabel')}
          </Text>
          <Text style={[styles.childValue, { color: c.textPrimary }]}>
            {relationship.player?.name ||
              relationship.childName ||
              t('teamFamilies.unlinkedChild')}
          </Text>
        </View>
        <View
          style={[
            styles.linkBadge,
            relationship.player
              ? { backgroundColor: `${c.success}10`, borderColor: `${c.success}33` }
              : { backgroundColor: `${c.warning}10`, borderColor: `${c.warning}33` },
          ]}
        >
          <Text
            style={[
              styles.linkBadgeText,
              { color: relationship.player ? c.success : c.warning },
            ]}
          >
            {relationship.player
              ? t('teamFamilies.linkedBadge')
              : t('teamFamilies.openBadge')}
          </Text>
        </View>
      </View>

      <Pressable
        style={[
          styles.linkButton,
          { borderColor: c.clubPrimary, backgroundColor: c.surface },
          isUpdating && styles.linkButtonDisabled,
        ]}
        onPress={onLinkPress}
        disabled={isUpdating}
        accessibilityRole="button"
        accessibilityLabel={
          relationship.player
            ? t('teamFamilies.changeChildCta')
            : t('teamFamilies.linkChildCta')
        }
      >
        {isUpdating ? (
          <ActivityIndicator size="small" color={c.clubPrimary} />
        ) : (
          <Text style={[styles.linkButtonText, { color: c.clubPrimary }]}>
            {relationship.player
              ? t('teamFamilies.changeChildCta')
              : t('teamFamilies.linkChildCta')}
          </Text>
        )}
      </Pressable>
    </View>
  )
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

const styles = StyleSheet.create({
  content: { gap: space.lg },
  hero: { gap: space.sm },
  eyebrow: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  summaryCard: {
    flex: 1,
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  summaryValue: {
    fontSize: fontSize['2xl'],
    fontFamily: fonts.data,
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    lineHeight: lineHeight.xs,
  },
  section: { gap: space.sm },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
  },
  sectionBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  stack: { gap: space.sm },
  card: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  cardMeta: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  cardHint: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  parentRow: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  parentCopy: { flex: 1, gap: space['2xs'] },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  childLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  childValue: {
    marginTop: space.xs,
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  linkBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  linkBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  linkButton: {
    minHeight: 44,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButtonText: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  linkButtonDisabled: {
    opacity: 0.6,
  },
  emptyCard: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  emptyTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  emptyBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.sm,
  },
  stateTitle: {
    fontSize: fontSize.xl,
    fontFamily: fonts.heading,
    textAlign: 'center',
  },
  stateBody: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
    textAlign: 'center',
  },
})
