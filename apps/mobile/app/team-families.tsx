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
import {
  ListRow,
  Screen,
  SectionGroup,
  SettingsIcon,
  SettingsIconTint,
  Text,
} from '../src/components/ui'
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
    const players = Array.isArray(snapshot?.players) ? snapshot.players : []
    if (!snapshot || players.length === 0) {
      Alert.alert(t('teamFamilies.noPlayersTitle'), t('teamFamilies.noPlayersBody'))
      return
    }

    Alert.alert(
      t('teamFamilies.linkChoiceTitle', { name: relationship.parent.name }),
      t('teamFamilies.linkChoiceBody'),
      [
        ...players.map((player) => ({
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
          <ActivityIndicator size="large" color={c.primary} />
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

  const relationships = Array.isArray(snapshot?.relationships)
    ? snapshot.relationships
    : []
  const linkedRelationships = relationships.filter((r) => r.player).length
  const unlinkedRelationships = relationships.filter((r) => !r.player).length
  const pendingConsents = Array.isArray(snapshot?.pendingConsents)
    ? snapshot.pendingConsents
    : []

  return (
    <Screen
      header={<ModalHeader title={t('teamFamilies.screenTitle')} mode="back" />}
      scroll
      padded={false}
      style={{ backgroundColor: c.surfaceSunken }}
      contentStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
    >
      <SectionGroup
        header={
          snapshot?.team?.displayName ||
          activeTeamAccess?.team?.displayName ||
          undefined
        }
        style={styles.section}
      >
        <ListRow
          left={
            <SettingsIcon
              name="checkmark.circle.fill"
              tint={SettingsIconTint.green}
            />
          }
          title={t('teamFamilies.summaryLinked')}
          right={
            <Text variant="body" color="secondary" tabular>
              {linkedRelationships}
            </Text>
          }
        />
        <ListRow
          left={
            <SettingsIcon
              name="clock.fill"
              tint={SettingsIconTint.orange}
            />
          }
          title={t('teamFamilies.summaryPending')}
          right={
            <Text variant="body" color="secondary" tabular>
              {pendingConsents.length}
            </Text>
          }
        />
        <ListRow
          left={
            <SettingsIcon
              name="questionmark.circle.fill"
              tint={SettingsIconTint.red}
            />
          }
          title={t('teamFamilies.summaryOpen')}
          right={
            <Text variant="body" color="secondary" tabular>
              {unlinkedRelationships}
            </Text>
          }
        />
      </SectionGroup>

      {pendingConsents.length > 0 ? (
        <SectionGroup
          header={t('teamFamilies.pendingTitle')}
          footer={t('teamFamilies.pendingBody')}
          style={styles.section}
        >
          {pendingConsents.map((consent) => (
            <ListRow
              key={consent.id}
              left={
                <SettingsIcon
                  name="clock.fill"
                  tint={SettingsIconTint.orange}
                />
              }
              title={consent.player.name}
              subtitle={`${consent.guardianEmail} · ${t('teamFamilies.pendingMeta', { date: formatDate(consent.requestedAt, locale) })}`}
            />
          ))}
        </SectionGroup>
      ) : null}

      <SectionGroup
        header={t('teamFamilies.linksTitle')}
        footer={t('teamFamilies.linksBody')}
        style={styles.section}
      >
        {relationships.length === 0 ? (
          <ListRow
            left={
              <SettingsIcon
                name="info.circle.fill"
                tint={SettingsIconTint.gray}
              />
            }
            title={t('teamFamilies.emptyTitle')}
            subtitle={t('teamFamilies.emptyBody')}
          />
        ) : (
          relationships.map((relationship) => {
            const isUpdating = updatingRelationshipId === relationship.id
            const initials = (relationship.parent.name || '')
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()
            const linked = !!relationship.player
            const childLabel =
              relationship.player?.name ||
              relationship.childName ||
              t('teamFamilies.unlinkedChild')
            return (
              <ListRow
                key={relationship.id}
                left={
                  relationship.parent.avatarUrl ? (
                    <Image
                      source={{ uri: relationship.parent.avatarUrl }}
                      style={styles.rowAvatar}
                    />
                  ) : (
                    <View
                      style={[
                        styles.rowAvatarFallback,
                        { backgroundColor: c.primary50 },
                      ]}
                    >
                      <Text style={[styles.avatarInitials, { color: c.primary }]}>
                        {initials}
                      </Text>
                    </View>
                  )
                }
                title={relationship.parent.name}
                subtitle={`${t('teamFamilies.childLabel')}: ${childLabel}`}
                right={
                  isUpdating ? (
                    <ActivityIndicator color={c.primary} size="small" />
                  ) : (
                    <View
                      style={[
                        styles.linkBadge,
                        linked
                          ? { backgroundColor: `${c.success}1F` }
                          : { backgroundColor: `${c.warning}1F` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.linkBadgeText,
                          { color: linked ? c.success : c.warning },
                        ]}
                      >
                        {linked
                          ? t('teamFamilies.linkedBadge')
                          : t('teamFamilies.openBadge')}
                      </Text>
                    </View>
                  )
                }
                showChevron={!isUpdating}
                onPress={() => openLinkPicker(relationship)}
              />
            )
          })
        )}
      </SectionGroup>
    </Screen>
  )
}

function _SummaryCard({ label, value }: { label: string; value: number }) {
  const c = useClubColors()

  return (
    <View
      style={[
        styles.summaryCard,
        { borderColor: c.borderDefault, backgroundColor: c.surface },
      ]}
    >
      <Text style={[styles.summaryValue, { color: c.textPrimary }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: c.textSecondary }]}>{label}</Text>
    </View>
  )
}

function _RelationshipCard({
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
    <View style={[styles.card, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
      <View style={styles.parentRow}>
        {relationship.parent.avatarUrl ? (
          <Image source={{ uri: relationship.parent.avatarUrl }} style={styles.avatar} />
        ) : (
          <View
            style={[styles.avatarFallback, { backgroundColor: c.primary50 }]}
          >
            <Text style={[styles.avatarInitials, { color: c.primary }]}>
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
          { borderColor: c.primary, backgroundColor: c.surface },
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
          <ActivityIndicator size="small" color={c.primary} />
        ) : (
          <Text style={[styles.linkButtonText, { color: c.primary }]}>
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
  content: {
    paddingTop: space.md,
    paddingBottom: space['3xl'] + space.lg,
    gap: space.lg,
  },
  rowAvatar: { width: 30, height: 30, borderRadius: radius.full },
  rowAvatarFallback: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space['2xs'],
    borderRadius: radius.full,
  },
  linkBadgeText: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.label,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  hero: { gap: space.sm, paddingHorizontal: space.xs },
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
    padding: space.lg,
    gap: space.xs,
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
  section: { gap: space.md, paddingHorizontal: space.xs },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
  },
  sectionBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  stack: { gap: space.md },
  card: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
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
  linkBadgeLegacy: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  linkBadgeTextLegacy: {
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
