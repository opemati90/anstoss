import { useCallback, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { LAUNCH_FEATURES } from '@anstoss/shared'
import { AdultLaunchScreen } from '../../src/onboarding/AdultLaunchScreen'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { resolveRoleMode } from '../../src/components/home/resolveHomeRole'
import { HomeErrorBoundary } from '../../src/components/home/HomeErrorBoundary'
import { InlineError } from '../../src/components/home/HomeKit'
import { AdminHome } from '../../src/components/home/AdminHome'
import { CoachHome } from '../../src/components/home/CoachHome'
import { PlayerHome } from '../../src/components/home/PlayerHome'
import { ParentHome } from '../../src/components/home/ParentHome'
import { FreeAgentHome } from '../../src/components/home/FreeAgentHome'
import { EmptyState } from '../../src/components/EmptyState'
import { Button } from '../../src/components/ui'
// onboarding revamp: verification banner, "Kind hinzufügen" to-do, welcome notice.
import { HomeOnboardingNotices } from '../../src/onboarding/HomeOnboardingNotices'
import { space, TAB_BAR_CLEARANCE } from '../../src/theme/tokens'

type RefreshHandle = { refresh: () => void; refreshing: boolean }

export default function HomeScreen() {
  return (
    <HomeErrorBoundary fallback={(_error, reset) => <HomeCrashFallback onRetry={reset} />}>
      <RoleAwareHome />
    </HomeErrorBoundary>
  )
}

/** A crash inside a role home shrinks to one card with a retry, not a blank tab. */
function HomeCrashFallback({ onRetry }: { onRetry: () => void }) {
  const c = useClubColors()
  const { t } = useTranslation()
  return (
    <View style={[styles.container, styles.crash, { backgroundColor: c.background }]}>
      <InlineError
        title={t('homeHub.crashTitle', { defaultValue: "Home couldn't be shown" })}
        body={t('homeHub.crashBody', {
          defaultValue: 'Something went wrong on our side. Try again, your data is safe.',
        })}
        onRetry={onRetry}
      />
    </View>
  )
}

function RoleAwareHome() {
  const { user, signOut, activeClub, activeTeamId, activeTeamAccess, activeRoleMode, pendingClubClaim } =
    useAuth()
  const c = useClubColors()
  const { t } = useTranslation()

  const clubRole = activeClub?.role ?? null
  const teamRole = activeTeamAccess?.role ?? null
  const registrationRole = user?.registrationRole ?? null
  // Same resolver as the tab header, so the header and this home agree.
  const role = useMemo(
    () => resolveRoleMode({ activeRoleMode, clubRole, registrationRole, teamRole }),
    [activeRoleMode, clubRole, registrationRole, teamRole],
  )

  // Pull-to-refresh belongs to the scroll view, but only the role section knows
  // how to reload itself. The section hands its refresh function up.
  const clubId = activeClub?.club.id ?? null
  // Each (role, club, team) gets a fresh home: a switch remounts the section
  // so no state, in-flight request or reminder of the previous team survives.
  const sectionKey = `${role}:${clubId ?? ''}:${activeTeamId ?? ''}`

  // The handle is tagged with the section that sent it; after a switch the
  // old section's handle is ignored until the new one reports in, so pull
  // to refresh never reloads the wrong home.
  const [taggedHandle, setTaggedHandle] = useState<(RefreshHandle & { key: string }) | null>(null)
  const handleRefreshState = useCallback(
    (handle: RefreshHandle) => setTaggedHandle({ ...handle, key: sectionKey }),
    [sectionKey],
  )
  const refreshHandle = taggedHandle?.key === sectionKey ? taggedHandle : null

  const roleSection = useMemo(() => {
    if (role === 'ADMIN' && clubId)
      return (
        <AdminHome
          key={sectionKey}
          clubId={clubId}
          teamId={activeTeamId}
          onRefreshStateChange={handleRefreshState}
        />
      )
    if (role === 'COACH' && clubId)
      return (
        <CoachHome
          key={sectionKey}
          clubId={clubId}
          teamId={activeTeamId}
          onRefreshStateChange={handleRefreshState}
        />
      )
    if (role === 'PLAYER' && clubId)
      return (
        <PlayerHome
          key={sectionKey}
          clubId={clubId}
          teamId={activeTeamId}
          onRefreshStateChange={handleRefreshState}
        />
      )
    if (role === 'PARENT')
      return LAUNCH_FEATURES.youthParticipation ? <ParentHome key={sectionKey} onRefreshStateChange={handleRefreshState} />
        : <AdultLaunchScreen onDone={() => { void signOut().then(() => router.replace('/(auth)/welcome')).catch(() => undefined) }} />
    if (role === 'FREE_AGENT') return <FreeAgentHome />
    return null
  }, [role, clubId, activeTeamId, handleRefreshState, sectionKey])

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
      {/* Identity (club, team, role) lives once, in the tab header. The body
          starts straight with what the user has to do. */}
      {/* onboarding revamp: notices sit above the role section. */}
      <HomeOnboardingNotices />
      {roleSection ? (
        <View style={styles.body}>
          {roleSection}
        </View>
      ) : pendingClubClaim && !activeClub ? null /* onboarding revamp: the verification banner says it all */ : (
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
              <Button
                label={t('home.adminSetupCta', { defaultValue: 'Set up club' })}
                onPress={() => router.push('/find-club')}
                fullWidth
              />
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
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  crash: { paddingHorizontal: space.md, paddingTop: space.md },
  // 16pt screen gutters, 24pt between sections (set by each role home). The
  // header already ends 12pt above, so 4pt here keeps 16pt to the first section.
  content: { paddingHorizontal: space.md, paddingTop: space.xs },
  body: { gap: space.lg },
  fallback: { paddingTop: space['2xl'], gap: space.lg },
})
