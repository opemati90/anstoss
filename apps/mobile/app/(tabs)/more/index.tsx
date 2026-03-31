import { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
} from 'react-native'
import Constants from 'expo-constants'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api, ApiError } from '../../../src/api/client'
import { SelectionSheet } from '../../../src/components/SelectionSheet'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { neutralColors, semanticColors, fontSize, space, radius, fonts, fontWeight } from '../../../src/theme/tokens'
import { setAppLanguage, getAppLanguage, getLanguageLabel, type AppLanguage } from '../../../src/i18n'

const LEGAL_BASE_URL = 'https://anstoss.io/legal.html'

export default function MoreScreen() {
  const { t } = useTranslation()
  const { user, activeClub, activeTeamAccess, signOut } = useAuth()
  const theme = useClubColors()
  const [isLanguageSheetOpen, setIsLanguageSheetOpen] = useState(false)
  const isParent = activeClub?.role === 'PARENT'
  const isAdmin = activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'
  const canInvite =
    isAdmin ||
    activeClub?.role === 'COACH' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'
  const isFreeAgent = user?.registrationRole === 'FREE_AGENT'
  const activeRoleLabel = activeClub?.role ? t(`roles.${activeClub.role}`) : undefined

  const handleInvite = () => {
    if (!activeClub) return
    router.push({
      pathname: '/invite',
      params: { returnTo: '/(tabs)/more' },
    })
  }

  const handleChangeLanguage = () => {
    setIsLanguageSheetOpen(true)
  }

  const handleExportData = async () => {
    try {
      const data = await api('/me/export')
      const json = JSON.stringify(data, null, 2)
      // In a real implementation, save to file system. For now, show success.
      Alert.alert(t('more.exportSuccess'))
    } catch {
      Alert.alert(t('common.error'), t('more.exportError'))
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
            router.replace('/(auth)/sign-in')
          } catch {
            Alert.alert(t('common.error'), t('more.deleteAccountError'))
          }
        },
      },
    ])
  }

  const handleConfirmedSignOut = async () => {
    await signOut()
    router.replace('/(auth)/sign-in')
  }

  const handleSignOut = () => {
    Alert.alert(t('more.signOutTitle'), t('more.signOutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('more.signOut'),
        style: 'destructive',
        onPress: () => {
          void handleConfirmedSignOut()
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
      label: 'Français',
      value: 'fr',
      description: t('more.languageChoiceDescriptionFr'),
    },
    {
      label: 'Português',
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
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TabScreenHeader
          title={t('more.title')}
          subtitle={user?.email || undefined}
          compact
        />

        <TouchableOpacity style={styles.profileCard} onPress={() => router.push('/edit-profile')} accessibilityRole="button" accessibilityLabel={t('more.editProfile', { defaultValue: name })}>
          <View style={[styles.avatar, { backgroundColor: theme.clubPrimaryLight }]}>
            <Text style={[styles.avatarText, { color: theme.clubPrimary }]}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{name}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={neutralColors.textTertiary} />
        </TouchableOpacity>

        {activeClub && (
          <>
            <Text style={styles.sectionLabel}>{t('more.sectionClub')}</Text>
            <View style={styles.menuGroup}>
              <MenuItem
                icon="shield-outline"
                label={activeClub.club.name}
                subtitle={activeRoleLabel}
                color={theme.clubPrimary}
              />
              {isParent && (
                <MenuItem
                  icon="people-outline"
                  label={t('parentSchedule.title')}
                  onPress={() => router.push('/parent-schedule')}
                  color={theme.clubPrimary}
                />
              )}
              {canInvite && (
                <MenuItem
                  icon="person-add-outline"
                  label={t('more.invitePlayers')}
                  onPress={handleInvite}
                  color={theme.clubPrimary}
                />
              )}
              {canInvite && (
                <MenuItem
                  icon="git-branch-outline"
                  label={t('more.manageFamilies')}
                  subtitle={t('more.manageFamiliesSubtitle')}
                  onPress={() => router.push('/team-families')}
                  color={theme.clubPrimary}
                />
              )}
              {isAdmin && (
                <MenuItem
                  icon="walk-outline"
                  label={t('more.transferList')}
                  subtitle={t('more.transferListSubtitle')}
                  onPress={() => router.push('/transfer-list')}
                  color={theme.clubPrimary}
                />
              )}
              {isAdmin && (
                <MenuItem
                  icon="people-circle-outline"
                  label={t('more.manageStaff')}
                  subtitle={t('more.manageStaffSubtitle')}
                  onPress={() => router.push('/club-staff')}
                  color={theme.clubPrimary}
                />
              )}
              {isAdmin && (
                <MenuItem
                  icon="settings-outline"
                  label={t('adminDashboard.title')}
                  onPress={() => router.push('/admin-dashboard')}
                  color={theme.clubPrimary}
                />
              )}
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>{t('more.sectionApp')}</Text>
        <View style={styles.menuGroup}>
          <MenuItem
            icon="chatbubbles-outline"
            label={t('more.messages')}
            subtitle={t('more.messagesSubtitle')}
            onPress={() => router.push('/dm-list')}
            color={neutralColors.textPrimary}
          />
          <MenuItem
            icon="notifications-outline"
            label={t('notificationSettings.title')}
            onPress={() => router.push('/notification-settings')}
            color={neutralColors.textPrimary}
          />
          {isFreeAgent ? (
            <MenuItem
              icon="walk-outline"
              label={t('more.playerMarketplace')}
              subtitle={t('more.playerMarketplaceSubtitle')}
              onPress={() => router.push('/free-agent/profile')}
              color={neutralColors.textPrimary}
            />
          ) : null}
          <MenuItem
            icon="language-outline"
            label={t('more.language')}
            subtitle={getLanguageLabel(getAppLanguage())}
            onPress={handleChangeLanguage}
            color={neutralColors.textPrimary}
          />
          <MenuItem icon="information-circle-outline" label={t('more.about')} subtitle={`v${Constants.expoConfig?.version || '1.0.0'}`} color={neutralColors.textPrimary} />
        </View>

        <Text style={styles.sectionLabel}>{t('more.sectionLegal')}</Text>
        <View style={styles.menuGroup}>
          <MenuItem
            icon="document-text-outline"
            label={t('more.impressum')}
            onPress={() => Linking.openURL(`${LEGAL_BASE_URL}#impressum`)}
            color={neutralColors.textPrimary}
          />
          <MenuItem
            icon="shield-checkmark-outline"
            label={t('more.privacy')}
            onPress={() => Linking.openURL(`${LEGAL_BASE_URL}#datenschutz`)}
            color={neutralColors.textPrimary}
          />
          <MenuItem
            icon="reader-outline"
            label={t('more.terms')}
            onPress={() => Linking.openURL(`${LEGAL_BASE_URL}#nutzungsbedingungen`)}
            color={neutralColors.textPrimary}
          />
          <MenuItem
            icon="download-outline"
            label={t('more.exportData')}
            subtitle={t('more.exportDataSubtitle')}
            onPress={handleExportData}
            color={neutralColors.textPrimary}
          />
          <MenuItem
            icon="trash-outline"
            label={t('more.deleteAccount')}
            subtitle={t('more.deleteAccountSubtitle')}
            onPress={handleDeleteAccount}
            color={semanticColors.error}
          />
        </View>

        <TouchableOpacity
          testID="more-sign-out"
          style={styles.signOutButton}
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel={t('more.signOut')}
        >
          <Ionicons name="log-out-outline" size={20} color={semanticColors.error} />
          <Text style={styles.signOutText}>{t('more.signOut')}</Text>
        </TouchableOpacity>
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
  icon: any
  label: string
  subtitle?: string
  onPress?: () => void
  color: string
}) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={22} color={color} />
      <View style={styles.menuItemContent}>
        <Text style={styles.menuItemLabel}>{label}</Text>
        {subtitle && <Text style={styles.menuItemSubtitle}>{subtitle}</Text>}
      </View>
      {onPress && (
        <Ionicons name="chevron-forward" size={18} color={neutralColors.textTertiary} />
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: { paddingHorizontal: space.md, paddingTop: 12, paddingBottom: 100 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: neutralColors.surface,
    borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: neutralColors.border, marginBottom: space.lg,
  },
  avatar: { width: 52, height: 52, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, fontFamily: fonts.heading },
  profileInfo: { marginLeft: space.md, flex: 1 },
  profileName: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: neutralColors.textPrimary, fontFamily: fonts.heading },
  profileEmail: { fontSize: fontSize.sm, color: neutralColors.textSecondary, marginTop: space['2xs'], fontFamily: fonts.body },
  sectionLabel: {
    fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: neutralColors.textTertiary,
    letterSpacing: 1, marginBottom: space.sm, marginTop: space.sm, fontFamily: fonts.label,
  },
  menuGroup: {
    backgroundColor: neutralColors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: neutralColors.border, marginBottom: space.md, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', padding: space.md,
    borderBottomWidth: 1, borderBottomColor: neutralColors.border,
  },
  menuItemContent: { flex: 1, marginLeft: 14 },
  menuItemLabel: { fontSize: fontSize.md, color: neutralColors.textPrimary, fontFamily: fonts.body },
  menuItemSubtitle: { fontSize: fontSize.xs, color: neutralColors.textSecondary, marginTop: space['2xs'], fontFamily: fonts.body },
  signOutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: space.sm, paddingVertical: space.md, marginTop: space.md,
  },
  signOutText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: semanticColors.error, fontFamily: fonts.label },
})
