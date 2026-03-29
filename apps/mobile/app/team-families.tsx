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
import { neutralColors, semanticColors } from '../src/theme/tokens'

export default function TeamFamiliesScreen() {
  const { t, i18n } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const theme = useClubColors()
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
                      i18n.resolvedLanguage === 'en' ? 'en-GB' : 'de-DE',
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
  content: { padding: 20, paddingBottom: 100, gap: 24 },
  hero: { gap: 6 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: neutralColors.textSecondary,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 12,
    backgroundColor: neutralColors.surface,
    padding: 14,
    gap: 6,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  summaryLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: neutralColors.textSecondary,
  },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  stack: { gap: 10 },
  card: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 12,
    backgroundColor: neutralColors.surface,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  cardMeta: {
    fontSize: 14,
    color: neutralColors.textSecondary,
  },
  cardHint: {
    fontSize: 13,
    lineHeight: 18,
    color: neutralColors.textTertiary,
  },
  parentRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 16,
    fontWeight: '700',
  },
  parentCopy: { flex: 1, gap: 2 },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  childLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  childValue: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  linkBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
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
    fontSize: 11,
    fontWeight: '700',
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
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neutralColors.surface,
  },
  linkButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  linkButtonDisabled: {
    opacity: 0.6,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 12,
    backgroundColor: neutralColors.surface,
    padding: 16,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: neutralColors.background,
    gap: 10,
  },
  stateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: neutralColors.textPrimary,
    textAlign: 'center',
  },
  stateBody: {
    fontSize: 15,
    lineHeight: 22,
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
})
