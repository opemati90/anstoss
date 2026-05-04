import { Fragment } from 'react'
import { View, StyleSheet, Pressable, ScrollView, Alert } from 'react-native'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api, setAuthExpiryHandlingSuspended } from '../../../src/api/client'
import { Icon, Text, type IconName } from '../../../src/components/ui'
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

  const handleExportData = () =>
    Alert.alert(t('more.exportData'), t('more.exportComingSoon'))

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

  const account: Row[] = [
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
    {
      key: 'duties',
      label: t('duties.title', { defaultValue: 'Team duties' }),
      sub: t('more.dutiesSub', {
        defaultValue: 'Cake duty · pitch set-up · referee escort',
      }) as string,
      icon: 'checklist',
      onPress: () => router.push('/duty-roster' as never),
    },
    {
      key: 'trikotwart',
      label: t('trikotwart.title', { defaultValue: 'Trikotwart' }),
      sub: t('more.trikotwartSub', {
        defaultValue: 'Jersey rotation · washing log',
      }) as string,
      icon: 'tshirt',
      onPress: () => router.push('/trikotwart' as never),
    },
    {
      key: 'pitch',
      label: t('pitch.title', { defaultValue: 'Pitch status' }),
      sub: t('more.pitchSub', {
        defaultValue: 'First-arriver pitch confirm',
      }) as string,
      icon: 'cloud.rain',
      onPress: () => router.push('/pitch-status' as never),
    },
    {
      key: 'vereinsheim',
      label: t('vereinsheim.title', { defaultValue: 'Vereinsheim' }),
      sub: t('more.vereinsheimSub', {
        defaultValue: 'Clubhouse menu · order to tab',
      }) as string,
      icon: 'fork.knife',
      onPress: () => router.push('/vereinsheim' as never),
    },
  ]

  // Switch-club only makes sense when the user actually belongs to more
  // than one club. Hide the section entirely otherwise — single-club is
  // the common case and there's no second destination to switch to.
  const club: Row[] = memberships.length > 1
    ? [
        {
          key: 'switch',
          label: t('more.switchClub', { defaultValue: 'Switch club' }),
          sub: t('more.switchClubSub', {
            defaultValue: '{{count}} memberships available',
            count: memberships.length,
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
      key: 'impressum',
      label: t('more.impressum'),
      icon: 'doc.text',
      onPress: () => router.push('/policy/impressum' as never),
    },
    {
      key: 'privacy',
      label: t('more.privacy'),
      icon: 'lock.fill',
      onPress: () => router.push('/policy/privacy' as never),
    },
    {
      key: 'terms',
      label: t('more.terms'),
      icon: 'doc.text',
      onPress: () => router.push('/policy/terms' as never),
    },
    {
      key: 'cookies',
      label: t('more.cookies', { defaultValue: 'Cookies' }),
      icon: 'doc.text',
      onPress: () => router.push('/policy/cookies' as never),
    },
    {
      key: 'about',
      label: t('more.about'),
      sub: `v${Constants.expoConfig?.version || '1.0.0'}`,
      icon: 'flag',
    },
  ]

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
        <Section title={t('more.sectionApp') as string} rows={app} />
        <Section title={t('more.sectionData') as string} rows={data} />
      </ScrollView>
    </View>
  )
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  const c = useClubColors()
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: c.textTertiary }]}>
        {title.toUpperCase()}
      </Text>
      <View
        style={[styles.sectionCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
      >
        {rows.map((row, i) => (
          <Fragment key={row.key}>
            {i > 0 ? (
              <View style={[styles.hairline, { backgroundColor: c.borderDefault }]} />
            ) : null}
            <RowView row={row} />
          </Fragment>
        ))}
      </View>
    </View>
  )
}

function RowView({ row }: { row: Row }) {
  const c = useClubColors()
  const tone = row.destructive ? c.error : c.textPrimary
  const bubbleBg = row.destructive ? withAlpha(c.error, 0.10) : c.surfaceSunken ?? c.background
  const iconColor = row.destructive ? c.error : c.textSecondary
  return (
    <Pressable
      onPress={row.onPress}
      disabled={!row.onPress}
      accessibilityRole="button"
      accessibilityLabel={row.label}
      style={({ pressed }) => [
        styles.row,
        pressed && row.onPress ? { opacity: 0.96 } : null,
      ]}
    >
      <View style={[styles.iconBubble, { backgroundColor: bubbleBg }]}>
        <Icon name={row.icon} size={16} color={iconColor} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: tone }]} numberOfLines={1}>
          {row.label}
        </Text>
        {row.sub ? (
          <Text style={[styles.rowSub, { color: c.textSecondary }]} numberOfLines={1}>
            {row.sub}
          </Text>
        ) : null}
      </View>
      {row.onPress && !row.destructive ? (
        <Icon name="chevron.right" size={14} color="tertiary" />
      ) : null}
    </Pressable>
  )
}

function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('rgb')) {
    return hex.replace(/rgba?\(([^)]+)\)/, (_, body) => {
      const parts = String(body)
        .split(',')
        .map((p) => p.trim())
        .slice(0, 3)
      return `rgba(${parts.join(', ')}, ${alpha})`
    })
  }
  if (!hex.startsWith('#')) return hex
  let h = hex.slice(1)
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
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
    width: 48,
    height: 48,
    borderRadius: 24,
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
  sectionTitle: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginBottom: space.xs,
    marginLeft: space.xs,
  },
  sectionCard: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  hairline: { height: hairline, marginLeft: 56 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm + 2,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: {
    fontSize: 15,
    fontFamily: fonts.heading,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  rowSub: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
})
