/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useState, Fragment } from 'react'
import { View, StyleSheet, Pressable, ScrollView, Alert, Linking } from 'react-native'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api, setAuthExpiryHandlingSuspended } from '../../../src/api/client'
import { SelectionSheet } from '../../../src/components/SelectionSheet'
import { Icon, Text } from '../../../src/components/ui'
import { TAB_BAR_CLEARANCE, fontSize, space, fonts, hairline, lineHeight } from '../../../src/theme/tokens'
import { setAppLanguage, getAppLanguage, getLanguageLabel, type AppLanguage } from '../../../src/i18n'

const LEGAL_BASE_URL = 'https://anstoss.io/legal.html'

type Row = {
  key: string
  label: string
  sub?: string
  onPress?: () => void
  destructive?: boolean
}

export default function MoreScreen() {
  const { t } = useTranslation()
  const { user, signOut, activeClub } = useAuth()
  const c = useClubColors()
  const [isLanguageSheetOpen, setIsLanguageSheetOpen] = useState(false)

  const handleChangeLanguage = () => setIsLanguageSheetOpen(true)
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

  const languageOptions: { label: string; value: AppLanguage; description: string }[] = [
    { label: 'Deutsch', value: 'de', description: t('more.languageChoiceDescriptionDe') },
    { label: 'English', value: 'en', description: t('more.languageChoiceDescriptionEn') },
    { label: 'Français', value: 'fr', description: t('more.languageChoiceDescriptionFr') },
    { label: 'Português', value: 'pt', description: t('more.languageChoiceDescriptionPt') },
    { label: 'Italiano', value: 'it', description: t('more.languageChoiceDescriptionIt') },
  ]

  const account: Row[] = [
    {
      key: 'profile',
      label: t('more.profile') as string,
      sub: t('more.profileSub') as string,
      onPress: () => router.push('/edit-profile'),
    },
    {
      key: 'phone',
      label: t('more.phoneLogin') as string,
      sub: user?.email ?? t('more.phoneLoginSub'),
      onPress: () => router.push('/edit-profile'),
    },
    {
      key: 'notifications',
      label: t('notificationSettings.title'),
      sub: t('more.notificationsSub') as string,
      onPress: () => router.push('/notification-settings'),
    },
    {
      key: 'contributions',
      label: t('contributions.myTitle'),
      sub: t('more.contributionsSub') as string,
      onPress: () => router.push('/my-contributions'),
    },
  ]

  const club: Row[] = activeClub
    ? [
        {
          key: 'club',
          label: activeClub.club?.name ?? t('more.club'),
          sub: t('more.clubSub') as string,
          onPress: () => router.push(`/club/${activeClub.club?.slug ?? ''}`),
        },
        {
          key: 'switch',
          label: t('more.switchClub') as string,
          sub: t('more.switchClubSub') as string,
        },
      ]
    : []

  const app: Row[] = [
    {
      key: 'language',
      label: t('more.language'),
      sub: getLanguageLabel(getAppLanguage()),
      onPress: handleChangeLanguage,
    },
    {
      key: 'about',
      label: t('more.about'),
      sub: `v${Constants.expoConfig?.version || '1.0.0'}`,
    },
    {
      key: 'impressum',
      label: t('more.impressum'),
      onPress: () => Linking.openURL(`${LEGAL_BASE_URL}#impressum`),
    },
    {
      key: 'privacy',
      label: t('more.privacy'),
      onPress: () => Linking.openURL(`${LEGAL_BASE_URL}#datenschutz`),
    },
    {
      key: 'terms',
      label: t('more.terms'),
      onPress: () => Linking.openURL(`${LEGAL_BASE_URL}#nutzungsbedingungen`),
    },
  ]

  const data: Row[] = [
    {
      key: 'export',
      label: t('more.exportData'),
      sub: t('more.exportDataSubtitle'),
      onPress: handleExportData,
    },
    {
      key: 'delete',
      label: t('more.deleteAccount'),
      sub: t('more.deleteAccountSubtitle'),
      onPress: handleDeleteAccount,
      destructive: true,
    },
    {
      key: 'signout',
      label: t('more.signOut'),
      onPress: handleSignOut,
      destructive: true,
    },
  ]

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileBlock}>
          <View
            style={[styles.avatar, { backgroundColor: c.primary }]}
          >
            <Text style={[styles.avatarText, { color: c.textInverse }]}>{initials || 'A'}</Text>
          </View>
          <View style={styles.profileText}>
            <Text style={[styles.profileName, { color: c.textPrimary }]} numberOfLines={1}>
              {name}
            </Text>
            {activeClub?.club?.name ? (
              <Text style={[styles.profileMeta, { color: c.textSecondary }]} numberOfLines={1}>
                {activeClub.club.name}
              </Text>
            ) : null}
          </View>
        </View>

        <Section title={t('more.sectionAccount') as string} rows={account} />
        {club.length > 0 ? <Section title={t('more.sectionClub') as string} rows={club} /> : null}
        <Section title={t('more.sectionApp') as string} rows={app} />
        <Section title={t('more.sectionData') as string} rows={data} />
      </ScrollView>

      <SelectionSheet
        visible={isLanguageSheetOpen}
        title={t('more.languageChoiceTitle')}
        description={t('more.languageChoiceBody')}
        options={languageOptions}
        selectedValue={getAppLanguage()}
        onClose={() => setIsLanguageSheetOpen(false)}
        onSelect={(value) => {
          if (value !== getAppLanguage()) void setAppLanguage(value)
        }}
      />
    </View>
  )
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  const c = useClubColors()
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: c.textTertiary }]}>{title.toUpperCase()}</Text>
      <View style={styles.sectionBody}>
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
  return (
    <Pressable
      onPress={row.onPress}
      disabled={!row.onPress}
      accessibilityRole="button"
      accessibilityLabel={row.label}
      style={({ pressed }) => [styles.row, pressed && row.onPress ? { opacity: 0.55 } : null]}
    >
      <View style={styles.rowText}>
        <Text
          style={[
            styles.rowLabel,
            { color: row.destructive ? c.error : c.textPrimary },
          ]}
          numberOfLines={1}
        >
          {row.label}
        </Text>
        {row.sub ? (
          <Text style={[styles.rowSub, { color: c.textSecondary }]} numberOfLines={1}>
            {row.sub}
          </Text>
        ) : null}
      </View>
      {row.onPress && !row.destructive ? (
        <Icon name="chevron.right" size="sm" color={c.textTertiary} />
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: TAB_BAR_CLEARANCE + space.lg,
  },
  profileBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: space.lg,
    gap: space.md,
  },
  avatar: {
    width: 52,
    height: 52,
    // eslint-disable-next-line no-restricted-syntax -- TODO Pass 3 spacing
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: fontSize.lg, fontFamily: fonts.heading, fontWeight: '700' },
  profileText: { flex: 1, gap: 2 },
  profileName: { fontSize: fontSize.lg, fontFamily: fonts.heading, fontWeight: '700', letterSpacing: -0.4 },
  profileMeta: { fontSize: fontSize.sm, fontFamily: fonts.body, lineHeight: lineHeight.sm, opacity: 0.7 },
  section: { marginTop: space.lg },
  sectionTitle: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginBottom: space.xs,
    paddingHorizontal: space['2xs'],
    opacity: 0.7,
  },
  sectionBody: {
    paddingHorizontal: space['2xs'],
  },
  hairline: { height: hairline },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: space.sm,
    gap: space.md,
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: fontSize.md, fontFamily: fonts.heading, fontWeight: '600', letterSpacing: -0.2 },
  rowSub: { fontSize: fontSize.sm, fontFamily: fonts.body, lineHeight: lineHeight.sm, opacity: 0.6 },
})