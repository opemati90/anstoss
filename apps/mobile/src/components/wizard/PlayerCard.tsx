/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { forwardRef } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
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
  /** Public profile URL printed at the bottom. */
  profileUrl: string | null
  /** Whether the player is publicly listed for trials. Drives the status pill. */
  isOnTransferList?: boolean
  /** Counts surfaced as the bottom stat row. */
  photoCount?: number
  videoCount?: number
}

const CARD_WIDTH = 540
const CARD_HEIGHT = 960

// Position-derived hero number (traditional jersey assignment).
const POSITION_NUMBER: Record<PlayerPosition, string> = {
  GK: '1',
  DEF: '4',
  MID: '8',
  FWD: '9',
}

const FOOT_LABEL: Record<PreferredFoot, string> = {
  LEFT: 'L',
  RIGHT: 'R',
  BOTH: 'B',
}

// Card palette — deliberately dark + premium so the share image lands
// in WhatsApp / Stories with weight. Mirrors the inspiration card.
const PALETTE = {
  bg: '#0B0B11',
  surface: '#16161D',
  surfaceRaised: '#1F1F28',
  surfaceInset: '#262630',
  divider: 'rgba(255,255,255,0.06)',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.62)',
  textTertiary: 'rgba(255,255,255,0.38)',
  available: '#3FE07F',
  draft: 'rgba(255,255,255,0.32)',
}

export const PlayerCard = forwardRef<View, PlayerCardProps>(function PlayerCard(
  {
    name,
    position,
    preferredFoot,
    city,
    avatarUrl,
    experienceCount,
    heroPhotoUrl,
    profileUrl,
    isOnTransferList = false,
    photoCount = 0,
    videoCount = 0,
  },
  ref,
) {
  const { t } = useTranslation()
  const c = useClubColors()
  const heroNumber = position ? POSITION_NUMBER[position] : '-'
  const positionLabelMap: Record<PlayerPosition, string> = {
    GK: t('playerCard.positionGK'),
    DEF: t('playerCard.positionDEF'),
    MID: t('playerCard.positionMID'),
    FWD: t('playerCard.positionFWD'),
  }
  const positionLong = position ? positionLabelMap[position] : t('playerCard.positionDefault')

  // Split the name onto 2 lines for the hero treatment ("DENIZ PASCAL" /
  // "WYBIERALA"). Heuristic: split on the LAST space so the longest token
  // (usually the surname) gets its own line.
  const nameUpper = name.trim().toUpperCase()
  const lastSpaceIdx = nameUpper.lastIndexOf(' ')
  const firstLine = lastSpaceIdx > 0 ? nameUpper.slice(0, lastSpaceIdx) : nameUpper
  const secondLine = lastSpaceIdx > 0 ? nameUpper.slice(lastSpaceIdx + 1) : ''

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('')

  const cleanProfileUrl = profileUrl
    ? profileUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : 'anstoss.io'

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.outer, { backgroundColor: PALETTE.bg }]}
    >
      {/* Background hero — blurred photo or solid dark. We fake the blur
          with a low-opacity image + dark scrim to keep the renderer
          deterministic across captureRef snapshots. */}
      {heroPhotoUrl ? (
        <Image source={{ uri: heroPhotoUrl }} style={styles.bgPhoto} blurRadius={26} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(11,11,17,0.78)' }]} />

      {/* Inset card body */}
      <View style={[styles.card, { backgroundColor: PALETTE.surface }]}>
        {/* Top corner labels — index slot + long position */}
        <View style={styles.topRow}>
          <Text style={[styles.topLabel, { color: PALETTE.textSecondary }]}>
            {preferredFoot ? `${FOOT_LABEL[preferredFoot]} · ${heroNumber}` : heroNumber}
          </Text>
          <Text style={[styles.topLabel, { color: PALETTE.textSecondary }]}>
            {positionLong}
          </Text>
        </View>

        {/* Hero zone — avatar or position-derived big number */}
        <View style={styles.heroZone}>
          {avatarUrl ? (
            <View style={styles.avatarStack}>
              <View style={[styles.avatarRing, { borderColor: c.primary }]}>
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
              </View>
              <View style={[styles.numberBadge, { backgroundColor: c.primary }]}>
                <Text style={[styles.numberBadgeText]}>{heroNumber}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.heroNumberWrap}>
              <Text style={[styles.heroNumberShadow, { color: PALETTE.surfaceRaised }]}>
                {heroNumber}
              </Text>
              <Text style={[styles.heroNumber, { color: PALETTE.textPrimary }]}>
                {heroNumber}
              </Text>
              <Text style={[styles.heroInitials, { color: PALETTE.textSecondary }]}>
                {initials || 'P'}
              </Text>
            </View>
          )}
        </View>

        {/* Display name — heavy condensed feel */}
        <View style={styles.nameBlock}>
          <Text
            style={[styles.nameLine, { color: PALETTE.textPrimary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {firstLine}
          </Text>
          {secondLine ? (
            <Text
              style={[styles.nameLine, { color: PALETTE.textPrimary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {secondLine}
            </Text>
          ) : null}
          <Text style={[styles.eyebrow, { color: PALETTE.textTertiary }]}>
            {(city || t('playerCard.cityFallback')).toUpperCase()}
          </Text>
        </View>

        {/* Watermark stamp — circular ANSTOSS · OFFICIAL ring on the right edge */}
        <View pointerEvents="none" style={styles.stamp}>
          <View style={[styles.stampRing, { borderColor: 'rgba(255,255,255,0.08)' }]}>
            <Text style={[styles.stampText, { color: 'rgba(255,255,255,0.10)' }]}>
              ANSTOSS · OFFICIAL · MARKETPLACE ·
            </Text>
            <View style={[styles.stampHex, { borderColor: 'rgba(255,255,255,0.10)' }]}>
              <Text style={[styles.stampHexA, { color: 'rgba(255,255,255,0.10)' }]}>A</Text>
            </View>
          </View>
        </View>

        {/* Primary status card */}
        <View style={[styles.primaryStat, { backgroundColor: PALETTE.surfaceRaised }]}>
          <View style={styles.primaryStatHead}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isOnTransferList ? PALETTE.available : PALETTE.draft },
              ]}
            />
            <Text style={[styles.primaryStatLabel, { color: PALETTE.textTertiary }]}>
              {isOnTransferList ? t('playerCard.statusAvailableLabel') : t('playerCard.statusDraftLabel')}
            </Text>
          </View>
          <Text style={[styles.primaryStatValue, { color: PALETTE.textPrimary }]}>
            {isOnTransferList ? t('playerCard.statusAvailable') : t('playerCard.statusPrivate')}
          </Text>
          <Text style={[styles.primaryStatSub, { color: PALETTE.textSecondary }]}>
            {isOnTransferList
              ? t('playerCard.statusAvailableSub')
              : t('playerCard.statusPrivateSub')}
          </Text>
        </View>

        {/* Stat row — 3 cells inside one rounded card */}
        <View style={[styles.statsCard, { backgroundColor: PALETTE.surfaceRaised }]}>
          <Stat label={t('playerCard.statClubs')} value={String(experienceCount)} />
          <View style={[styles.statDivider, { backgroundColor: PALETTE.divider }]} />
          <Stat label={t('playerCard.statPhotos')} value={String(photoCount)} />
          <View style={[styles.statDivider, { backgroundColor: PALETTE.divider }]} />
          <Stat label={t('playerCard.statVideos')} value={String(videoCount)} />
        </View>

        {/* Footer brand */}
        <View style={styles.footer}>
          <View style={[styles.footerHex, { borderColor: c.primary }]}>
            <Text style={[styles.footerHexA, { color: c.primary }]}>A</Text>
          </View>
          <Text style={[styles.footerUrl, { color: PALETTE.textSecondary }]}>
            {cleanProfileUrl}
          </Text>
        </View>
      </View>
    </View>
  )
})

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color: PALETTE.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: PALETTE.textTertiary }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  outer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    overflow: 'hidden',
  },
  bgPhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  card: {
    flex: 1,
    margin: 18,
    borderRadius: 32,
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 24,
    overflow: 'hidden',
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLabel: {
    fontFamily: fonts.data,
    fontSize: 12,
    letterSpacing: 1.6,
    fontWeight: '600',
  },

  heroZone: {
    // Heading glyphs at 200pt have ~30px of ascender that doesn't fit
    // inside `lineHeight: fontSize`. Make the zone taller than the line
    // box and centre the number — the View won't clip the top of the 1.
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 28,
    paddingBottom: 8,
  },
  heroNumberWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroNumber: {
    fontFamily: fonts.heading,
    fontSize: 200,
    lineHeight: 240,
    fontWeight: '900',
    letterSpacing: -6,
  },
  heroNumberShadow: {
    position: 'absolute',
    fontFamily: fonts.heading,
    fontSize: 200,
    lineHeight: 240,
    fontWeight: '900',
    letterSpacing: -6,
    transform: [{ translateY: 4 }, { translateX: 4 }],
  },
  heroInitials: {
    position: 'absolute',
    bottom: 12,
    fontFamily: fonts.data,
    fontSize: 13,
    letterSpacing: 4,
    fontWeight: '700',
  },
  avatarStack: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 4,
    padding: 6,
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 100,
  },
  numberBadge: {
    position: 'absolute',
    right: 0,
    bottom: 4,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBadgeText: {
    fontFamily: fonts.heading,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1,
    color: '#FFFFFF',
  },

  nameBlock: {
    marginTop: 12,
    gap: 0,
  },
  nameLine: {
    fontFamily: fonts.heading,
    fontSize: 46,
    lineHeight: 48,
    fontWeight: '900',
    letterSpacing: -1.6,
  },
  eyebrow: {
    marginTop: 8,
    fontFamily: fonts.data,
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
  },

  stamp: {
    position: 'absolute',
    right: -60,
    top: 220,
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-15deg' }],
  },
  stampRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampText: {
    fontFamily: fonts.data,
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: '700',
    position: 'absolute',
    top: 18,
  },
  stampHex: {
    width: 50,
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampHexA: {
    fontFamily: fonts.heading,
    fontSize: 22,
    fontWeight: '900',
  },

  primaryStat: {
    marginTop: 24,
    borderRadius: 18,
    padding: 18,
    gap: 6,
  },
  primaryStatHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  primaryStatLabel: {
    fontFamily: fonts.data,
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: '700',
  },
  primaryStatValue: {
    fontFamily: fonts.heading,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  primaryStatSub: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 17,
  },

  statsCard: {
    marginTop: 12,
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statCell: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 4,
  },
  statValue: {
    fontFamily: fonts.heading,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  statLabel: {
    fontFamily: fonts.data,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    marginHorizontal: 12,
  },

  footer: {
    marginTop: 'auto',
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  footerHex: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerHexA: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  footerUrl: {
    fontFamily: fonts.data,
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '600',
  },
})
