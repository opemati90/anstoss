/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useRef, useState } from 'react'
import { Alert, Animated, Easing, Image, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RegistrationRole } from '@anstoss/shared'
import { Icon, Text, type IconName } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { ConfettiBurst } from '../../src/components/wizard/ConfettiBurst'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { activateE2EScenario } from '../../src/e2e/session'
import { api, setTokenGetter } from '../../src/api/client'
import { uploadMedia } from '../../src/api/uploadMedia'
import { useAuth } from '@clerk/clerk-expo'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

const DEV_SCENARIO_BY_ROLE: Record<
  RegistrationRole,
  'player' | 'parent' | 'coach' | 'club-admin' | 'free-agent'
> = {
  [RegistrationRole.PLAYER]: 'player',
  [RegistrationRole.PARENT]: 'parent',
  [RegistrationRole.COACH]: 'coach',
  [RegistrationRole.CLUB_ADMIN]: 'club-admin',
  [RegistrationRole.FREE_AGENT]: 'free-agent',
}

type NextTile = {
  key: string
  /** Icon glyph from the app's IconName set. Replaces the previous
   * emoji-as-decor pattern — emoji on the first post-onboarding screen
   * read AI-generated and dropped the visual quality of the celebrate
   * moment. */
  iconName: IconName
  titleKey: string
  titleDefault: string
  bodyKey: string
  bodyDefault: string
}

const NEXT_STEPS: Record<RegistrationRole, NextTile[]> = {
  [RegistrationRole.PLAYER]: [
    {
      key: 'rsvp',
      iconName: 'checkmark',
      titleKey: 'onboarding.done.next.player.rsvp',
      titleDefault: 'RSVP for the next match',
      bodyKey: 'onboarding.done.next.player.rsvpBody',
      bodyDefault: 'Tell your coach if you can make Saturday.',
    },
    {
      key: 'chat',
      iconName: 'message',
      titleKey: 'onboarding.done.next.player.chat',
      titleDefault: 'Open team chat',
      bodyKey: 'onboarding.done.next.player.chatBody',
      bodyDefault: 'See announcements and reply to teammates.',
    },
    {
      key: 'jersey',
      iconName: 'football',
      titleKey: 'onboarding.done.next.player.jersey',
      titleDefault: 'See your jersey number',
      bodyKey: 'onboarding.done.next.player.jerseyBody',
      bodyDefault: 'Confirm what number you’ll wear this season.',
    },
  ],
  [RegistrationRole.COACH]: [
    {
      key: 'lineup',
      iconName: 'whistle',
      titleKey: 'onboarding.done.next.coach.lineup',
      titleDefault: 'Build your first lineup',
      bodyKey: 'onboarding.done.next.coach.lineupBody',
      bodyDefault: 'Drag players into 11 + bench, share via WhatsApp.',
    },
    {
      key: 'roster',
      iconName: 'person',
      titleKey: 'onboarding.done.next.coach.roster',
      titleDefault: 'Add the rest of the squad',
      bodyKey: 'onboarding.done.next.coach.rosterBody',
      bodyDefault: 'Names + positions take a minute. Players claim later.',
    },
    {
      key: 'event',
      iconName: 'calendar',
      titleKey: 'onboarding.done.next.coach.event',
      titleDefault: 'Schedule training',
      bodyKey: 'onboarding.done.next.coach.eventBody',
      bodyDefault: 'Auto-collect RSVPs from the team.',
    },
  ],
  [RegistrationRole.CLUB_ADMIN]: [
    {
      key: 'invite',
      iconName: 'envelope',
      titleKey: 'onboarding.done.next.admin.invite',
      titleDefault: 'Invite coaches and players',
      bodyKey: 'onboarding.done.next.admin.inviteBody',
      bodyDefault: 'Share the team code so your club joins fast.',
    },
    {
      key: 'roster',
      iconName: 'person',
      titleKey: 'onboarding.done.next.admin.roster',
      titleDefault: 'Add players to the roster',
      bodyKey: 'onboarding.done.next.admin.rosterBody',
      bodyDefault: 'Names + positions, claim invites go out automatically.',
    },
    {
      key: 'event',
      iconName: 'calendar',
      titleKey: 'onboarding.done.next.admin.event',
      titleDefault: 'Schedule the season opener',
      bodyKey: 'onboarding.done.next.admin.eventBody',
      bodyDefault: 'Get RSVPs flowing the moment the squad joins.',
    },
  ],
  [RegistrationRole.PARENT]: [
    {
      key: 'link',
      iconName: 'heart',
      titleKey: 'onboarding.done.next.parent.link',
      titleDefault: 'Link your child',
      bodyKey: 'onboarding.done.next.parent.linkBody',
      bodyDefault: 'Connect to their roster slot to see schedule + RSVPs.',
    },
    {
      key: 'schedule',
      iconName: 'calendar',
      titleKey: 'onboarding.done.next.parent.schedule',
      titleDefault: 'Check the schedule',
      bodyKey: 'onboarding.done.next.parent.scheduleBody',
      bodyDefault: 'Training nights, match days, location pinned.',
    },
    {
      key: 'chat',
      iconName: 'message',
      titleKey: 'onboarding.done.next.parent.chat',
      titleDefault: 'Open parent chat',
      bodyKey: 'onboarding.done.next.parent.chatBody',
      bodyDefault: 'Carpool, kit duty, the rest of club life.',
    },
  ],
  [RegistrationRole.FREE_AGENT]: [
    {
      key: 'profile',
      iconName: 'football',
      titleKey: 'onboarding.done.next.fa.profile',
      titleDefault: 'Finish your player profile',
      bodyKey: 'onboarding.done.next.fa.profileBody',
      bodyDefault: 'Position, photos, highlight clip — clubs scout faster.',
    },
    {
      key: 'list',
      iconName: 'megaphone',
      titleKey: 'onboarding.done.next.fa.list',
      titleDefault: 'Go live on the marketplace',
      bodyKey: 'onboarding.done.next.fa.listBody',
      bodyDefault: 'Toggle Available so clubs in your city can find you.',
    },
    {
      key: 'card',
      iconName: 'paperplane',
      titleKey: 'onboarding.done.next.fa.card',
      titleDefault: 'Share your player card',
      bodyKey: 'onboarding.done.next.fa.cardBody',
      bodyDefault: 'Send a one-tap PNG to coaches you already know.',
    },
  ],
}

type ClubSetupResponse = {
  club: { id: string; name: string; primaryColor: string; badgeUrl: string | null }
  team: { id: string; name: string }
}

export default function Done() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { finalizeSession } = useOnboardingAuth()
  const { state, reset } = useOnboardingFlow()
  const { getToken } = useAuth()
  const [submitting, setSubmitting] = useState(false)

  const badgeScale = useRef(new Animated.Value(0.7)).current
  const badgeFade = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.parallel([
      Animated.spring(badgeScale, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(badgeFade, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start()
  }, [badgeScale, badgeFade])

  async function handleCta() {
    if (submitting) return
    setSubmitting(true)
    try {
      if (__DEV__ && state.phone === '+15555550100') {
        const scenario = state.role ? DEV_SCENARIO_BY_ROLE[state.role] : 'player'
        await activateE2EScenario(scenario)
        reset()
        router.replace('/')
        return
      }

      await finalizeSession()
      // The Clerk session is now active. Wire the api client's token
      // getter directly so this screen's API calls use the freshly minted
      // session immediately (AuthProvider's setTokenGetter only fires
      // after a re-render at the root, which doesn't happen here).
      setTokenGetter(() => getToken())

      // Persist name + DOB on the user record (JIT-creates if needed).
      if (state.firstName || state.dateOfBirth) {
        try {
          await api('/me', {
            method: 'PATCH',
            body: {
              ...(state.firstName ? { name: state.firstName } : {}),
              ...(state.dateOfBirth ? { dateOfBirth: state.dateOfBirth } : {}),
            },
          })
        } catch (err) {
          if (__DEV__) console.warn('[onboarding/done] /me patch failed', err)
        }
      }

      // Admin flow: actually create the club + team now that auth is live.
      if (
        state.role === RegistrationRole.CLUB_ADMIN &&
        state.clubName &&
        state.teamName &&
        state.clubPrimaryColor
      ) {
        const setup = await api<ClubSetupResponse>('/clubs/setup', {
          method: 'POST',
          body: {
            club: {
              name: state.clubName,
              primaryColor: state.clubPrimaryColor,
            },
            team: {
              name: state.teamName,
            },
          },
        })

        // Optional: upload the picked logo, then patch the club's badgeUrl.
        if (state.clubLogoUri) {
          try {
            const token = await getToken()
            if (token) {
              const uploaded = await uploadMedia({
                teamId: setup.team.id,
                token,
                uri: state.clubLogoUri,
                contentType: 'image/png',
                kind: 'image',
                filename: 'club-badge.png',
              })
              if (uploaded?.publicUrl) {
                await api(`/clubs/${setup.club.id}`, {
                  method: 'PATCH',
                  body: { badgeUrl: uploaded.publicUrl },
                })
              }
            }
          } catch (err) {
            if (__DEV__) console.warn('[onboarding/done] badge upload skipped', err)
          }
        }

        // Add roster slots if the admin pre-filled any names.
        if (state.rosterNames && state.rosterNames.length > 0) {
          try {
            await api(
              `/clubs/${setup.club.id}/teams/${setup.team.id}/roster-slots`,
              {
                method: 'POST',
                body: {
                  slots: state.rosterNames.map((fullName) => ({ fullName })),
                },
              },
            )
          } catch (err) {
            if (__DEV__) console.warn('[onboarding/done] roster-slots failed', err)
          }
        }
      }

      reset()
      router.replace('/')
    } catch (err) {
      if (__DEV__) console.warn('[onboarding/done] finalize failed', err)
      Alert.alert(
        t('common.error'),
        t('onboarding.done.error', {
          defaultValue: 'Could not finish setup. Please try again.',
        }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const clubName = state.clubName ?? 'Anstoss'
  const initials = clubName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('')

  return (
    <WizardStep
      title={t('onboarding.done.title')}
      ctaLabel={t('onboarding.done.cta')}
      onCta={handleCta}
      ctaLoading={submitting}
      ctaDisabled={submitting}
      progress={1}
      scrollable
    >
      <View style={styles.body}>
        <View style={styles.badgeStage}>
          <ConfettiBurst count={24} durationMs={950} colors={[colors.primary, '#F4C84A', '#A8364E', '#1F5C42', '#A8642A']} />
          <Animated.View
            style={{
              opacity: badgeFade,
              transform: [{ scale: badgeScale }],
            }}
          >
            {state.clubLogoUri ? (
              <Image source={{ uri: state.clubLogoUri }} style={styles.badge} />
            ) : state.clubBadgeUrl ? (
              <Image source={{ uri: state.clubBadgeUrl }} style={styles.badge} />
            ) : (
              <View
                style={[
                  styles.badgePlaceholder,
                  { backgroundColor: state.clubPrimaryColor ?? colors.primary },
                ]}
              >
                <Text variant="title1" weight="bold" color="inverse">
                  {initials || 'A'}
                </Text>
              </View>
            )}
          </Animated.View>
        </View>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('onboarding.done.body', { club: clubName })}
        </Text>

        {/* Role-specific "what's next" tiles — primes the user with 2-3
            concrete first actions so home isn't a cold start. */}
        {state.role ? (
          <View style={styles.nextWrap}>
            <Text style={[styles.nextEyebrow, { color: colors.textTertiary }]}>
              {t('onboarding.done.nextEyebrow', { defaultValue: 'WHAT TO TRY FIRST' })}
            </Text>
            {NEXT_STEPS[state.role].map((tile) => (
              <View
                key={tile.key}
                style={[
                  styles.tile,
                  { borderColor: colors.borderDefault, backgroundColor: colors.surface },
                ]}
              >
                <View
                  style={[
                    styles.tileIcon,
                    { backgroundColor: colors.primary50 ?? colors.surfaceSunken },
                  ]}
                >
                  <Icon name={tile.iconName} size={18} color={colors.primary} />
                </View>
                <View style={styles.tileCopy}>
                  <Text variant="callout" weight="semibold" color="primary" numberOfLines={1}>
                    {t(tile.titleKey, { defaultValue: tile.titleDefault })}
                  </Text>
                  <Text variant="caption1" color="secondary" numberOfLines={2}>
                    {t(tile.bodyKey, { defaultValue: tile.bodyDefault })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </WizardStep>
  )
}

const BADGE_SIZE = 96

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingTop: space.lg, gap: space.md },
  badgeStage: {
    width: BADGE_SIZE * 2.4,
    height: BADGE_SIZE * 2.4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  badgePlaceholder: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: { fontFamily: fonts.body, fontSize: fontSize.md, textAlign: 'center' },
  nextWrap: {
    width: '100%',
    marginTop: space.lg,
    gap: space.sm,
  },
  nextEyebrow: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderWidth: hairline,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCopy: { flex: 1, gap: 2 },
})
