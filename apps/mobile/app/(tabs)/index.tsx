import { useMemo } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { isFeatureEnabled } from '../../src/utils/featureFlags'
import { resolveHomeRole } from '../../src/components/home/resolveHomeRole'
import { HomeHeader } from '../../src/components/home/HomeHeader'
import { HomeErrorBoundary } from '../../src/components/home/HomeErrorBoundary'
import { LegacyHomeScreen } from '../../src/components/home/LegacyHomeScreen'
import { AdminHome } from '../../src/components/home/AdminHome'
import { CoachHome } from '../../src/components/home/CoachHome'
import { PlayerHome } from '../../src/components/home/PlayerHome'
import { ParentHome } from '../../src/components/home/ParentHome'
import { FreeAgentHome } from '../../src/components/home/FreeAgentHome'
import { TAB_BAR_CLEARANCE, space } from '../../src/theme/tokens'

export default function HomeScreen() {
  const flagOn = isFeatureEnabled('anstoss.roleAwareHome')
  if (!flagOn) {
    return <LegacyHomeScreen />
  }
  return (
    <HomeErrorBoundary fallback={() => <LegacyHomeScreen />}>
      <RoleAwareHome />
    </HomeErrorBoundary>
  )
}

function RoleAwareHome() {
  const { user, activeClub, activeTeamId } = useAuth()
  const c = useClubColors()
  const insets = useSafeAreaInsets()

  const clubRole = activeClub?.role ?? null
  const registrationRole = user?.registrationRole ?? null
  const role = useMemo(
    () => resolveHomeRole({ clubRole, registrationRole }),
    [clubRole, registrationRole],
  )

  const clubId = activeClub?.club.id ?? null
  const roleSection = useMemo(() => {
    if (role === 'ADMIN' && clubId) return <AdminHome clubId={clubId} />
    if (role === 'COACH' && clubId)
      return <CoachHome clubId={clubId} teamId={activeTeamId} />
    if (role === 'PLAYER' && clubId)
      return <PlayerHome clubId={clubId} teamId={activeTeamId} />
    if (role === 'PARENT') return <ParentHome />
    if (role === 'FREE_AGENT') return <FreeAgentHome />
    return null
  }, [role, clubId, activeTeamId])

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + space.md,
          paddingBottom: TAB_BAR_CLEARANCE + space.lg,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <HomeHeader
        clubName={activeClub?.club.name ?? 'Anstoss'}
        clubBadgeUrl={activeClub?.club.badgeUrl ?? null}
        roleLabel={role}
        notificationCount={0}
        onNotificationsPress={() => router.push('/notifications' as never)}
      />

      <View style={styles.body}>{roleSection}</View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: space.lg },
  body: { marginTop: space.md },
})
