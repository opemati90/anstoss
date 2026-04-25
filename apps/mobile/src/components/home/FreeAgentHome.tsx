import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { api } from '../../api/client'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { radius, space } from '../../theme/tokens'

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
      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Profile
      </Text>
      <Pressable
        onPress={() => router.push('/free-agent/profile' as never)}
        accessibilityRole="button"
        accessibilityLabel={`Profile ${pct}% complete`}
        style={({ pressed }) => [
          styles.hero,
          { backgroundColor: c.surface, borderColor: c.borderDefault },
          pressed && { opacity: 0.95 },
        ]}
      >
        <Text variant="dataLarge" color="primary" tabular>
          {`${pct}%`}
        </Text>
        <Text variant="footnote" color="secondary">
          Finish your details so clubs can find you.
        </Text>
        <View style={[styles.track, { backgroundColor: c.surfaceSunken ?? c.surface }]}>
          <View style={[styles.fill, { width: `${pct}%`, backgroundColor: c.primary }]} />
        </View>
      </Pressable>

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Trial invites
      </Text>
      <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        <Icon name="envelope.fill" size={20} color="tertiary" />
        <Text variant="callout" color="primary" weight="semibold">
          No trial invites yet
        </Text>
        <Text variant="footnote" color="secondary">
          Clubs can invite you to a trial once they view your details. Invites appear here.
        </Text>
      </View>

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Nearby clubs
      </Text>
      <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        <Icon name="magnifyingglass" size={20} color="tertiary" />
        <Text variant="callout" color="primary" weight="semibold">
          Discovery coming soon
        </Text>
        <Text variant="footnote" color="secondary">
          We'll surface clubs searching for your position once discovery launches.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  section: { marginTop: space.lg },
  hero: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.sm,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: space.xs,
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  empty: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.xs,
  },
})
