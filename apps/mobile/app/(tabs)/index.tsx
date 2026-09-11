import { useCallback, useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
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
import { PlayerIdentityBar } from '../../src/components/home/PlayerIdentityBar'
import { SponsorStrip } from '../../src/components/sponsors/SponsorStrip'
import { EmptyState } from '../../src/components/EmptyState'
import { Text } from '../../src/components/ui'
import { fontSize, fonts, radius, space, TAB_BAR_CLEARANCE } from '../../src/theme/tokens'

type RefreshHandle = { refresh: () => void; refreshing: boolean }

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
  const { user, activeClub, activeTeamId, activeTeamAccess, activeRoleMode } = useAuth()
  const c = useClubColors()
  const { t } = useTranslation()

  const clubRole = activeClub?.role ?? null
  const teamRole = activeTeamAccess?.role ?? null
  const registrationRole = user?.registrationRole ?? null
  const role = useMemo(
    () => activeRoleMode ?? resolveHomeRole({ clubRole, registrationRole, teamRole }),
    [activeRoleMode, clubRole, registrationRole, teamRole],
  )

  // Pull-to-refresh belongs to the scroll view, but only the role section knows
  // how to reload itself. The section hands its refresh function up; sections
  // that don't (yet) participate simply leave the control inert.
  const [refreshHandle, setRefreshHandle] = useState<RefreshHandle | null>(null)
  const handleRefreshState = useCallback((handle: RefreshHandle) => {
    setRefreshHandle(handle)
  }, [])

  const clubId = activeClub?.club.id ?? null
  const roleSection = useMemo(() => {
    if (role === 'ADMIN' && clubId) return <AdminHome clubId={clubId} teamId={activeTeamId} />
    if (role === 'COACH' && clubId) return <CoachHome clubId={clubId} teamId={activeTeamId} />
    if (role === 'PLAYER' && clubId)
      return (
        <PlayerHome
          clubId={clubId}
          teamId={activeTeamId}
          onRefreshStateChange={handleRefreshState}
        />
      )
    if (role === 'PARENT') return <ParentHome />
    if (role === 'FREE_AGENT') return <FreeAgentHome />
    return null
  }, [role, clubId, activeTeamId, handleRefreshState])

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_CLEARANCE + space.lg }]}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        refreshHandle ? (
          <RefreshControl
            refreshing={refreshHandle.refreshing}
            onRefresh={refreshHandle.refresh}
            tintColor={c.textTertiary}
          />
        ) : undefined
      }
    >
      <View style={styles.body}>
        {roleSection ? (
          <>
            {/* Identity belongs to the screen, not to one role's section.
                Every role opens this tab and every role should see who they
                are and which team they are acting in. */}
            <PlayerIdentityBar
              name={user?.name ?? ''}
              avatarUrl={user?.avatarUrl}
              // Optional-chain through `team` too: a membership row can carry
              // access without an embedded team object, and stopping the chain
              // at `activeTeamAccess` crashed the whole home screen into the
              // error boundary.
              teamName={
                activeTeamAccess?.team?.displayName || activeTeamAccess?.team?.name || null
              }
              roleLabel={role ? t(`roles.${role}`, { defaultValue: '' }) : null}
            />
            {roleSection}
            {clubId ? <SponsorStrip clubId={clubId} /> : null}
          </>
        ) : (
          <View style={styles.fallback}>
            {!activeClub && user?.registrationRole === 'CLUB_ADMIN' ? (
              <>
                <EmptyState
                  icon="checkmark.shield"
                  title={t('home.adminSetupTitle', {
                    defaultValue: 'Finish setting up your club',
                  })}
                  description={t('home.adminSetupBody', {
                    defaultValue:
                      "Add your club name, colours, and a team. Players can't join until you're done.",
                  })}
                />
                <Pressable
                  onPress={() => router.push('/find-club')}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.cta,
                    { backgroundColor: c.textPrimary },
                    pressed && styles.ctaPressed,
                  ]}
                >
                  <Text weight="bold" style={[styles.ctaLabel, { color: c.surface }]}>
                    {t('home.adminSetupCta', {
                      defaultValue: 'Set up club',
                    })}
                  </Text>
                </Pressable>
              </>
            ) : (
              <EmptyState
                icon="house.fill"
                title={t('home.fallbackTitle', { defaultValue: 'Welcome to Anstoss' })}
                description={t('home.fallbackBody', {
                  defaultValue: activeClub
                    ? 'We could not load your home feed. Pull to refresh or check back in a moment.'
                    : 'Join or create a club to see your feed here.',
                })}
              />
            )}
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.md },
  body: { gap: space.lg },
  fallback: { paddingTop: space['2xl'], gap: space.lg },
  cta: {
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: space.md,
  },
  ctaLabel: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    letterSpacing: 0,
  },
  ctaPressed: {
    transform: [{ scale: 0.98 }],
  },
})
