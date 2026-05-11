import { useCallback, useEffect, useState } from 'react'
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { useClubColors } from '../../context/ClubThemeContext'
import { Text } from '../ui'
import { fonts, hairline, radius, space } from '../../theme/tokens'

type SponsorRow = {
  id: string
  name: string
  logoUrl: string
  linkUrl: string | null
}

export type SponsorStripProps = {
  clubId: string
}

/**
 * Horizontally-scrolling strip of kit sponsor logos. Renders nothing
 * when the club has no sponsors so it stays out of the way for the
 * vast majority of FOUNDATION clubs. Shown to ALL members near the
 * bottom of the home screen — admins manage the list from
 * /admin-sponsors.
 */
export function SponsorStrip({ clubId }: SponsorStripProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [sponsors, setSponsors] = useState<SponsorRow[]>([])

  const load = useCallback(async () => {
    try {
      const rows = await api<SponsorRow[]>(`/clubs/${clubId}/sponsors`)
      setSponsors(Array.isArray(rows) ? rows : [])
    } catch {
      setSponsors([])
    }
  }, [clubId])

  useEffect(() => {
    void load()
  }, [load])

  if (sponsors.length === 0) return null

  const openLink = (url: string | null) => {
    if (!url) return
    void Linking.openURL(url).catch(() => undefined)
  }

  return (
    <View style={styles.root}>
      <Text style={[styles.heading, { color: c.textTertiary }]}>
        {t('sponsors.ourSponsors').toUpperCase()}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {sponsors.map((sponsor) => {
          const content = (
            <View
              style={[
                styles.tile,
                { backgroundColor: c.surface, borderColor: c.borderDefault },
              ]}
              accessibilityLabel={sponsor.name}
            >
              <Image
                source={{ uri: sponsor.logoUrl }}
                style={styles.logo}
                accessibilityIgnoresInvertColors
              />
            </View>
          )
          if (sponsor.linkUrl) {
            return (
              <Pressable
                key={sponsor.id}
                accessibilityRole="link"
                accessibilityLabel={sponsor.name}
                onPress={() => openLink(sponsor.linkUrl)}
                style={({ pressed }) => [pressed && { opacity: 0.85 }]}
              >
                {content}
              </Pressable>
            )
          }
          return <View key={sponsor.id}>{content}</View>
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { marginTop: space.lg, gap: space.xs },
  heading: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.2,
    paddingHorizontal: space.xs,
  },
  scrollContent: {
    gap: space.sm,
    paddingHorizontal: 2,
  },
  tile: {
    width: 96,
    height: 56,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xs,
    overflow: 'hidden',
  },
  logo: { width: '100%', height: '100%', resizeMode: 'contain' },
})
