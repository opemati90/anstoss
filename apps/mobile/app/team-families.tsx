import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native'
import type { TeamFamilyRelationship, TeamFamilyAccessSnapshot } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import {
  Avatar,
  ListRow,
  Screen,
  SectionGroup,
  SettingsIcon,
  SettingsIconTint,
  StatusPill,
  Text,
} from '../src/components/ui'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { fontSize, space, fonts, lineHeight } from '../src/theme/tokens'

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
              tint={SettingsIconTint.gray}
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
            <SettingsIcon name="clock.fill" tint={SettingsIconTint.gray} />
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
              tint={SettingsIconTint.gray}
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
                <SettingsIcon name="clock.fill" tint={SettingsIconTint.gray} />
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
            const linked = !!relationship.player
            const childLabel =
              relationship.player?.name ||
              relationship.childName ||
              t('teamFamilies.unlinkedChild')
            return (
              <ListRow
                key={relationship.id}
                left={
                  <Avatar
                    size="md"
                    src={relationship.parent.avatarUrl}
                    fallbackText={relationship.parent.name}
                  />
                }
                title={relationship.parent.name}
                subtitle={`${t('teamFamilies.childLabel')}: ${childLabel}`}
                right={
                  isUpdating ? (
                    <ActivityIndicator color={c.primary} size="small" />
                  ) : (
                    <StatusPill
                      label={
                        linked
                          ? t('teamFamilies.linkedBadge')
                          : t('teamFamilies.openBadge')
                      }
                      tone={linked ? 'success' : 'warning'}
                    />
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
  section: { gap: space.md, paddingHorizontal: space.xs },
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
