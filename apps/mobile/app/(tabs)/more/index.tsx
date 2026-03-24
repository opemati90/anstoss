import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import {
  getLanguageLabel,
  setAppLanguage,
  type AppLanguage,
} from '../../../src/i18n'
import { neutralColors, semanticColors } from '../../../src/theme/tokens'

export default function MoreScreen() {
  const { t, i18n } = useTranslation()
  const {
    user,
    activeClub,
    activeTeamAccess,
    availableTeams,
    setActiveTeamId,
    signOut,
  } = useAuth()
  const theme = useClubColors()
  const currentLanguage: AppLanguage = i18n.resolvedLanguage === 'en' ? 'en' : 'de'

  const handleLanguageChoice = () => {
    Alert.alert(t('more.languageChoiceTitle'), undefined, [
      {
        text: 'Deutsch',
        onPress: () => {
          void setAppLanguage('de')
        },
      },
      {
        text: 'English',
        onPress: () => {
          void setAppLanguage('en')
        },
      },
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
    ])
  }

  const handleSignOut = () => {
    Alert.alert(t('more.signOutTitle'), t('more.signOutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('more.signOut'),
        style: 'destructive',
        onPress: () => {
          void signOut().then(() => router.replace('/'))
        },
      },
    ])
  }

  const handleTeamChoice = () => {
    if (availableTeams.length === 0) return

    Alert.alert(
      t('more.teamChoiceTitle'),
      undefined,
      [
        ...availableTeams.map((entry) => ({
          text: `${entry.team.displayName} · ${entry.team.group.displayName}`,
          onPress: () => {
            setActiveTeamId(entry.team.id)
          },
        })),
        {
          text: t('common.cancel'),
          style: 'cancel' as const,
        },
      ],
    )
  }

  const name = user?.name || t('home.fallbackName')
  const roleLabel = activeClub?.role ? t(`roles.${activeClub.role}`) : undefined
  const canManageClub =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeClub?.role === 'COACH' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>{t('more.title')}</Text>

      <View style={styles.profileCard}>
        <View style={[styles.avatar, { backgroundColor: theme.clubPrimaryLight }]}>
          <Text style={[styles.avatarText, { color: theme.clubPrimary }]}>
            {name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{name}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
        </View>
      </View>

      {activeClub && (
        <>
          <Text style={styles.sectionLabel}>{t('more.sectionClub')}</Text>
          <View style={styles.menuGroup}>
            <MenuItem
              icon="shield-outline"
              label={activeClub.club.name}
              subtitle={roleLabel}
              color={theme.clubPrimary}
            />
            <MenuItem
              icon="git-branch-outline"
              label={t('more.activeTeam')}
              subtitle={activeTeamAccess?.team.displayName || t('team.noTeams')}
              onPress={handleTeamChoice}
              color={theme.clubPrimary}
            />
            {canManageClub ? (
              <>
                <MenuItem
                  icon="person-add-outline"
                  label={t('more.invitePlayers')}
                  onPress={() => router.push('/invite')}
                  color={theme.clubPrimary}
                />
                <MenuItem
                  icon="layers-outline"
                  label={t('more.manageTeams')}
                  onPress={() => router.push('/team-management')}
                  color={theme.clubPrimary}
                />
              </>
            ) : null}
          </View>
        </>
      )}

      <Text style={styles.sectionLabel}>{t('more.sectionApp')}</Text>
      <View style={styles.menuGroup}>
        <MenuItem
          icon="language-outline"
          label={t('more.language')}
          subtitle={getLanguageLabel(currentLanguage)}
          onPress={handleLanguageChoice}
          color={neutralColors.textPrimary}
        />
        <MenuItem
          icon="notifications-outline"
          label={t('more.notifications')}
          color={neutralColors.textPrimary}
        />
        <MenuItem
          icon="information-circle-outline"
          label={t('more.about')}
          subtitle="v0.0.1"
          color={neutralColors.textPrimary}
        />
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color={semanticColors.error} />
        <Text style={styles.signOutText}>{t('more.signOut')}</Text>
      </TouchableOpacity>
    </ScrollView>
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
        {subtitle ? <Text style={styles.menuItemSubtitle}>{subtitle}</Text> : null}
      </View>
      {onPress ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={neutralColors.textTertiary}
        />
      ) : null}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 100 },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: neutralColors.textPrimary,
    marginBottom: 20,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: neutralColors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: neutralColors.border,
    marginBottom: 24,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '700' },
  profileInfo: { marginLeft: 14, flex: 1 },
  profileName: { fontSize: 18, fontWeight: '600', color: neutralColors.textPrimary },
  profileEmail: { fontSize: 14, color: neutralColors.textSecondary, marginTop: 2 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: neutralColors.textTertiary,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 8,
  },
  menuGroup: {
    backgroundColor: neutralColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: neutralColors.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
  },
  menuItemContent: { flex: 1, marginLeft: 14 },
  menuItemLabel: { fontSize: 16, color: neutralColors.textPrimary },
  menuItemSubtitle: { fontSize: 13, color: neutralColors.textSecondary, marginTop: 2 },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 16,
  },
  signOutText: { fontSize: 16, fontWeight: '500', color: semanticColors.error },
})
