import { useCallback, useEffect, useState } from 'react'
import { View, StyleSheet, Pressable, ScrollView, Alert, Linking, Share } from 'react-native'
import Constants from 'expo-constants'
import * as FileSystem from 'expo-file-system/legacy'
import { router, useFocusEffect } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors, useIsDark } from '../../../src/context/ClubThemeContext'
import { api, ApiError, setAuthExpiryHandlingSuspended } from '../../../src/api/client'
import {
  Avatar,
  BottomSheet,
  Icon,
  Text,
  type IconName,
  SectionGroup,
  ListRow,
  SoftIcon,
} from '../../../src/components/ui'
import { ClubSwitcher } from '../../../src/components/ClubSwitcher'
import {
  PreviewCoverEntryCard,
  PreviewCoverSheet,
  canUsePreviewCover,
} from '../../../src/components/roles/PreviewCoverSheet'
import {
  RADIUS_CARD,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XXS,
  SPACING_XXXL,
  TAB_BAR_CLEARANCE,
} from '../../../src/theme/tokens'
import { useWechselAccess } from '../../../src/features/wechsel/hooks'
import { useClubPlan } from '../../../src/hooks/useClubPlan'
import type { MyContributionSummary } from '@anstoss/shared'
import { getAppLanguage, getLanguageLabel } from '../../../src/i18n'
import { VerifiedPlayerCard } from '../../../src/components/profile/VerifiedPlayerCard'
import { useChildrenSummary } from '../../../src/components/home/childrenSummary'
import { useStreaks } from '../../../src/hooks/useStreaks'
import {
  getAppearancePreference,
  setAppearancePreference,
  type AppearancePreference,
} from '../../../src/lib/appearance'

type Row = {
  key: string
  label: string
  sub?: string
  icon: IconName
  onPress?: () => void
  destructive?: boolean
  value?: string
}

type Persona = 'PLAYER' | 'COACH' | 'PARENT' | 'ADMIN' | 'FREE_AGENT' | 'NONE'

const APPEARANCE_OPTIONS: AppearancePreference[] = ['system', 'light', 'dark']
const COACH_TEAM_ROLES = new Set(['HEAD_COACH', 'ASSISTANT_COACH'])

/**
 * Mehr tab (redesign screen 18). "Mehr" title, one header per persona (player
 * card with streaks for players, profile card for everyone else), the ink
 * role-mode card when the user has several modes, persona extras (team,
 * children, Verein shortcut), then grouped rows: Team (dues, treasury, table,
 * Wechselbörse, invite), Verein und App, Konto, and a quiet Abmelden link.
 */
export default function MoreScreen() {
  const { t } = useTranslation()
  const {
    user,
    signOut,
    activeClub,
    activeTeamAccess,
    memberships = [],
    refreshUser,
    activeRoleMode = null,
    availableRoleModes = [],
    setActiveRoleMode = () => undefined,
  } = useAuth()
  const c = useClubColors()
  const children = useChildrenSummary()
  const [clubSwitcherVisible, setClubSwitcherVisible] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [appearance, setAppearance] = useState<AppearancePreference>('system')
  const [roleSheetOpen, setRoleSheetOpen] = useState(false)
  const [previewCoverOpen, setPreviewCoverOpen] = useState(false)
  const [openDues, setOpenDues] = useState(0)
  const wechsel = useWechselAccess()
  const { plan: clubPlan } = useClubPlan()

  useEffect(() => {
    void getAppearancePreference().then(setAppearance)
  }, [])

  const isFreeAgent = !activeClub && user?.registrationRole === 'FREE_AGENT'
  const clubRole = activeClub?.role ?? null
  const isOwner = clubRole === 'OWNER'
  const isClubAdmin = clubRole === 'OWNER' || clubRole === 'ADMIN'
  const hasBillingAccess = Boolean(activeClub?.permissions?.BILLING) || isClubAdmin
  const duesClubId = activeClub && !isFreeAgent ? activeClub.club.id : null

  // "N offen" on the Beiträge row: the member's own unsettled dues.
  useFocusEffect(
    useCallback(() => {
      if (!duesClubId) return
      let cancelled = false
      api<MyContributionSummary>(`/clubs/${duesClubId}/contributions/my`)
        .then((res) => {
          if (cancelled) return
          setOpenDues(
            (res?.items ?? []).filter(
              (i) => !['PAID', 'WAIVED', 'EXEMPT'].includes(i.status) && !i.paymentReported,
            ).length,
          )
        })
        .catch(() => undefined)
      return () => {
        cancelled = true
      }
    }, [duesClubId]),
  )
  const persona: Persona = isFreeAgent
    ? 'FREE_AGENT'
    : !activeClub
      ? 'NONE'
      : ((activeRoleMode ??
          (isClubAdmin
            ? 'ADMIN'
            : clubRole === 'COACH'
              ? 'COACH'
              : clubRole === 'PARENT'
                ? 'PARENT'
                : 'PLAYER')) as Persona)

  // Streaks only mean something for players; don't fetch them for anyone else.
  const { data: streaks } = useStreaks({ enabled: persona === 'PLAYER' })
  const board = streaks?.leaderboard ?? []
  const myRank = user ? board.findIndex((e) => e.userId === user.id) + 1 : 0

  const handleExportData = async () => {
    const subject = encodeURIComponent(t('profileHub.exportMailSubject'))
    const body = encodeURIComponent(
      t('profileHub.exportMailBody', {
        email: user?.email ?? '-',
        userId: user?.id ?? '-',
        club: activeClub?.club?.name ?? '-',
      }),
    )
    const openManualRequest = () =>
      Linking.openURL(`mailto:support@anstoss.io?subject=${subject}&body=${body}`).catch(() =>
        Alert.alert(t('more.exportData'), t('more.exportFallback')),
      )

    let exportPayload: unknown
    try {
      exportPayload = await api('/me/export')
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return
      if (error instanceof ApiError && error.status >= 500) {
        Alert.alert(t('common.error'), t('more.exportError'))
        return
      }
      openManualRequest()
      return
    }

    const json = JSON.stringify(exportPayload, null, 2)
    try {
      if (FileSystem.cacheDirectory && (await Sharing.isAvailableAsync())) {
        const fileUri = `${FileSystem.cacheDirectory}anstoss-data-export-${Date.now()}.json`
        await FileSystem.writeAsStringAsync(fileUri, json, {
          encoding: FileSystem.EncodingType.UTF8,
        })
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          UTI: 'public.json',
          dialogTitle: t('profileHub.exportDialogTitle'),
        })
        return
      }
      if (json.length <= 20000) {
        await Share.share({ title: t('profileHub.exportDialogTitle'), message: json })
        return
      }
      openManualRequest()
    } catch {
      openManualRequest()
    }
  }

  const handleDeleteAccount = () => {
    Alert.alert(t('more.deleteAccountTitle'), t('more.deleteAccountBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('more.deleteAccountConfirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api('/me', { method: 'DELETE' })
            await signOut()
            router.replace('/(auth)/welcome')
          } catch {
            Alert.alert(t('common.error'), t('more.deleteAccountError'))
          }
        },
      },
    ])
  }

  const handleLeaveClub = () => {
    if (!activeClub) return
    Alert.alert(
      t('more.leaveClubTitle', { club: activeClub.club.name }),
      t('more.leaveClubBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('more.leaveClubConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              const hadLastMembership = memberships.length <= 1
              const postLeaveRoute =
                user?.registrationRole === 'FREE_AGENT'
                  ? '/(tabs)'
                  : user?.registrationRole === 'CLUB_ADMIN'
                    ? '/(tabs)'
                    : '/account-next-step'

              await api(`/clubs/${activeClub.club.id}/leave`, { method: 'POST' })
              await refreshUser()
              router.replace(hadLastMembership ? postLeaveRoute : '/')
            } catch (e) {
              const message =
                e instanceof ApiError && e.status === 409
                  ? t('more.leaveClubOwnerError')
                  : t('more.leaveClubError')
              Alert.alert(t('common.error'), message)
            }
          },
        },
      ],
    )
  }

  const handleSignOut = () => {
    setAuthExpiryHandlingSuspended(true)
    Alert.alert(t('more.signOutTitle'), t('more.signOutBody'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
        onPress: () => setAuthExpiryHandlingSuspended(false),
      },
      {
        text: t('more.signOut'),
        style: 'destructive',
        onPress: () => {
          void signOut()
          router.replace('/(auth)/welcome')
        },
      },
    ])
  }

  const name = user?.name || t('profileHub.fallbackName')
  const teamName = activeTeamAccess?.team?.displayName || activeTeamAccess?.team?.name || null
  const teamId = activeTeamAccess?.team?.id ?? null
  const isCoach = Boolean(activeTeamAccess && COACH_TEAM_ROLES.has(activeTeamAccess.role))

  // ── Team ── (dues, table, transfer market, invite)
  const team: Row[] = [
    ...(activeClub && !isFreeAgent
      ? [
          {
            key: 'contributions',
            label: t('contributions.myTitle'),
            icon: 'banknote' as IconName,
            value:
              openDues > 0
                ? t('more.openCount', { defaultValue: '{{count}} open', count: openDues })
                : undefined,
            onPress: () => router.push('/my-contributions'),
          },
        ]
      : []),
    ...(hasBillingAccess
      ? [
          {
            key: 'treasury',
            label: t('more.treasury', { defaultValue: 'Treasury' }),
            icon: 'eurosign.circle' as IconName,
            onPress: () => router.push('/admin-billing' as never),
          },
        ]
      : []),
    ...(activeClub && teamId
      ? [
          {
            key: 'table',
            label: t('more.tableAndFixtures', { defaultValue: 'Table and fixtures' }),
            icon: 'trophy' as IconName,
            onPress: () => router.push({ pathname: '/league-table', params: { teamId } } as never),
          },
        ]
      : []),
    ...(wechsel.canManage
      ? [
          {
            key: 'wechsel',
            label: t('more.transferList'),
            icon: 'arrow.left.arrow.right' as IconName,
            onPress: () => router.push('/wechselboerse' as never),
          },
        ]
      : []),
    ...(activeClub && (isClubAdmin || isCoach)
      ? [
          {
            key: 'invite',
            label: t('more.inviteTeam', { defaultValue: 'Invite team' }),
            icon: 'person.badge.plus' as IconName,
            onPress: () =>
              router.push({ pathname: '/invite', params: { returnTo: '/(tabs)/more' } } as never),
          },
        ]
      : []),
  ]

  // ── Verein und App ──
  const clubAndApp: Row[] = [
    // Abo · Kostenlos/Verein (board 19 → 35). Everyone sees the status;
    // only Vorstand and Kassenwart can start or change it on the Abo screen.
    ...(activeClub
      ? [
          {
            key: 'plan',
            label: t('clubPlan.moreRow'),
            icon: 'creditcard' as IconName,
            value: t(`clubPlan.tier.${clubPlan?.tier ?? 'FREE'}`),
            onPress: () => router.push('/abo' as never),
          },
        ]
      : []),
    ...(isClubAdmin && activeClub
      ? [
          {
            key: 'club-profile',
            label: t('more.clubProfile', { defaultValue: 'Club profile' }),
            icon: 'shield' as IconName,
            onPress: () => router.push('/admin-club-profile' as never),
          },
        ]
      : []),
    ...(memberships.length > 1
      ? [
          {
            key: 'switch-club',
            label: t('profileHub.switchClub'),
            value: activeClub?.club.name,
            icon: 'arrow.left.arrow.right' as IconName,
            onPress: () => setClubSwitcherVisible(true),
          },
        ]
      : []),
    {
      key: 'find-club',
      label: t('findClub.title'),
      icon: 'magnifyingglass',
      onPress: () => router.push('/find-club'),
    },
    ...(isClubAdmin || user?.registrationRole === 'CLUB_ADMIN'
      ? [
          {
            key: 'create-club',
            label: t('club.createClub'),
            icon: 'plus.circle' as IconName,
            onPress: () => router.push('/club-setup'),
          },
        ]
      : []),
    ...(isOwner
      ? [
          {
            key: 'ownership',
            label: t('ownership.title'),
            icon: 'person.badge.key' as IconName,
            onPress: () => router.push('/ownership-transfers'),
          },
        ]
      : []),
    {
      key: 'language',
      label: t('more.language'),
      icon: 'globe',
      value: getLanguageLabel(getAppLanguage()),
      onPress: () => router.push('/language' as never),
    },
    {
      key: 'appearance',
      label: t('profileHub.appearance'),
      icon: 'moon',
      value: t(`profileHub.appearanceOption.${appearance}`),
      onPress: () => setAppearanceOpen(true),
    },
    {
      key: 'notifications',
      label: t('notificationSettings.title'),
      icon: 'bell',
      onPress: () => router.push('/notification-settings'),
    },
  ]

  // ── Konto ── (profile, legal, data, leaving)
  const account: Row[] = [
    isFreeAgent
      ? {
          key: 'free-agent-profile',
          label: t('more.freeAgentProfile'),
          sub: t('more.freeAgentProfileSub'),
          icon: 'person.circle',
          // Wechselbörse: the player profile lives in the free agent's Profil tab.
          onPress: () => router.navigate('/(tabs)/profile'),
        }
      : {
          key: 'edit-profile',
          label: t('profileHub.editProfile'),
          sub: user?.email ?? undefined,
          icon: 'person.circle',
          onPress: () => router.push('/edit-profile'),
        },
    {
      key: 'legal',
      label: t('more.legal'),
      icon: 'doc.text',
      onPress: () => router.push('/legal' as never),
    },
    {
      key: 'export',
      label: t('more.exportData'),
      sub: t('more.exportDataSubtitle'),
      icon: 'square.and.arrow.up',
      onPress: () => void handleExportData(),
    },
    ...(activeClub && !isFreeAgent
      ? [
          {
            key: 'leave',
            label: t('more.leaveClub'),
            sub: activeClub.club.name,
            icon: 'rectangle.portrait.and.arrow.right' as IconName,
            destructive: true,
            onPress: handleLeaveClub,
          },
        ]
      : []),
    {
      key: 'delete',
      label: t('more.deleteAccount'),
      sub: t('more.deleteAccountSubtitle'),
      icon: 'trash',
      onPress: handleDeleteAccount,
      destructive: true,
    },
  ]

  const appVersionFooter = t('profileHub.version', {
    version: Constants.expoConfig?.version || '1.0.0',
  })

  const roleSubtitle =
    persona === 'COACH'
      ? [teamName, t(`teamRoles.${activeTeamAccess?.role ?? 'HEAD_COACH'}`)].filter(Boolean).join(' · ')
      : persona === 'ADMIN'
        ? [activeClub?.club.name, t(`verein.memberRole.${clubRole ?? 'ADMIN'}`)]
            .filter(Boolean)
            .join(' · ')
        : persona === 'PARENT'
          ? [activeClub?.club.name, t('roles.PARENT')].filter(Boolean).join(' · ')
          : (user?.email ?? '')

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text
          variant="title1"
          weight="bold"
          color="primary"
          accessibilityRole="header"
          style={styles.h1}
        >
          {t('more.title')}
        </Text>

        {persona === 'PLAYER' ? (
          <Pressable
            onPress={() => router.push('/edit-profile')}
            accessibilityRole="button"
            accessibilityLabel={t('profileHub.editProfile')}
            android_ripple={{ color: c.borderSubtle }}
            style={({ pressed }) => [pressed && styles.pressedScale]}
            testID="profile-player-card"
          >
            <VerifiedPlayerCard
              name={name}
              avatarUrl={user?.avatarUrl}
              subtitle={activeClub?.club?.name ?? user?.email ?? null}
              streaks={
                streaks?.me ?? {
                  attendanceWeeks: 0,
                  attendanceLongest: 0,
                  motmWeeks: 0,
                  motmLongest: 0,
                  lastActivityAt: '',
                }
              }
              rank={myRank > 0 ? myRank : null}
              totalRanked={board.length}
            />
          </Pressable>
        ) : (
          <ProfileCard
            name={name}
            avatarUrl={user?.avatarUrl ?? null}
            subtitle={roleSubtitle}
            testID={`profile-card-${persona.toLowerCase()}`}
          />
        )}

        {/* Vorschau und Vertretung (board 29): Vorstand and Teammanager only. */}
        {canUsePreviewCover(activeClub) ? (
          <PreviewCoverEntryCard onPress={() => setPreviewCoverOpen(true)} />
        ) : availableRoleModes.length > 1 ? (
          <RoleModeCard
            title={t('more.roleModeTitle')}
            subtitle={
              activeRoleMode
                ? t(`roles.${activeRoleMode}`)
                : t('more.roleModeHint')
            }
            onPress={() => setRoleSheetOpen(true)}
          />
        ) : null}

        {persona === 'COACH' && teamName ? (
          <SectionGroup header={t('profileHub.myTeam')}>
            <ListRow
              left={<SoftIcon name="person.2.fill" />}
              title={teamName}
              subtitle={t(`teamRoles.${activeTeamAccess?.role ?? 'HEAD_COACH'}`)}
              showChevron
              onPress={() => router.push('/(tabs)/squad' as never)}
            />
          </SectionGroup>
        ) : null}

        {persona === 'PARENT' ? (
          <SectionGroup
            header={t('profileHub.myChildren')}
            footer={children.length === 0 ? t('profileHub.noChildrenHint') : undefined}
          >
            {children.length === 0 ? (
              <ListRow
                left={<SoftIcon name="figure.and.child.holdinghands" />}
                title={t('profileHub.noChildren')}
              />
            ) : (
              children.map((child) => (
                <ListRow
                  key={child.id}
                  left={<Avatar size={36} tone="neutral" fallbackText={child.name} />}
                  title={child.name}
                  subtitle={child.team}
                  showChevron
                  onPress={() => router.push('/(tabs)/events' as never)}
                />
              ))
            )}
            {/* privacy: guardian consent overview + withdrawal (GDPR Art. 7(3)) */}
            <ListRow
              left={<SoftIcon name="checkmark.shield.fill" />}
              title={t('childConsent.moreRowTitle')}
              subtitle={t('childConsent.moreRowSubtitle')}
              showChevron
              onPress={() => router.push('/child-consent' as never)}
              testID="more-child-consent"
            />
          </SectionGroup>
        ) : null}

        {isClubAdmin && persona === 'ADMIN' ? (
          <SectionGroup>
            <ListRow
              left={<SoftIcon name="building.2.fill" />}
              title={t('profileHub.openVerein')}
              subtitle={t('profileHub.openVereinHint')}
              showChevron
              onPress={() => router.push('/(tabs)/verein' as never)}
            />
          </SectionGroup>
        ) : null}

        <Section title={t('more.sectionTeam', { defaultValue: 'Team' })} rows={team} />
        <Section
          title={t('more.sectionClubApp', { defaultValue: 'Club and app' })}
          rows={clubAndApp}
        />
        <Section title={t('profileHub.sectionAccount')} rows={account} footer={appVersionFooter} />

        <Pressable
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel={t('more.signOut')}
          style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.6 }]}
          testID="more-sign-out"
        >
          <Icon name="rectangle.portrait.and.arrow.right" size="md" color={c.error} />
          <Text variant="subheadline" weight="semibold" style={{ color: c.error }}>
            {t('more.signOut')}
          </Text>
        </Pressable>
      </ScrollView>

      <ClubSwitcher visible={clubSwitcherVisible} onClose={() => setClubSwitcherVisible(false)} />
      <PreviewCoverSheet visible={previewCoverOpen} onClose={() => setPreviewCoverOpen(false)} />
      <BottomSheet visible={roleSheetOpen} onClose={() => setRoleSheetOpen(false)} heightPct="auto">
        <View style={styles.sheet}>
          <Text variant="title3" weight="bold" color="primary">
            {t('more.roleModeTitle')}
          </Text>
          <Text variant="subheadline" color="secondary">
            {t('more.roleModeHint')}
          </Text>
          <SectionGroup>
            {availableRoleModes.map((mode) => (
              <ListRow
                key={mode}
                left={<SoftIcon name={roleModeIcon(mode)} />}
                title={t(`roles.${mode === 'ADMIN' ? 'ADMIN' : mode}`)}
                selected={activeRoleMode === mode}
                right={
                  activeRoleMode === mode ? (
                    <Icon name="checkmark" size="md" color="primary" />
                  ) : undefined
                }
                onPress={() => {
                  setActiveRoleMode(mode)
                  setRoleSheetOpen(false)
                }}
              />
            ))}
          </SectionGroup>
        </View>
      </BottomSheet>
      <BottomSheet visible={appearanceOpen} onClose={() => setAppearanceOpen(false)} heightPct="auto">
        <View style={styles.sheet}>
          <Text variant="title3" weight="bold" color="primary">
            {t('profileHub.appearance')}
          </Text>
          <SectionGroup>
            {APPEARANCE_OPTIONS.map((option) => (
              <ListRow
                key={option}
                title={t(`profileHub.appearanceOption.${option}`)}
                selected={appearance === option}
                right={
                  appearance === option ? <Icon name="checkmark" size="md" color="primary" /> : undefined
                }
                onPress={() => {
                  setAppearance(option)
                  void setAppearancePreference(option)
                  setAppearanceOpen(false)
                }}
              />
            ))}
          </SectionGroup>
        </View>
      </BottomSheet>
    </View>
  )
}

function roleModeIcon(mode: string): IconName {
  if (mode === 'ADMIN') return 'building.2.fill'
  if (mode === 'COACH') return 'whistle'
  if (mode === 'PARENT') return 'figure.and.child.holdinghands'
  return 'figure.soccer'
}

/** The design's profile card: white r20, 48pt club avatar, name, roles, chevron. */
function ProfileCard({
  name,
  avatarUrl,
  subtitle,
  testID,
}: {
  name: string
  avatarUrl: string | null
  subtitle: string
  testID?: string
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <Pressable
      onPress={() => router.push('/edit-profile')}
      accessibilityRole="button"
      accessibilityLabel={t('profileHub.editProfile')}
      testID={testID}
      android_ripple={{ color: c.borderSubtle }}
      style={({ pressed }) => [
        styles.profileCard,
        { backgroundColor: c.surface },
        pressed && styles.pressedScale,
      ]}
    >
      <Avatar size={48} src={avatarUrl} fallbackText={name} />
      <View style={styles.profileText}>
        <Text variant="body" color="primary" weight="bold" numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text variant="footnote" color="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron.right" size="md" color="secondary" />
    </Pressable>
  )
}

/** Ink card that opens the role-mode sheet ("Anstoss nutzen als"). */
function RoleModeCard({
  title,
  subtitle,
  onPress,
}: {
  title: string
  subtitle: string
  onPress: () => void
}) {
  const c = useClubColors()
  const isDark = useIsDark()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      testID="more-role-mode"
      style={({ pressed }) => [
        styles.profileCard,
        { backgroundColor: c.ink },
        pressed && styles.pressedScale,
      ]}
    >
      <Icon name="arrow.left.arrow.right" size="md" color={isDark ? c.onInk : c.accent} />
      <View style={styles.profileText}>
        <Text variant="subheadline" weight="bold" style={{ color: c.onInk }} numberOfLines={1}>
          {title}
        </Text>
        <Text variant="footnote" style={{ color: c.onInk, opacity: 0.7 }} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Icon name="chevron.right" size="md" color={c.onInk} />
    </Pressable>
  )
}

function Section({ title, rows, footer }: { title: string; rows: Row[]; footer?: string }) {
  if (rows.length === 0) return null
  return (
    <SectionGroup header={title} footer={footer}>
      {rows.map((row) => (
        <RowView key={row.key} row={row} />
      ))}
    </SectionGroup>
  )
}

function RowView({ row }: { row: Row }) {
  const c = useClubColors()
  return (
    <ListRow
      left={<SoftIcon name={row.icon} color={row.destructive ? c.error : undefined} />}
      title={row.label}
      subtitle={row.sub}
      destructive={row.destructive}
      right={
        row.value ? (
          <Text variant="subheadline" color="secondary" numberOfLines={1}>
            {row.value}
          </Text>
        ) : undefined
      }
      showChevron={Boolean(row.onPress) && !row.destructive}
      onPress={row.onPress}
    />
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: SPACING_LG,
    paddingBottom: TAB_BAR_CLEARANCE + SPACING_XXXL,
    gap: SPACING_XL,
  },
  h1: { fontSize: 30, lineHeight: 33 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingVertical: SPACING_MD,
    paddingHorizontal: SPACING_LG,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  profileText: { flex: 1, minWidth: 0, gap: SPACING_XXS },
  signOut: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING_SM,
  },
  sheet: { gap: SPACING_MD, paddingBottom: SPACING_MD },
  pressedScale: { transform: [{ scale: 0.985 }] },
})
