import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native'
import Constants from 'expo-constants'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { neutralColors, semanticColors } from '../../../src/theme/tokens'
import { setAppLanguage, getAppLanguage, getLanguageLabel, type AppLanguage } from '../../../src/i18n'

export default function MoreScreen() {
  const { t } = useTranslation()
  const { user, activeClub, signOut } = useAuth()
  const theme = useClubColors()
  const isParent = activeClub?.role === 'PARENT'
  const isAdmin = activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'

  const handleInvite = () => {
    if (!activeClub) return
    router.push({
      pathname: '/invite',
      params: { returnTo: '/(tabs)/more' },
    })
  }

  const handleChangeLanguage = () => {
    const current = getAppLanguage()
    const options: { label: string; value: AppLanguage }[] = [
      { label: 'Deutsch', value: 'de' },
      { label: 'English', value: 'en' },
    ]
    Alert.alert(
      t('more.languageChoiceTitle'),
      undefined,
      [
        ...options.map((opt) => ({
          text: `${opt.label}${opt.value === current ? ' ✓' : ''}`,
          onPress: () => {
            if (opt.value !== current) {
              void setAppLanguage(opt.value)
            }
          },
        })),
        { text: t('common.cancel'), style: 'cancel' as const },
      ],
    )
  }

  const handleSignOut = () => {
    Alert.alert(t('more.signOutTitle'), t('more.signOutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('more.signOut'), style: 'destructive', onPress: () => signOut().then(() => router.replace('/')) },
    ])
  }

  const name = user?.name || 'Player'

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TabScreenHeader
          title={t('more.title')}
          subtitle={activeClub?.club.name || user?.email || undefined}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.profileCard} onPress={() => router.push('/edit-profile')}>
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
                subtitle={activeClub.role}
                color={theme.clubPrimary}
              />
              <MenuItem
                icon="person-add-outline"
                label={t('more.invitePlayers')}
                onPress={handleInvite}
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
            icon="notifications-outline"
            label={t('notificationSettings.title')}
            onPress={() => router.push('/notification-settings')}
            color={neutralColors.textPrimary}
          />
          <MenuItem
            icon="language-outline"
            label={t('more.language')}
            subtitle={getLanguageLabel(getAppLanguage())}
            onPress={handleChangeLanguage}
            color={neutralColors.textPrimary}
          />
          <MenuItem icon="information-circle-outline" label={t('more.about')} subtitle={`v${Constants.expoConfig?.version || '1.0.0'}`} color={neutralColors.textPrimary} />
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color={semanticColors.error} />
          <Text style={styles.signOutText}>{t('more.signOut')}</Text>
        </TouchableOpacity>
      </ScrollView>
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
    <TouchableOpacity style={styles.menuItem} onPress={onPress} disabled={!onPress}>
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
  header: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  content: { padding: 20, paddingBottom: 100 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: neutralColors.surface,
    borderRadius: 12, padding: 16, borderWidth: 1, borderColor: neutralColors.border, marginBottom: 24,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 22, fontWeight: '700' },
  profileInfo: { marginLeft: 14, flex: 1 },
  profileName: { fontSize: 18, fontWeight: '600', color: neutralColors.textPrimary },
  profileEmail: { fontSize: 14, color: neutralColors.textSecondary, marginTop: 2 },
  sectionLabel: {
    fontSize: 12, fontWeight: '600', color: neutralColors.textTertiary,
    letterSpacing: 1, marginBottom: 8, marginTop: 8,
  },
  menuGroup: {
    backgroundColor: neutralColors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: neutralColors.border, marginBottom: 16, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderBottomWidth: 1, borderBottomColor: neutralColors.border,
  },
  menuItemContent: { flex: 1, marginLeft: 14 },
  menuItemLabel: { fontSize: 16, color: neutralColors.textPrimary },
  menuItemSubtitle: { fontSize: 13, color: neutralColors.textSecondary, marginTop: 2 },
  signOutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, marginTop: 16,
  },
  signOutText: { fontSize: 16, fontWeight: '500', color: semanticColors.error },
})
