/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, hairline, radius, space } from '../../theme/tokens'

type FreeAgentProfile = {
  displayName: string
  position: string[]
  experienceYears: number
  location: string
  availableForTrials: boolean
  bio: string
}

const REQUIRED_FIELDS: Array<keyof FreeAgentProfile> = [
  'displayName',
  'position',
  'experienceYears',
  'location',
  'bio',
]

function computeCompleteness(profile: FreeAgentProfile | null): number {
  if (!profile) return 0
  let filled = 0
  for (const field of REQUIRED_FIELDS) {
    const val = profile[field]
    if (Array.isArray(val) ? val.length > 0 : Boolean(val)) filled += 1
  }
  return Math.round((filled / REQUIRED_FIELDS.length) * 100)
}

export function FreeAgentHome() {
  const c = useClubColors()
  const { t } = useTranslation()
  const [profile, setProfile] = useState<FreeAgentProfile | null>(null)

  const load = useCallback(async () => {
    const p = await api<FreeAgentProfile>('/me/free-agent-profile').catch(() => null)
    setProfile(p)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const pct = computeCompleteness(profile)

  return (
    <View style={styles.root}>
      {/* Hero — profile completeness with progress fill */}
      <Pressable
        onPress={() => router.push('/free-agent/profile' as never)}
        accessibilityRole="button"
        accessibilityLabel={t('home.freeAgent.profileCta', {
          defaultValue: 'Profile {{pct}}% complete',
          pct,
        })}
        style={({ pressed }) => [
          styles.hero,
          { backgroundColor: c.surface, borderColor: c.borderDefault },
          pressed && { opacity: 0.96 },
        ]}
      >
        <View style={styles.heroHead}>
          <View style={styles.heroHeadLeft}>
            <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
              {t('home.freeAgent.profileEyebrow', { defaultValue: 'PROFILE' })}
            </Text>
            <Text variant="title3" color="primary" weight="semibold">
              {t('home.freeAgent.profilePct', {
                defaultValue: '{{pct}}% complete',
                pct,
              })}
            </Text>
          </View>
          <Icon name="chevron.right" size={16} color="tertiary" />
        </View>
        <View style={[styles.track, { backgroundColor: c.borderDefault }]}>
          <View style={[styles.fill, { width: `${pct}%`, backgroundColor: c.primary }]} />
        </View>
        <Text variant="footnote" color="secondary">
          {pct === 100
            ? t('home.freeAgent.profileFullBody', {
                defaultValue: "You're discoverable to clubs scouting your position.",
              })
            : t('home.freeAgent.profileBody', {
                defaultValue: 'Finish your details so clubs can find you.',
              })}
        </Text>
      </Pressable>

      {/* Trial invites empty state */}
      <Text variant="footnote" color="secondary" style={styles.sectionLabel}>
        {t('home.freeAgent.trialInvites', { defaultValue: 'Trial invites' }).toUpperCase()}
      </Text>
      <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        <View style={[styles.iconBubble, { backgroundColor: c.surfaceSunken ?? c.background }]}>
          <Icon name="envelope.fill" size={16} color="tertiary" />
        </View>
        <View style={styles.rowBody}>
          <Text variant="callout" color="primary" weight="semibold">
            {t('home.freeAgent.trialEmptyTitle', { defaultValue: 'No trial invites yet' })}
          </Text>
          <Text variant="caption2" color="secondary">
            {t('home.freeAgent.trialEmptyBody', {
              defaultValue: 'Invites land here when a club views your profile.',
            })}
          </Text>
        </View>
      </View>

      {/* Sharing CTA — replaces the "Discovery coming soon" placeholder.
          Trial invites land in the inbox above; the most leveraged thing
          a free agent can do today is share their player card to coaches
          they already know. */}
      <Text variant="footnote" color="secondary" style={styles.sectionLabel}>
        {t('home.freeAgent.shareSectionLabel', { defaultValue: 'Get found faster' }).toUpperCase()}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.freeAgent.shareCta', {
          defaultValue: 'Share your player card',
        })}
        onPress={() => router.push('/free-agent/profile')}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: c.surface, borderColor: c.borderDefault },
          pressed && { opacity: 0.92 },
        ]}
      >
        <View style={[styles.iconBubble, { backgroundColor: c.primary50 ?? c.surfaceSunken ?? c.background }]}>
          <Icon name="paperplane" size={16} color={c.primary} />
        </View>
        <View style={styles.rowBody}>
          <Text variant="callout" color="primary" weight="semibold">
            {t('home.freeAgent.shareTitle', {
              defaultValue: 'Share your player card',
            })}
          </Text>
          <Text variant="caption2" color="secondary">
            {t('home.freeAgent.shareBody', {
              defaultValue:
                'One-tap PNG to coaches you already know. Most invites come from a shared profile.',
            })}
          </Text>
        </View>
        <Icon name="chevron.right" size={14} color="tertiary" />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  hero: {
    padding: space.md + 2,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: 12,
  },
  heroHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroHeadLeft: { gap: 2 },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },

  sectionLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.4,
    marginTop: space.sm,
    marginBottom: -space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 2 },
})