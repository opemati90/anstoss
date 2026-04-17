import { useState } from 'react'
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
import { TAB_BAR_CLEARANCE, card, elevation, fontSize, space, radius, fonts, hairline, lineHeight } from '../../../src/theme/tokens'
import { setAppLanguage, getAppLanguage, getLanguageLabel, type AppLanguage } from '../../../src/i18n'

const LEGAL_BASE_URL = 'https://anstoss.io/legal.html'

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
          style={[styles.profileCard, { backgroundColor: c.surface, borderColor: c.border }]}
          onPress={() => router.push('/edit-profile')}
          accessibilityRole="button"
          accessibilityLabel={t('accountNextStep.editProfileAction')}
        >
          <View style={[styles.avatar, { backgroundColor: c.clubPrimaryLight }]}>
            <Text style={[styles.avatarText, { color: c.clubPrimary }]}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: c.textPrimary }]} numberOfLines={1}>{name}</Text>
            <Text style={[styles.profileEmail, { color: c.textSecondary }]} numberOfLines={1}>{user?.email}</Text>
          </View>
          <Icon name="chevron.right" size="sm" color={c.textTertiary} />
        </Pressable>

        <Text style={[styles.sectionLabel, { color: c.textTertiary }]} numberOfLines={1}>{t('more.sectionApp')}</Text>
        <View style={[styles.menuGroup, { backgroundColor: c.surface, borderColor: c.border }]}>
          <MenuItem
            icon="bell"
            label={t('notificationSettings.title')}
            onPress={() => router.push('/notification-settings')}
            color={c.textPrimary}
          />
          <MenuItem
            icon="globe"
            label={t('more.language')}
            subtitle={getLanguageLabel(getAppLanguage())}
            onPress={handleChangeLanguage}
            color={c.textPrimary}
          />
          <MenuItem
            icon="receipt"
            label={t('contributions.myTitle')}
            onPress={() => router.push('/my-contributions')}
            color={c.textPrimary}
          />
        </View>

        <Text style={[styles.sectionLabel, { color: c.textTertiary }]} numberOfLines={1}>{t('more.sectionLegal')}</Text>
        <View style={[styles.menuGroup, { backgroundColor: c.surface, borderColor: c.border }]}>
          <MenuItem
            icon="info.circle"
            label={t('more.about')}
            subtitle={`v${Constants.expoConfig?.version || '1.0.0'}`}
            color={c.textPrimary}
          />
          <MenuItem
            icon="doc.text"
            label={t('more.impressum')}
            onPress={() => Linking.openURL(`${LEGAL_BASE_URL}#impressum`)}
            color={c.textPrimary}
          />
          <MenuItem
            icon="checkmark.shield"
            label={t('more.privacy')}
            onPress={() => Linking.openURL(`${LEGAL_BASE_URL}#datenschutz`)}
            color={c.textPrimary}
          />
          <MenuItem
            icon="book"
            label={t('more.terms')}
            onPress={() => Linking.openURL(`${LEGAL_BASE_URL}#nutzungsbedingungen`)}
            color={c.textPrimary}
          />
        </View>

        <Text style={[styles.sectionLabel, { color: c.textTertiary }]} numberOfLines={1}>{t('more.sectionData')}</Text>
        <View style={[styles.menuGroup, { backgroundColor: c.surface, borderColor: c.border }]}>
          <MenuItem
            icon="arrow.down.circle"
            label={t('more.exportData')}
            subtitle={t('more.exportDataSubtitle')}
            onPress={handleExportData}
            color={c.textPrimary}
          />
          <MenuItem
            icon="trash"
            label={t('more.deleteAccount')}
            subtitle={t('more.deleteAccountSubtitle')}
            onPress={handleDeleteAccount}
            color={c.error}
          />
        </View>

        <Pressable
          testID="more-sign-out"
          style={[styles.signOutButton, { borderColor: c.border, backgroundColor: c.surface }]}
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

function MenuItem({
  icon,
  label,
  subtitle,
  onPress,
  color,
}: {
  icon: IconName
  label: string
  subtitle?: string
  onPress?: () => void
  color: string
}) {
  const c = useClubColors()

  return (
    <Pressable
      style={[styles.menuItem, { borderBottomColor: c.border }]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size="lg" color={color} />
      <View style={styles.menuItemContent}>
        <Text style={[styles.menuItemLabel, { color: c.textPrimary }]} numberOfLines={1}>{label}</Text>
        {subtitle && <Text style={[styles.menuItemSubtitle, { color: c.textSecondary }]} numberOfLines={2}>{subtitle}</Text>}
      </View>
      {onPress && (
        <Icon name="chevron.right" size="sm" color={c.textTertiary} />
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.sm + space.xs, paddingBottom: TAB_BAR_CLEARANCE + space.lg },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: card.heroRadius,
    padding: card.padding,
    borderWidth: hairline,
    marginBottom: space.lg,
    ...elevation.card,
  },
  avatar: { width: 52, height: 52, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: fontSize.xl, fontFamily: fonts.heading },
  profileInfo: { marginLeft: space.md, flex: 1 },
  profileName: { fontSize: fontSize.lg, fontFamily: fonts.heading },
  profileEmail: { fontSize: fontSize.sm, marginTop: space['2xs'], fontFamily: fonts.body, lineHeight: lineHeight.sm },
  sectionLabel: {
    fontSize: fontSize.xs,
    letterSpacing: 0.5,
    marginBottom: space.sm,
    marginTop: space.lg,
    fontFamily: fonts.label,
  },
  menuGroup: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: hairline,
  },
  menuItemContent: { flex: 1, marginLeft: space.md },
  menuItemLabel: { fontSize: fontSize.md, fontFamily: fonts.label },
  menuItemSubtitle: { fontSize: fontSize.xs, marginTop: space['2xs'], fontFamily: fonts.body, lineHeight: lineHeight.xs },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginTop: space.xl,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  signOutText: { fontSize: fontSize.md, fontFamily: fonts.label },
})
