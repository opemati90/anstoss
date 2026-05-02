import { useMemo } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { isFeatureEnabled } from '../../src/utils/featureFlags'
import { resolveHomeRole } from '../../src/components/home/resolveHomeRole'
import { HomeErrorBoundary } from '../../src/components/home/HomeErrorBoundary'
import { LegacyHomeScreen } from '../../src/components/home/LegacyHomeScreen'
import { AdminHome } from '../../src/components/home/AdminHome'
import { CoachHome } from '../../src/components/home/CoachHome'
import { PlayerHome } from '../../src/components/home/PlayerHome'
import { ParentHome } from '../../src/components/home/ParentHome'
import { FreeAgentHome } from '../../src/components/home/FreeAgentHome'
import { EmptyState } from '../../src/components/EmptyState'
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
  const { t } = useTranslation()

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
        { paddingBottom: TAB_BAR_CLEARANCE + space.lg },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.body}>
        {roleSection ?? (
          <View style={styles.fallback}>
            <EmptyState
              icon="house.fill"
              title={t('home.fallbackTitle', { defaultValue: 'Welcome to Anstoss' })}
              description={t('home.fallbackBody', {
                defaultValue:
                  activeClub
                    ? 'We could not load your home feed. Pull to refresh or check back in a moment.'
                    : 'Join or create a club to see your feed here.',
              })}
            />
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.md },
  body: {},
  fallback: { paddingTop: space['2xl'] },
})
