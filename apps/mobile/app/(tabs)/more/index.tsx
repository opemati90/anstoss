import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Share,
} from 'react-native'
import Constants from 'expo-constants'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api } from '../../../src/api/client'
import { neutralColors, semanticColors } from '../../../src/theme/tokens'

export default function MoreScreen() {
  const { t } = useTranslation()
  const { user, activeClub, signOut } = useAuth()
  const theme = useClubColors()
  const isParent = activeClub?.role === 'PARENT'
  const isAdmin = activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'

  const handleInvite = async () => {
    if (!activeClub) return
    try {
      const invite = await api<{ code: string }>(`/clubs/${activeClub.club.id}/invites`, {
        method: 'POST',
      })
      const link = `https://anstoss.app/join/${invite.code}`
      await Share.share({
        message: `Join ${activeClub.club.name} on Anstoss!\n${link}`,
      })
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create invite')
    }
  }

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut().then(() => router.replace('/')) },
    ])
  }

  const name = user?.name || 'Player'

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>More</Text>

      {/* Profile card */}
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

      {/* Club section */}
      {activeClub && (
        <>
          <Text style={styles.sectionLabel}>CLUB</Text>
          <View style={styles.menuGroup}>
            <MenuItem
              icon="shield-outline"
              label={activeClub.club.name}
              subtitle={activeClub.role}
              color={theme.clubPrimary}
            />
            <MenuItem
              icon="person-add-outline"
              label="Invite Players"
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
                icon="stats-chart-outline"
                label={t('clubStats.title')}
                onPress={() => router.push('/club-stats')}
                color={theme.clubPrimary}
              />
            )}
          </View>
        </>
      )}

      {/* App section */}
      <Text style={styles.sectionLabel}>APP</Text>
      <View style={styles.menuGroup}>
        <MenuItem icon="information-circle-outline" label="About Anstoss" subtitle={`v${Constants.expoConfig?.version || '1.0.0'}`} color={neutralColors.textPrimary} />
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color={semanticColors.error} />
        <Text style={styles.signOutText}>Sign Out</Text>
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
  content: { padding: 20, paddingTop: 60, paddingBottom: 100 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: neutralColors.textPrimary, marginBottom: 20 },
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
