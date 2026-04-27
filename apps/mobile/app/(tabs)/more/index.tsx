import { useState, Fragment } from 'react'
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Linking,
} from 'react-native'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api, setAuthExpiryHandlingSuspended } from '../../../src/api/client'
import { SelectionSheet } from '../../../src/components/SelectionSheet'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { Icon, Text, type IconName } from '../../../src/components/ui'
import { TAB_BAR_CLEARANCE, fontSize, space, radius, fonts, hairline, lineHeight } from '../../../src/theme/tokens'
import { setAppLanguage, getAppLanguage, getLanguageLabel, type AppLanguage } from '../../../src/i18n'

const LEGAL_BASE_URL = 'https://anstoss.io/legal.html'

type MenuRow = {
  key: string
  icon: IconName
  label: string
  subtitle?: string
  onPress?: () => void
  tintColor?: string
}

export default function MoreScreen() {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const c = useClubColors()
  const [isLanguageSheetOpen, setIsLanguageSheetOpen] = useState(false)

  const handleChangeLanguage = () => {
    setIsLanguageSheetOpen(true)
  }

  const handleExportData = () => {
    Alert.alert(t('more.exportData'), t('more.exportComingSoon'))
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
            router.replace('/(auth)/sign-in')
          } catch {
            Alert.alert(t('common.error'), t('more.deleteAccountError'))
          }
        },
      },
    ])
  }

  const handleConfirmedSignOut = () => {
    void signOut()
    router.replace('/(auth)/sign-in')
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
          handleConfirmedSignOut()
        },
      },
    ])
  }

  const name = user?.name || 'Player'
  const languageOptions: { label: string; value: AppLanguage; description: string }[] = [
    {
      label: 'Deutsch',
      value: 'de',
      description: t('more.languageChoiceDescriptionDe'),
    },
    {
      label: 'English',
      value: 'en',
      description: t('more.languageChoiceDescriptionEn'),
    },
    {
      label: 'Fran\u00e7ais',
      value: 'fr',
      description: t('more.languageChoiceDescriptionFr'),
    },
    {
      label: 'Portugu\u00eas',
      value: 'pt',
      description: t('more.languageChoiceDescriptionPt'),
    },
    {
      label: 'Italiano',
      value: 'it',
      description: t('more.languageChoiceDescriptionIt'),
    },
  ]

  const appSectionRows: MenuRow[] = [
    {
      key: 'notifications',
      icon: 'bell',
      label: t('notificationSettings.title'),
      onPress: () => router.push('/notification-settings'),
    },
    {
      key: 'language',
      icon: 'globe',
      label: t('more.language'),
      subtitle: getLanguageLabel(getAppLanguage()),
      onPress: handleChangeLanguage,
    },
    {
      key: 'contributions',
      icon: 'receipt',
      label: t('contributions.myTitle'),
      onPress: () => router.push('/my-contributions'),
    },
  ]

  const legalSectionRows: MenuRow[] = [
    {
      key: 'about',
      icon: 'info.circle',
      label: t('more.about'),
      subtitle: `v${Constants.expoConfig?.version || '1.0.0'}`,
    },
    {
      key: 'impressum',
      icon: 'doc.text',
      label: t('more.impressum'),
      onPress: () => Linking.openURL(`${LEGAL_BASE_URL}#impressum`),
    },
    {
      key: 'privacy',
      icon: 'checkmark.shield',
      label: t('more.privacy'),
      onPress: () => Linking.openURL(`${LEGAL_BASE_URL}#datenschutz`),
    },
    {
      key: 'terms',
      icon: 'book',
      label: t('more.terms'),
      onPress: () => Linking.openURL(`${LEGAL_BASE_URL}#nutzungsbedingungen`),
    },
  ]

  const dataSectionRows: MenuRow[] = [
    {
      key: 'export',
      icon: 'arrow.down.circle',
      label: t('more.exportData'),
      subtitle: t('more.exportDataSubtitle'),
      onPress: handleExportData,
    },
    {
      key: 'delete',
      icon: 'trash',
      label: t('more.deleteAccount'),
      subtitle: t('more.deleteAccountSubtitle'),
      onPress: handleDeleteAccount,
      tintColor: c.error,
    },
  ]

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TabScreenHeader
          title={t('more.title')}
          compact
        />

        <Pressable
          style={({ pressed }) => [styles.profileRow, pressed && { opacity: 0.75 }]}
          onPress={() => router.push('/edit-profile')}
          accessibilityRole="button"
          accessibilityLabel={t('accountNextStep.editProfileAction')}
        >
          <View style={[styles.avatar, { backgroundColor: c.primary50 }]}>
            <Text style={[styles.avatarText, { color: c.primary }]}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: c.textPrimary }]} numberOfLines={1}>{name}</Text>
            <Text style={[styles.profileEmail, { color: c.textSecondary }]} numberOfLines={1}>{user?.email}</Text>
          </View>
          <Icon name="chevron.right" size="sm" color={c.textTertiary} />
        </Pressable>

        <SectionGroup title={t('more.sectionApp')} rows={appSectionRows} />
        <SectionGroup title={t('more.sectionLegal')} rows={legalSectionRows} />
        <SectionGroup title={t('more.sectionData')} rows={dataSectionRows} />

        <Pressable
          testID="more-sign-out"
          style={({ pressed }) => [
            styles.signOutButton,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel={t('more.signOut')}
        >
          <Icon name="rectangle.portrait.and.arrow.right" size="md" color={c.error} />
          <Text style={[styles.signOutText, { color: c.error }]}>{t('more.signOut')}</Text>
        </Pressable>
      </ScrollView>

      <SelectionSheet
        visible={isLanguageSheetOpen}
        title={t('more.languageChoiceTitle')}
        description={t('more.languageChoiceBody')}
        options={languageOptions}
        selectedValue={getAppLanguage()}
        onClose={() => setIsLanguageSheetOpen(false)}
        onSelect={(value) => {
          if (value !== getAppLanguage()) {
            void setAppLanguage(value)
          }
        }}
      />
    </View>
  )
}

function SectionGroup({ title, rows }: { title: string; rows: MenuRow[] }) {
  const c = useClubColors()
  return (
    <View style={styles.sectionBlock}>
      <Text style={[styles.sectionCaption, { color: c.textTertiary }]}>{title}</Text>
      <View
        style={[
          styles.groupCard,
          { backgroundColor: c.surface, borderColor: c.borderDefault },
        ]}
      >
        {rows.map((row, index) => {
          const { key: _key, ...rest } = row
          return (
            <Fragment key={row.key}>
              <MenuItem {...rest} />
              {index < rows.length - 1 ? (
                <View style={[styles.rowDivider, { backgroundColor: c.borderDefault }]} />
              ) : null}
            </Fragment>
          )
        })}
      </View>
    </View>
  )
}

function MenuItem({
  icon,
  label,
  subtitle,
  onPress,
  tintColor,
}: MenuRow) {
  const c = useClubColors()
  const labelColor = tintColor ?? c.textPrimary

  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuItem,
        pressed && onPress && { backgroundColor: c.surfaceSunken },
      ]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size="md" color={tintColor ?? c.textSecondary} />
      <View style={styles.menuItemContent}>
        <Text style={[styles.menuItemLabel, { color: labelColor }]} numberOfLines={1}>{label}</Text>
        {subtitle ? (
          <Text style={[styles.menuItemSubtitle, { color: c.textSecondary }]} numberOfLines={2}>{subtitle}</Text>
        ) : null}
      </View>
      {onPress ? (
        <Icon name="chevron.right" size="sm" color={c.textTertiary} />
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm + space.xs,
    paddingBottom: TAB_BAR_CLEARANCE + space.lg,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    marginBottom: space.lg,
    gap: space.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: fontSize.xl, fontFamily: fonts.heading },
  profileInfo: { flex: 1 },
  profileName: { fontSize: fontSize.lg, fontFamily: fonts.heading },
  profileEmail: {
    fontSize: fontSize.sm,
    marginTop: space['2xs'],
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  sectionBlock: {
    marginBottom: space.xl,
  },
  sectionCaption: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: space.sm,
    marginLeft: space.sm,
  },
  groupCard: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
  },
  rowDivider: {
    height: hairline,
    marginLeft: space.md + 24 + space.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.md,
  },
  menuItemContent: { flex: 1 },
  menuItemLabel: { fontSize: fontSize.md, fontFamily: fonts.label },
  menuItemSubtitle: {
    fontSize: fontSize.xs,
    marginTop: space['2xs'],
    fontFamily: fonts.body,
    lineHeight: lineHeight.xs,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginTop: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  signOutText: { fontSize: fontSize.md, fontFamily: fonts.label },
})
