/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { forwardRef } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import type { PlayerPosition, PreferredFoot } from '@anstoss/shared'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts } from '../../theme/tokens'

export type PlayerCardProps = {
  name: string
  position: PlayerPosition | null
  preferredFoot: PreferredFoot | null
  city: string | null
  bio: string | null
  avatarUrl: string | null
  experienceCount: number
  /** First photo URL — used as the background hero. */
  heroPhotoUrl: string | null
  /** Public profile URL printed at the bottom for QR/handoff. */
  profileUrl: string | null
}

const CARD_WIDTH = 540
const CARD_HEIGHT = 960

/**
 * 9:16 portrait card meant for native share. Rendered offscreen by the
 * parent and snapshotted via react-native-view-shot. The visual layout
 * is intentionally simple so the capture pipeline doesn't need fonts or
 * gradient libraries to land it cleanly.
 */
export const PlayerCard = forwardRef<View, PlayerCardProps>(function PlayerCard(
  { name, position, preferredFoot, city, bio, avatarUrl, experienceCount, heroPhotoUrl, profileUrl },
  ref,
) {
  const c = useClubColors()
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('')

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.card, { backgroundColor: c.background }]}
    >
      {/* Top hero band — hero photo OR club-color block */}
      <View style={[styles.hero, { backgroundColor: c.primary }]}>
        {heroPhotoUrl ? (
          <Image source={{ uri: heroPhotoUrl }} style={styles.heroImg} />
        ) : null}
        <View style={[styles.heroScrim, { backgroundColor: 'rgba(0,0,0,0.32)' }]} />
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeLabel}>ANSTOSS · PLAYER MARKETPLACE</Text>
        </View>
      </View>

      {/* Avatar + name block */}
      <View style={styles.body}>
        <View style={styles.avatarRow}>
          <View style={[styles.avatarRing, { borderColor: c.primary }]}>
            <View style={[styles.avatarInner, { backgroundColor: c.primary50 }]}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={[styles.avatarInitials, { color: c.primary }]}>
                  {initials || 'P'}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.nameBlock}>
            <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>
              {name}
            </Text>
            {city ? (
              <Text style={[styles.cityLabel, { color: c.textSecondary }]} numberOfLines={1}>
                {city}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Stat row */}
        <View style={styles.statRow}>
          <Stat label="POSITION" value={position ?? '—'} c={c} />
          <Stat label="FOOT" value={preferredFoot ? footLabel(preferredFoot) : '—'} c={c} />
          <Stat label="EXPERIENCE" value={`${experienceCount}`} c={c} />
        </View>

        {bio ? (
          <View style={[styles.bioBlock, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
            <Text style={[styles.bioLabel, { color: c.textTertiary }]}>PLAYER NOTE</Text>
            <Text style={[styles.bioText, { color: c.textPrimary }]} numberOfLines={6}>
              {bio}
            </Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={[styles.footerLabel, { color: c.textTertiary }]}>
            {profileUrl ? profileUrl.replace(/^https?:\/\//, '') : 'anstoss.io'}
          </Text>
          <Text style={[styles.footerCta, { color: c.primary }]}>
            INVITE ON ANSTOSS →
          </Text>
        </View>
      </View>
    </View>
  )
})

function Stat({
  label,
  value,
  c,
}: {
  label: string
  value: string
  c: ReturnType<typeof useClubColors>
}) {
  return (
    <View style={[styles.stat, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
      <Text style={[styles.statLabel, { color: c.textTertiary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: c.textPrimary }]}>{value}</Text>
    </View>
  )
}

function footLabel(foot: PreferredFoot): string {
  switch (foot) {
    case 'LEFT':
      return 'Left'
    case 'RIGHT':
      return 'Right'
    case 'BOTH':
      return 'Both'
    default:
      return '—'
  }
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 32,
    overflow: 'hidden',
  },
  hero: {
    height: 320,
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  heroImg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  heroScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroBadge: {
    margin: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'flex-start',
  },
  heroBadgeLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  body: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 24,
    gap: 24,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: -64,
  },
  avatarRing: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 4,
    padding: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 116,
    height: 116,
    borderRadius: 58,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitials: {
    fontFamily: fonts.heading,
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -1,
  },
  nameBlock: {
    flex: 1,
    paddingTop: 56,
    gap: 4,
  },
  name: {
    fontFamily: fonts.heading,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  cityLabel: {
    fontFamily: fonts.body,
    fontSize: 17,
    fontWeight: '500',
  },
  statRow: { flexDirection: 'row', gap: 12 },
  stat: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 6,
  },
  statLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  statValue: {
    fontFamily: fonts.heading,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  bioBlock: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  bioLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  bioText: {
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 24,
  },
  footer: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 32,
  },
  footerLabel: {
    fontFamily: fonts.data,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  footerCta: {
    fontFamily: fonts.heading,
    fontSize: 15,
    letterSpacing: 0.6,
    fontWeight: '800',
  },
})
