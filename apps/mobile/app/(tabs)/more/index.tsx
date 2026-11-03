import { useEffect, useState } from 'react'
import { View, StyleSheet, Pressable, ScrollView, Alert } from 'react-native'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
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
import { TAB_BAR_CLEARANCE, space, hairline, elevation, RADIUS_CARD } from '../../../src/theme/tokens'
import { getAppLanguage, getLanguageLabel } from '../../../src/i18n'
import { useChildrenSummary } from '../../../src/components/home/childrenSummary'
import { useAccountPrivacyActions } from '../../../src/hooks/useAccountPrivacyActions'
import { LAUNCH_FEATURES } from '@anstoss/shared'
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

/**
 * Profil tab. One identity card per persona (without season statistics),
 * team card for coaches, "Meine Kinder" for parents, Verein shortcut for
 * admins), then the same calm sections for everyone: Konto, Verein, App,
 * Daten & Rechtliches.
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

  useEffect(() => {
    void getAppearancePreference().then(setAppearance)
  }, [])

  const isFreeAgent = !activeClub && user?.registrationRole === 'FREE_AGENT'
  const clubRole = activeClub?.role ?? null
  const isOwner = clubRole === 'OWNER'
  const isClubAdmin = clubRole === 'OWNER' || clubRole === 'ADMIN'
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
                ? LAUNCH_FEATURES.youthParticipation ? 'PARENT' : 'NONE'
                : 'PLAYER')) as Persona)

  const { handleExportData, handleDeleteAccount } = useAccountPrivacyActions()

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

  // ── Konto ──
  const account: Row[] = isFreeAgent
    ? [
        {
          key: 'free-agent-profile',
          label: t('more.freeAgentProfile'),
          sub: t('more.freeAgentProfileSub'),
          icon: 'person.circle',
          // Wechselbörse: the player profile lives in the free agent's Profil tab.
          onPress: () => router.navigate('/(tabs)/profile'),
        },
        {
          key: 'notifications',
          label: t('notificationSettings.title'),
          sub: t('more.notificationsSub'),
          icon: 'bell',
          onPress: () => router.push('/notification-settings'),
        },
      ]
    : [
        {
          key: 'notifications',
          label: t('notificationSettings.title'),
          sub: t('more.notificationsSub'),
          icon: 'bell',
          onPress: () => router.push('/notification-settings'),
        },
        ...(activeClub
          ? [
              {
                key: 'contributions',
                label: t('contributions.myTitle'),
                sub: t('more.contributionsSub'),
                icon: 'banknote' as IconName,
                onPress: () => router.push('/my-contributions'),
              },
            ]
          : []),
      ]

  // ── Verein ──
  const club: Row[] = [
    ...(memberships.length > 1
      ? [
          {
            key: 'switch-club',
            label: t('profileHub.switchClub'),
            sub: activeClub?.club.name,
            icon: 'arrow.left.arrow.right' as IconName,
            onPress: () => setClubSwitcherVisible(true),
          },
        ]
      : []),
    {
      key: 'find-club',
      label: t('findClub.title'),
      sub: t('findClub.subtitle'),
      icon: 'magnifyingglass',
      onPress: () => router.push('/find-club'),
    },
    ...(isClubAdmin || user?.registrationRole === 'CLUB_ADMIN'
      ? [
          {
            key: 'create-club',
            label: t('club.createClub'),
            sub: t('club.setupWizard.createSubtitle'),
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
            sub: t('ownership.menuSubtitle'),
            icon: 'person.badge.key' as IconName,
            onPress: () => router.push('/ownership-transfers'),
          },
        ]
      : []),
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
  ]

  // ── App ──
  const app: Row[] = [
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
  ]

  // ── Daten & Rechtliches ──
  const data: Row[] = [
    {
      key: 'child-consent',
      label: t('childConsent.moreRowTitle'),
      sub: t('childConsent.moreRowSubtitle'),
      icon: 'checkmark.shield.fill',
      onPress: () => router.push('/child-consent' as never),
    },
    {
      key: 'legal',
      label: t('more.legal'),
      sub: t('more.legalSub'),
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
    {
      key: 'delete',
      label: t('more.deleteAccount'),
      sub: t('more.deleteAccountSubtitle'),
      icon: 'trash',
      onPress: handleDeleteAccount,
      destructive: true,
    },
    {
      key: 'signout',
      label: t('more.signOut'),
      icon: 'rectangle.portrait.and.arrow.right',
      onPress: handleSignOut,
      destructive: true,
    },
  ]

  const appVersionFooter = t('profileHub.version', {
    version: Constants.expoConfig?.version || '1.0.0',
  })

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ProfileCard
            name={name}
            avatarUrl={user?.avatarUrl ?? null}
            subtitle={
              persona === 'COACH'
                ? [teamName, t(`teamRoles.${activeTeamAccess?.role ?? 'HEAD_COACH'}`)]
                    .filter(Boolean)
                    .join(' · ')
                : persona === 'ADMIN'
                  ? [activeClub?.club.name, t(`verein.memberRole.${clubRole ?? 'ADMIN'}`)]
                      .filter(Boolean)
                      .join(' · ')
                  : persona === 'PARENT'
                    ? [activeClub?.club.name, t('roles.PARENT')].filter(Boolean).join(' · ')
                    : persona === 'PLAYER'
                      ? (activeClub?.club.name ?? user?.email ?? '')
                      : (user?.email ?? '')
            }
            testID={`profile-card-${persona.toLowerCase()}`}
          />

        {persona === 'COACH' && teamName ? (
          <SectionGroup header={t('profileHub.myTeam')} style={styles.section}>
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
            style={styles.section}
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
                  left={<Avatar size="md" fallbackText={child.name} />}
                  title={child.name}
                  subtitle={child.team}
                  showChevron
                  onPress={() => router.push('/(tabs)/events' as never)}
                />
              ))
            )}
          </SectionGroup>
        ) : null}

        {isClubAdmin && persona === 'ADMIN' ? (
          <SectionGroup style={styles.section}>
            <ListRow
              left={<SoftIcon name="building.2.fill" />}
              title={t('profileHub.openVerein')}
              subtitle={t('profileHub.openVereinHint')}
              showChevron
              onPress={() => router.push('/(tabs)/verein' as never)}
            />
          </SectionGroup>
        ) : null}

        <Section title={t('profileHub.sectionAccount')} rows={account} />

        {availableRoleModes.length > 1 ? (
          <SectionGroup
            header={t('more.roleModeTitle')}
            footer={t('more.roleModeHint')}
            style={styles.section}
          >
            {availableRoleModes.map((mode) => (
              <ListRow
                key={mode}
                left={<SoftIcon name={roleModeIcon(mode)} />}
                title={t(`roles.${mode === 'ADMIN' ? 'ADMIN' : mode}`)}
                selected={activeRoleMode === mode}
                right={
                  activeRoleMode === mode ? (
                    <Icon name="checkmark" size="md" color="tint" />
                  ) : undefined
                }
                onPress={() => setActiveRoleMode(mode)}
              />
            ))}
          </SectionGroup>
        ) : null}

        {!isFreeAgent || club.length > 0 ? (
          <Section title={t('profileHub.sectionClub')} rows={club} />
        ) : null}
        <Section title={t('profileHub.sectionApp')} rows={app} />
        <Section title={t('profileHub.sectionData')} rows={data} footer={appVersionFooter} />
      </ScrollView>

      <ClubSwitcher visible={clubSwitcherVisible} onClose={() => setClubSwitcherVisible(false)} />
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
                  appearance === option ? <Icon name="checkmark" size="md" color="tint" /> : undefined
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
        elevation.card,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
        pressed && styles.pressedScale,
      ]}
    >
      <Avatar size="lg" src={avatarUrl} fallbackText={name} />
      <View style={styles.profileText}>
        <Text variant="title3" color="primary" weight="bold" numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text variant="subheadline" color="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron.right" size="md" color="tertiary" />
    </Pressable>
  )
}

function Section({ title, rows, footer }: { title: string; rows: Row[]; footer?: string }) {
  if (rows.length === 0) return null
  return (
    <SectionGroup header={title} footer={footer} style={styles.section}>
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
          <Text variant="body" color="secondary" numberOfLines={1}>
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
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: TAB_BAR_CLEARANCE + space.xl,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  profileText: { flex: 1, minWidth: 0, gap: space['2xs'] },
  section: { marginTop: space.md },
  sheet: { gap: space.md, paddingBottom: space.md },
  pressedScale: { transform: [{ scale: 0.985 }] },
})
