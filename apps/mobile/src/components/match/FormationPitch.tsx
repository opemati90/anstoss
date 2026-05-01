import { Image, StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { useMatchTokens } from '../../theme/matchTokens'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

export type FormationPlayer = {
  number: number
  name: string
  /** 0..1 from goal line outward (0 = goal, 1 = halfway) */
  depth: number
  /** 0..1 left to right */
  lateral: number
  side: 'home' | 'away'
}

export type FormationPitchProps = {
  homeName: string
  awayName: string
  homeBadge?: string | null
  awayBadge?: string | null
  homeFormation: string
  awayFormation: string
  players: FormationPlayer[]
}

const PITCH_ASPECT = 0.78
const TOKEN_SIZE = 28

export function FormationPitch({
  homeName,
  awayName,
  homeBadge,
  awayBadge,
  homeFormation,
  awayFormation,
  players,
}: FormationPitchProps) {
  const colors = useClubColors()
  const tokens = useMatchTokens()

  const homeColor = colors.primary
  const awayColor = tokens.tokenAway

  return (
    <View style={[styles.pitch, { backgroundColor: tokens.cardSurface }]}>
      <View
        style={[
          styles.field,
          { aspectRatio: PITCH_ASPECT, borderColor: tokens.heroLineStrong },
        ]}
      >
        <View style={[styles.midLine, { backgroundColor: tokens.heroLineStrong }]} />
        <View style={[styles.midCircle, { borderColor: tokens.heroLineStrong }]} />
        <View style={[styles.boxTop, { borderColor: tokens.heroLineStrong }]} />
        <View style={[styles.boxBottom, { borderColor: tokens.heroLineStrong }]} />
        <View style={[styles.smallBoxTop, { borderColor: tokens.heroLineStrong }]} />
        <View style={[styles.smallBoxBottom, { borderColor: tokens.heroLineStrong }]} />

        <View style={styles.cornerRow}>
          <TeamCorner
            badgeUrl={homeBadge}
            name={homeName}
            formation={homeFormation}
            align="left"
          />
          <TeamCorner
            badgeUrl={awayBadge}
            name={awayName}
            formation={awayFormation}
            align="right"
          />
        </View>

        {players.map((p, i) => (
          <PlayerToken
            key={`${p.side}-${p.number}-${i}`}
            player={p}
            color={p.side === 'home' ? homeColor : awayColor}
            tokenText={tokens.tokenText}
          />
        ))}
      </View>
    </View>
  )
}

function PlayerToken({
  player,
  color,
  tokenText,
}: {
  player: FormationPlayer
  color: string
  tokenText: string
}) {
  // Home occupies bottom half (depth: 0=goal-bottom..1=halfway center).
  // Away occupies top half (depth: 0=goal-top..1=halfway center).
  const yPct =
    player.side === 'home'
      ? 100 - player.depth * 50
      : player.depth * 50
  const xPct = player.lateral * 100

  return (
    <View
      style={[
        styles.token,
        {
          left: `${xPct}%`,
          top: `${yPct}%`,
        },
      ]}
    >
      <View style={[styles.tokenCircle, { backgroundColor: color }]}>
        <Text style={[styles.tokenNumber, { color: tokenText }]}>{player.number}</Text>
      </View>
      <Text numberOfLines={1} style={styles.tokenName}>
        {player.name}
      </Text>
    </View>
  )
}

function TeamCorner({
  badgeUrl,
  name,
  formation,
  align,
}: {
  badgeUrl?: string | null
  name: string
  formation: string
  align: 'left' | 'right'
}) {
  return (
    <View
      style={[
        styles.corner,
        align === 'right' && { alignItems: 'flex-end' },
      ]}
    >
      <View style={[styles.cornerTop, align === 'right' && { flexDirection: 'row-reverse' }]}>
        {badgeUrl ? (
          <Image source={{ uri: badgeUrl }} style={styles.cornerBadge} resizeMode="contain" />
        ) : null}
        <Text style={styles.cornerName} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <Text style={styles.cornerFormation}>{formation}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pitch: {
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  field: {
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  midLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: StyleSheet.hairlineWidth,
  },
  midCircle: {
    position: 'absolute',
    width: '22%',
    aspectRatio: 1,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    left: '39%',
    top: '50%',
    marginTop: '-11%',
  },
  boxTop: {
    position: 'absolute',
    width: '60%',
    height: '14%',
    left: '20%',
    top: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: 0,
  },
  boxBottom: {
    position: 'absolute',
    width: '60%',
    height: '14%',
    left: '20%',
    bottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
  },
  smallBoxTop: {
    position: 'absolute',
    width: '32%',
    height: '5%',
    left: '34%',
    top: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: 0,
  },
  smallBoxBottom: {
    position: 'absolute',
    width: '32%',
    height: '5%',
    left: '34%',
    bottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
  },
  cornerRow: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    right: space.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  corner: {
    flexDirection: 'column',
    gap: 2,
    maxWidth: '45%',
  },
  cornerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cornerBadge: {
    width: 16,
    height: 16,
  },
  cornerName: {
    fontFamily: fonts.label,
    fontSize: fontSize.xs,
    letterSpacing: -0.1,
  },
  cornerFormation: {
    fontFamily: fonts.data,
    fontSize: fontSize['2xs'],
    opacity: 0.7,
    letterSpacing: 0.4,
  },
  token: {
    position: 'absolute',
    width: TOKEN_SIZE,
    marginLeft: -(TOKEN_SIZE / 2),
    marginTop: -(TOKEN_SIZE / 2),
    alignItems: 'center',
  },
  tokenCircle: {
    width: TOKEN_SIZE,
    height: TOKEN_SIZE,
    borderRadius: TOKEN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  tokenNumber: {
    fontFamily: fonts.data,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  tokenName: {
    fontFamily: fonts.label,
    fontSize: 10,
    marginTop: 2,
    opacity: 0.85,
    textAlign: 'center',
    maxWidth: 64,
  },
})
