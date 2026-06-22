/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { View, StyleSheet, Pressable, ScrollView, Alert, Linking } from 'react-native'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api, setAuthExpiryHandlingSuspended } from '../../../src/api/client'
import {
  Icon,
  Text,
  type IconName,
  SectionGroup,
  ListRow,
  SettingsIcon,
  SettingsIconTint,
} from '../../../src/components/ui'
import {
  TAB_BAR_CLEARANCE,
  fontSize,
  space,
  fonts,
  hairline,
  radius,
  lineHeight,
} from '../../../src/theme/tokens'
import { getAppLanguage, getLanguageLabel } from '../../../src/i18n'

type Row = {
  key: string
  label: string
  sub?: string
  icon: IconName
  onPress?: () => void
  destructive?: boolean
}

export default function MoreScreen() {
  const { t } = useTranslation()
  const { user, signOut, activeClub, memberships } = useAuth()
  const c = useClubColors()
  const isOwnerOrAdmin =
    activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'

  // GDPR data export: until we ship a self-service export endpoint
  // (post-MVP), let the user submit the request via mailto: which
  // satisfies Art. 15 DSGVO and removes the dead-end Alert from More.
  const handleExportData = () => {
    const subject = encodeURIComponent('Anstoss — DSGVO data export request')
    const body = encodeURIComponent(
      `Hello Anstoss support,\n\nI'd like to export my account data per Art. 15 DSGVO.\n\nUser email: ${user?.email ?? '—'}\nUser ID: ${user?.id ?? '—'}\nClub: ${activeClub?.club?.name ?? '—'}\n\n— Sent from the Anstoss mobile app`,
    )
    Linking.openURL(`mailto:support@anstoss.io?subject=${subject}&body=${body}`).catch(
      () =>
        Alert.alert(
          t('more.exportData'),
          t('more.exportFallback', {
            defaultValue:
              'Email support@anstoss.io with the subject "DSGVO data export" and we’ll send your data within 30 days.',
          }),
        ),
    )
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

  const handleConfirmedSignOut = () => {
    void signOut()
    router.replace('/(auth)/welcome')
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
        onPress: () => handleConfirmedSignOut(),
      },
    ])
  }

  const name = user?.name || 'Player'
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n.charAt(0).toUpperCase())
    .join('')

  // Free agents have no activeClub yet, so club-scoped tools (duties,
  // trikotwart, pitch, vereinsheim, streaks, exchange, voice memos,
  // contributions) don't apply until they accept a trial and join a club.
  // Show a streamlined menu instead and surface their marketplace profile
  // as the headline action.
  const isFreeAgent = !activeClub && user?.registrationRole === 'FREE_AGENT'
  // Parents see their child's schedule + handle contributions and the
  // boot exchange — but they don't run team operations (duties,
  // trikotwart, pitch, vereinsheim, streaks). Strip those rows so the
  // parent menu reads as "your stuff", not "the squad's stuff".
  const isParent = activeClub?.role === 'PARENT'

  const accountFreeAgent: Row[] = [
    {
      key: 'free-agent-profile',
      label: t('more.freeAgentProfile', { defaultValue: 'Your player profile' }),
      sub: t('more.freeAgentProfileSub', {
        defaultValue: 'Edit your marketplace listing',
      }) as string,
      icon: 'person.circle',
      onPress: () => router.push('/free-agent/profile'),
    },
    {
      key: 'notifications',
      label: t('notificationSettings.title'),
      sub: t('more.notificationsSub') as string,
      icon: 'bell.fill',
      onPress: () => router.push('/notification-settings'),
    },
  ]

  // Menu rows show only what has a real API behind it. Operational
  // tools — duties, trikotwart, pitch-status, vereinsheim, streaks,
  // exchange — render fine on tap but call endpoints that don't exist
  // yet, so we keep the screen files for the second sprint and hide
  // the entries here. Voice memos / Sportgericht / Compliance /
  // Ehrenamt-Stunden are cut from MVP for the same reason.
  const accountClubMember: Row[] = [
    {
      key: 'profile',
      label: t('more.profile') as string,
      sub: user?.email ?? (t('more.profileSub') as string),
      icon: 'person.circle',
      onPress: () => router.push('/edit-profile'),
    },
    {
      key: 'notifications',
      label: t('notificationSettings.title'),
      sub: t('more.notificationsSub') as string,
      icon: 'bell.fill',
      onPress: () => router.push('/notification-settings'),
    },
    {
      key: 'contributions',
      label: t('contributions.myTitle'),
      sub: t('more.contributionsSub') as string,
      icon: 'banknote',
      onPress: () => router.push('/my-contributions'),
    },
  ]

  const account: Row[] = isFreeAgent
    ? accountFreeAgent
    : isParent
      ? accountClubMember.filter((row) =>
          ['profile', 'notifications', 'contributions'].includes(row.key),
        )
      : accountClubMember

  // Switch-club only makes sense when the user actually belongs to more
  // than one club. Hide the section entirely otherwise — single-club is
  // the common case and there's no second destination to switch to.
  const membershipCount = memberships?.length ?? 0
  const club: Row[] = membershipCount > 1
    ? [
        {
          key: 'switch',
          label: t('more.switchClub', { defaultValue: 'Switch club' }),
          sub: t('more.switchClubSub', {
            defaultValue: '{{count}} memberships available',
            count: membershipCount,
          }) as string,
          icon: 'arrow.right',
          onPress: () => router.push('/find-club' as never),
        },
      ]
    : []

  const app: Row[] = [
    {
      key: 'language',
      label: t('more.language'),
      sub: getLanguageLabel(getAppLanguage()),
      icon: 'globe',
      onPress: () => router.push('/language' as never),
    },
    {
      key: 'legal',
      label: t('more.legal', { defaultValue: 'Legal' }),
      sub: t('more.legalSub', { defaultValue: 'Impressum · Privacy · Terms · Cookies' }),
      icon: 'doc.text',
      onPress: () => router.push('/legal' as never),
    },
    {
      key: 'about',
      label: t('more.about'),
      sub: `v${Constants.expoConfig?.version || '1.0.0'}`,
      icon: 'flag',
    },
  ]

  const admin: Row[] = isOwnerOrAdmin
    ? [
        {
          key: 'join-requests',
          label: t('more.joinRequests', { defaultValue: 'Join requests' }),
          sub: t('more.joinRequestsSub', {
            defaultValue: 'Review and approve club applicants',
          }) as string,
          icon: 'person.badge.plus',
          onPress: () => router.push('/pending-requests'),
        },
        {
          key: 'members',
          label: t('more.adminMembers', { defaultValue: 'Manage members' }),
          sub: t('more.adminMembersSub', {
            defaultValue: 'Invites, roles, and club membership',
          }) as string,
          icon: 'person.2.fill',
          onPress: () => router.push('/admin-members'),
        },
      ]
    : []

  const data: Row[] = [
    {
      key: 'export',
      label: t('more.exportData'),
      sub: t('more.exportDataSubtitle'),
      icon: 'square.and.arrow.up',
      onPress: handleExportData,
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
      icon: 'arrow.right',
      onPress: handleSignOut,
      destructive: true,
    },
  ]

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => router.push('/edit-profile')}
          accessibilityRole="button"
          accessibilityLabel={t('more.profile') as string}
          style={({ pressed }) => [
            styles.profileCard,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
            pressed && { opacity: 0.96 },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: c.primary }]}>
            <Text style={[styles.avatarText, { color: c.textInverse }]}>
              {initials || 'A'}
            </Text>
          </View>
          <View style={styles.profileText}>
            <Text style={[styles.profileName, { color: c.textPrimary }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.profileMeta, { color: c.textSecondary }]} numberOfLines={1}>
              {activeClub?.club?.name ?? user?.email ?? ''}
            </Text>
          </View>
          <Icon name="chevron.right" size={16} color="tertiary" />
        </Pressable>

        <Section title={t('more.sectionAccount') as string} rows={account} />
        {club.length > 0 ? (
          <Section title={t('more.sectionClub') as string} rows={club} />
        ) : null}
        {admin.length > 0 ? (
          <Section title={t('more.sectionAdmin', { defaultValue: 'Club admin' }) as string} rows={admin} />
        ) : null}
        <Section title={t('more.sectionApp') as string} rows={app} />
        <Section title={t('more.sectionData') as string} rows={data} />
      </ScrollView>
    </View>
  )
}

// Restrained leading-square tint: blue reserved for account/identity rows,
// red for destructive, neutral gray for everything else. Avoids the
// per-row rainbow that competed for attention (see Home de-rainbow pass).
const ROW_TINT: Record<string, string> = {
  'free-agent-profile': SettingsIconTint.blue,
  profile: SettingsIconTint.blue,
  switch: SettingsIconTint.blue,
  notifications: SettingsIconTint.gray,
  contributions: SettingsIconTint.gray,
  language: SettingsIconTint.gray,
  legal: SettingsIconTint.gray,
  about: SettingsIconTint.gray,
  'join-requests': SettingsIconTint.gray,
  members: SettingsIconTint.gray,
  export: SettingsIconTint.gray,
  delete: SettingsIconTint.red,
  signout: SettingsIconTint.gray,
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <SectionGroup header={title.toUpperCase()} style={styles.section}>
      {rows.map((row) => (
        <RowView key={row.key} row={row} />
      ))}
    </SectionGroup>
  )
}

function RowView({ row }: { row: Row }) {
  const tint = row.destructive
    ? SettingsIconTint.red
    : ROW_TINT[row.key] ?? SettingsIconTint.gray
  return (
    <ListRow
      left={<SettingsIcon name={row.icon} tint={tint} />}
      title={row.label}
      subtitle={row.sub}
      destructive={row.destructive}
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
    paddingBottom: TAB_BAR_CLEARANCE + space.lg,
  },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    marginBottom: space.lg,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontFamily: fonts.heading,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  profileText: { flex: 1, gap: 2 },
  profileName: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  profileMeta: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },

  section: { marginTop: space.md },
})
