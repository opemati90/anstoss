import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import type { TeamFamilyAccessSnapshot, TeamFamilyRelationship } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { neutralColors, semanticColors, fontSize, space, radius, fonts, fontWeight, lineHeight } from '../src/theme/tokens'

export default function TeamFamiliesScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const theme = useClubColors()
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
      <View style={styles.centeredState}>
        <ActivityIndicator size="large" color={theme.clubPrimary} />
        <Text style={styles.stateTitle}>{t('teamFamilies.loadingTitle')}</Text>
        <Text style={styles.stateBody}>{t('teamFamilies.loadingBody')}</Text>
      </View>
    )
  }

  if (!activeClub || !activeTeamId || !canManageTeam) {
    return (
      <View style={styles.centeredState}>
        <Text style={styles.stateTitle}>{t('teamFamilies.lockedTitle')}</Text>
        <Text style={styles.stateBody}>{t('teamFamilies.lockedBody')}</Text>
      </View>
    )
  }

  const linkedRelationships =
    snapshot?.relationships.filter((relationship) => relationship.player).length || 0
  const unlinkedRelationships =
    snapshot?.relationships.filter((relationship) => !relationship.player).length || 0
  const pendingConsents = snapshot?.pendingConsents || []
  const relationships = snapshot?.relationships || []

  return (
    <View style={styles.container}>
      <ModalHeader title={t('teamFamilies.screenTitle')} mode="back" />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>{t('teamFamilies.eyebrow')}</Text>
          <Text style={styles.subtitle}>
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
          <Text style={styles.sectionTitle}>{t('teamFamilies.pendingTitle')}</Text>
          <Text style={styles.sectionBody}>{t('teamFamilies.pendingBody')}</Text>
          <View style={styles.stack}>
            {pendingConsents.map((consent) => (
              <View key={consent.id} style={styles.card}>
                <Text style={styles.cardTitle}>{consent.player.name}</Text>
                <Text style={styles.cardMeta}>{consent.guardianEmail}</Text>
                <Text style={styles.cardMeta}>
                  {t('teamFamilies.pendingMeta', {
                    date: formatDate(
                      consent.requestedAt,
                      locale,
                    ),
                  })}
                </Text>
                {consent.guardianUser ? (
                  <Text style={styles.cardHint}>
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
        <Text style={styles.sectionTitle}>{t('teamFamilies.linksTitle')}</Text>
        <Text style={styles.sectionBody}>{t('teamFamilies.linksBody')}</Text>
        {relationships.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('teamFamilies.emptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('teamFamilies.emptyBody')}</Text>
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
                <View key={relationship.id} style={styles.card}>
                  <View style={styles.parentRow}>
                    {relationship.parent.avatarUrl ? (
                      <Image source={{ uri: relationship.parent.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View
                        style={[
                          styles.avatarFallback,
                          { backgroundColor: theme.clubPrimaryLight },
                        ]}
                      >
                        <Text style={[styles.avatarInitials, { color: theme.clubPrimary }]}>
                          {initials}
                        </Text>
                      </View>
                    )}

                    <View style={styles.parentCopy}>
                      <Text style={styles.cardTitle}>{relationship.parent.name}</Text>
                      <Text style={styles.cardMeta}>{relationship.parent.email}</Text>
                      <Text style={styles.cardHint}>
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
                      <Text style={styles.childLabel}>{t('teamFamilies.childLabel')}</Text>
                      <Text style={styles.childValue}>
                        {relationship.player?.name ||
                          relationship.childName ||
                          t('teamFamilies.unlinkedChild')}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.linkBadge,
                        relationship.player
                          ? styles.linkBadgeLinked
                          : styles.linkBadgeOpen,
                      ]}
                    >
                      <Text
                        style={[
                          styles.linkBadgeText,
                          relationship.player
                            ? styles.linkBadgeTextLinked
                            : styles.linkBadgeTextOpen,
                        ]}
                      >
                        {relationship.player
                          ? t('teamFamilies.linkedBadge')
                          : t('teamFamilies.openBadge')}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.linkButton,
                      { borderColor: theme.clubPrimary },
                      isUpdating && styles.linkButtonDisabled,
                    ]}
                    onPress={() => openLinkPicker(relationship)}
                    disabled={isUpdating}
                    accessibilityRole="button"
                    accessibilityLabel={
                      relationship.player
                        ? t('teamFamilies.changeChildCta')
                        : t('teamFamilies.linkChildCta')
                    }
                  >
                    {isUpdating ? (
                      <ActivityIndicator size="small" color={theme.clubPrimary} />
                    ) : (
                      <Text style={[styles.linkButtonText, { color: theme.clubPrimary }]}>
                        {relationship.player
                          ? t('teamFamilies.changeChildCta')
                          : t('teamFamilies.linkChildCta')}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )
            })}
          </View>
        )}
      </View>
      </ScrollView>
    </View>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
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
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: { padding: space.lg, paddingBottom: 100, gap: space.lg },
  hero: { gap: space.sm },
  eyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  subtitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
    color: neutralColors.textSecondary,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    gap: space.sm,
  },
  summaryValue: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.data,
    color: neutralColors.textPrimary,
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    lineHeight: lineHeight.xs,
    color: neutralColors.textSecondary,
  },
  section: { gap: space.sm },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  sectionBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
  },
  stack: { gap: space.sm },
  card: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    gap: space.sm,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  cardMeta: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  cardHint: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textTertiary,
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
    fontWeight: fontWeight.bold,
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
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  childValue: {
    marginTop: space.xs,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  linkBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  linkBadgeLinked: {
    backgroundColor: `${semanticColors.success}10`,
    borderColor: `${semanticColors.success}33`,
  },
  linkBadgeOpen: {
    backgroundColor: `${semanticColors.warning}10`,
    borderColor: `${semanticColors.warning}33`,
  },
  linkBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    textTransform: 'uppercase',
  },
  linkBadgeTextLinked: {
    color: semanticColors.success,
  },
  linkBadgeTextOpen: {
    color: semanticColors.warning,
  },
  linkButton: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neutralColors.surface,
  },
  linkButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
  },
  linkButtonDisabled: {
    opacity: 0.6,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    gap: space.sm,
  },
  emptyTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  emptyBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    backgroundColor: neutralColors.background,
    gap: space.sm,
  },
  stateTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    textAlign: 'center',
  },
  stateBody: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
})
