import React from 'react'
import { Image, Platform, StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native'
import Svg, { Circle, Path, Polygon, Text as SvgText } from 'react-native-svg'
import {
  STUDIO_FORMAT_RATIO,
  type StudioFontPairing,
  type StudioFormat,
  type StudioStyle,
  type StudioTemplate,
} from '@anstoss/shared'
import { Text } from '../ui'
import { MatchCrest } from '../match/MatchCrest'
import {
  FONT_FAMILY_BOLD,
  FONT_FAMILY_DISPLAY,
  FONT_FAMILY_REGULAR,
  FONT_FAMILY_SEMIBOLD,
} from '../../theme/typography'
import {
  buildStudioPalette,
  STUDIO_ACCENT,
  STUDIO_CLIP_BUG,
  STUDIO_CLIP_SCRIM,
  STUDIO_ON_WORKSPACE,
  STUDIO_TRANSPARENT,
  STUDIO_WORKSPACE_FILL,
  type StudioPalette,
} from '../../theme/studio'
import type { StudioGraphicData, StudioTeamSide } from '../../studio/buildGraphicData'

/**
 * Matchday Studio graphic renderer.
 *
 * One layout per template; every size is a fraction of the graphic width
 * (`u` = 1% of the width, the boards' `cqw`), so the same component renders
 * 1:1, 4:5 and 9:16 and the thumbnails on Studio home and in the template
 * picker are this component rendered small. Colours come from the brand kit
 * (theme/studio.ts) and never follow the app's light or dark mode.
 *
 * Graphic system: header (crest, club name, competition line), template
 * body, footer (hairline, handle, "Präsentiert von" sponsor).
 */
export type StudioGraphicProps = {
  data: StudioGraphicData
  /** Overrides `data.template` (thumbnails share one data object). */
  template?: StudioTemplate
  style: StudioStyle
  format?: StudioFormat
  /** Rendered width in points; height follows the format. */
  width: number
  /** Explicit height for tiles that are not one of the three formats. */
  height?: number
  /** AI variant accent inside the style. */
  accent?: string | null
  fontPairing?: StudioFontPairing
  presentedBy: string
  accessibilityLabel: string
  testID?: string
}

type Ctx = { u: number; p: StudioPalette; display: TextStyle; displayScale: number }

/** Decoration art boards (boards 38–41): 100 × 125 units. */
const ART_W = 100
const ART_H = 125
/** Derby: 118° hard split at 58 %. */
const SPLIT_ANGLE = (118 * Math.PI) / 180
const SPLIT_AT = 0.58
const CREST_RATIO = 44 / 40
const AUTO = 'auto' as const
const FILL: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }

function displayFont(pairing: StudioFontPairing | undefined): { style: TextStyle; scale: number } {
  if (pairing === 'CLASSIC') {
    return {
      style: { fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }), fontWeight: '700' },
      scale: 0.68,
    }
  }
  if (pairing === 'MODERN') return { style: { fontFamily: FONT_FAMILY_BOLD }, scale: 0.66 }
  return { style: { fontFamily: FONT_FAMILY_DISPLAY, textTransform: 'uppercase' }, scale: 1 }
}

export function StudioGraphic({
  data,
  template = data.template,
  style,
  format = '4:5',
  width,
  height,
  accent,
  fontPairing,
  presentedBy,
  accessibilityLabel,
  testID,
}: StudioGraphicProps) {
  const u = width / 100
  const h = height ?? Math.round(width * STUDIO_FORMAT_RATIO[format])
  const p = buildStudioPalette(style, data.header.clubColor, accent)
  const font = displayFont(fontPairing)
  const ctx: Ctx = { u, p, display: font.style, displayScale: font.scale }
  const isClip = template === 'CLIP_OVERLAY'

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[styles.root, { width, height: h, backgroundColor: p.bg }]}
    >
      <View style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Backdrop style={style} width={width} height={h} p={p} />
        {isClip ? (
          <ClipTile data={data} width={width} height={h} ctx={ctx} />
        ) : (
          <>
            <Body template={template} data={data} width={width} height={h} ctx={ctx} />
            <Frame data={data} ctx={ctx} presentedBy={presentedBy} />
          </>
        )}
      </View>
    </View>
  )
}

// ─── Backdrop per style ─────────────────────────────────────────────────────

function Backdrop({ style, width, height, p }: { style: StudioStyle; width: number; height: number; p: StudioPalette }) {
  if (style === 'DERBY') {
    // CSS linear-gradient(118deg, club 0 58%, ink 58% 100%) as a polygon.
    const dx = Math.sin(SPLIT_ANGLE)
    const dy = -Math.cos(SPLIT_ANGLE)
    const line = Math.abs(width * dx) + Math.abs(height * dy)
    const offset = (SPLIT_AT - 0.5) * line
    const xAt = (y: number) => width / 2 + (offset - (y - height / 2) * dy) / dx
    return (
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Polygon
          points={`${xAt(0)},0 ${width},0 ${width},${height} ${xAt(height)},${height}`}
          fill={p.split ?? p.bg}
        />
        <Path
          d={`M${width * 0.62} 0 L${width * 0.44} ${height}`}
          stroke={p.decoStrong}
          strokeWidth={width * 0.007}
        />
      </Svg>
    )
  }
  if (style === 'KREIDE') {
    return (
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${ART_W} ${ART_H}`}
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
      >
        <Path d="M6 98c14-5 34-7 56-3s28 2 32-1" fill="none" stroke={p.decoStrong} strokeWidth={0.5} strokeLinecap="round" />
        <Path d="M74 8c11 2 19 11 17 23-2 9-12 14-21 11" fill="none" stroke={p.decoStrong} strokeWidth={0.5} strokeLinecap="round" />
      </Svg>
    )
  }
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${ART_W} ${ART_H}`}
      preserveAspectRatio="xMidYMid slice"
      style={StyleSheet.absoluteFill}
    >
      <Circle cx={50} cy={0} r={30} fill="none" stroke={p.deco} strokeWidth={0.35} />
      <Path d="M0 0h100M18 125V104h64v21M36 125v-8h28v8" fill="none" stroke={p.deco} strokeWidth={0.35} />
    </Svg>
  )
}

// ─── Text helper ────────────────────────────────────────────────────────────

function G({ style, children, lines }: { style: TextStyle | TextStyle[]; children: React.ReactNode; lines?: number }) {
  return (
    <Text allowFontScaling={false} numberOfLines={lines} style={style}>
      {children}
    </Text>
  )
}

/** `.pd`: the display face, 0.86 leading. */
function pd(ctx: Ctx, size: number, color: string, leading = 0.86): TextStyle {
  const fontSize = size * ctx.u * ctx.displayScale
  return {
    ...ctx.display,
    fontSize,
    lineHeight: fontSize * (ctx.displayScale === 1 ? leading : 1.05),
    letterSpacing: -0.005 * fontSize,
    color,
  }
}

function kick(ctx: Ctx): TextStyle {
  const fontSize = 3.4 * ctx.u
  return {
    fontFamily: FONT_FAMILY_BOLD,
    fontSize,
    lineHeight: fontSize * 1.2,
    letterSpacing: 0.22 * fontSize,
    textTransform: 'uppercase',
    color: ctx.p.ac,
  }
}

function small(ctx: Ctx, size = 3.4, leading = 1.3): TextStyle {
  const fontSize = size * ctx.u
  return { fontFamily: FONT_FAMILY_SEMIBOLD, fontSize, lineHeight: fontSize * leading, color: ctx.p.sub }
}

function Ghost({ text, ctx, width, height, size, anchor, x, top }: {
  text: string
  ctx: Ctx
  width: number
  height: number
  size: number
  anchor: 'start' | 'end'
  x: number
  top: number
}) {
  const fontSize = size * ctx.u
  // CSS line-height 0.8 around a 1.2 em content box: baseline sits at
  // top + (0.8 − 1.2) / 2 em + 1 em ascent.
  const baseline = top * ctx.u + fontSize * 0.8
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <SvgText
        x={x * ctx.u}
        y={baseline}
        textAnchor={anchor}
        fontFamily={FONT_FAMILY_DISPLAY}
        fontWeight="700"
        fontSize={fontSize}
        fill="none"
        stroke={ctx.p.line}
        strokeWidth={0.35 * ctx.u}
      >
        {text}
      </SvgText>
    </Svg>
  )
}

function Silhouette({ ctx, photoUrl }: { ctx: Ctx; photoUrl?: string | null }) {
  const w = 74 * ctx.u
  const box: ViewStyle = { position: 'absolute', right: -6 * ctx.u, bottom: 0, width: w, height: w * 1.3 }
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} resizeMode="contain" style={box as never} />
  }
  return (
    <View style={box}>
      <Svg width={w} height={w * 1.3} viewBox="0 0 200 260">
        <Circle cx={104} cy={52} r={34} fill={ctx.p.line} />
        <Path d="M40 260c4-64 18-118 64-118s62 52 66 118z" fill={ctx.p.line} />
        <Path d="M58 150c-20 8-36 30-42 56l26 8c6-18 14-32 28-40z" fill={ctx.p.line} />
      </Svg>
    </View>
  )
}

function Crest({ side, size, ctx }: { side: Pick<StudioTeamSide, 'short' | 'color' | 'crestUrl'>; size: number; ctx: Ctx }) {
  const w = size * ctx.u
  return (
    <View style={{ width: w, height: w * CREST_RATIO }}>
      {/* The crest prints the same short code the score line uses. */}
      <MatchCrest name={side.short} badgeUrl={side.crestUrl} size={w} color={side.color} />
    </View>
  )
}

// ─── Template bodies ────────────────────────────────────────────────────────

function Body({ template, data, width, height, ctx }: {
  template: StudioTemplate
  data: StudioGraphicData
  width: number
  height: number
  ctx: Ctx
}) {
  const { u, p } = ctx
  const lay: ViewStyle = { ...FILL, padding: 6.5 * u }

  if (template === 'LINEUP') {
    return (
      <View style={[lay, { paddingTop: 25 * u, gap: 3 * u }]}>
        <G style={pd(ctx, 15, p.fg)} lines={1}>{data.lineup.title}</G>
        <G style={small(ctx)} lines={1}>{data.lineup.meta}</G>
        <View style={{ marginTop: 2 * u }}>
          {data.lineup.rows.map((row, i) => (
            <View
              key={row.label}
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                gap: 2 * u,
                paddingVertical: 1.8 * u,
                borderBottomWidth: i === data.lineup.rows.length - 1 ? 0 : 0.25 * u,
                borderBottomColor: p.line,
              }}
            >
              <G
                style={{
                  width: 10 * u,
                  fontFamily: FONT_FAMILY_BOLD,
                  fontSize: 2.9 * u,
                  lineHeight: 2.9 * u * 1.3,
                  letterSpacing: 0.12 * 2.9 * u,
                  color: p.ac,
                }}
              >
                {row.label}
              </G>
              <G style={{ flex: 1, fontFamily: FONT_FAMILY_SEMIBOLD, fontSize: 4 * u, lineHeight: 4 * u * 1.3, color: p.fg }}>
                {row.names}
              </G>
            </View>
          ))}
        </View>
      </View>
    )
  }

  if (template === 'MATCHDAY') {
    return (
      <View style={[lay, { paddingTop: 26 * u, gap: 2.6 * u }]}>
        <G style={kick(ctx)} lines={1}>{data.matchday.kicker}</G>
        <G style={pd(ctx, 21, p.fg)} lines={1}>{data.matchday.date}</G>
        {data.matchday.time ? <G style={pd(ctx, 21, p.ac)} lines={1}>{data.matchday.time}</G> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 * u, marginTop: 3 * u }}>
          <Crest side={data.left} size={10} ctx={ctx} />
          <G style={{ fontFamily: FONT_FAMILY_BOLD, fontSize: 3.6 * u, lineHeight: 3.6 * u * 1.2, letterSpacing: 0.36 * u, color: p.fg }}>
            VS
          </G>
          <Crest side={data.right} size={10} ctx={ctx} />
          <View style={{ flex: 1, marginStart: u }}>
            <G style={small(ctx)} lines={1}>{data.matchday.opponent}</G>
            {data.matchday.venue ? <G style={small(ctx)} lines={1}>{data.matchday.venue}</G> : null}
          </View>
        </View>
      </View>
    )
  }

  if (template === 'GOAL' && data.goal) {
    return (
      <>
        <Silhouette ctx={ctx} />
        <Ghost text={data.goal.ghost} ctx={ctx} width={width} height={height} size={62} anchor="start" x={-3} top={22} />
        <View style={[lay, { justifyContent: 'flex-end', gap: 2 * u, paddingBottom: 20 * u }]}>
          <G style={pd(ctx, 30, p.ac)} lines={1}>{data.goal.headline}</G>
          {data.goal.scorer ? <G style={pd(ctx, 8.5, p.fg)} lines={1}>{data.goal.scorer}</G> : null}
          <View
            style={{
              alignSelf: 'flex-start',
              paddingVertical: 1.4 * u,
              paddingHorizontal: 2.6 * u,
              borderRadius: 1.6 * u,
              backgroundColor: p.chipBg,
            }}
          >
            <G
              style={{
                fontFamily: FONT_FAMILY_BOLD,
                fontSize: 3.4 * u,
                lineHeight: 3.4 * u * 1.2,
                letterSpacing: 0.08 * 3.4 * u,
                color: p.chipFg,
              }}
            >
              {data.goal.chip}
            </G>
          </View>
        </View>
      </>
    )
  }

  if (template === 'PLAYER_OF_THE_MATCH') {
    // Without a player who may be named the tile keeps the silhouette only.
    return (
      <>
        <Silhouette ctx={ctx} photoUrl={data.motm?.photoUrl} />
        <View style={[lay, { justifyContent: 'flex-end', gap: 2 * u, paddingBottom: 20 * u }]}>
          <G style={kick(ctx)} lines={1}>{data.motm?.kicker ?? data.motmLabel}</G>
          <View>
            {(data.motm?.lines ?? []).map((line) => (
              <G key={line} style={pd(ctx, 17, p.fg)} lines={1}>{line}</G>
            ))}
          </View>
          {data.motm ? <G style={small(ctx)} lines={1}>{data.motm.stats}</G> : null}
        </View>
      </>
    )
  }

  if (template === 'NEWS') {
    return (
      <View style={[lay, { paddingTop: 28 * u, gap: 4 * u }]}>
        <G style={kick(ctx)} lines={1}>{data.news.kicker}</G>
        <G style={pd(ctx, 13, p.fg, 0.95)} lines={4}>{data.news.headline}</G>
        {data.news.body ? (
          <G style={{ fontFamily: FONT_FAMILY_REGULAR, fontSize: 3.8 * u, lineHeight: 3.8 * u * 1.45, color: p.sub }} lines={5}>
            {data.news.body}
          </G>
        ) : null}
      </View>
    )
  }

  if (template === 'SPONSOR') {
    return (
      <View style={[lay, { justifyContent: 'center', alignItems: 'center', gap: 4 * u }]}>
        <G style={[kick(ctx), { textAlign: 'center' }]} lines={1}>{data.sponsor.kicker}</G>
        <View style={{ alignItems: 'center' }}>
          {data.sponsor.lines.map((line) => (
            <G key={line} style={[pd(ctx, 17, p.fg), { textAlign: 'center' }]} lines={1}>{line}</G>
          ))}
        </View>
        {data.sponsor.body ? <G style={[small(ctx), { textAlign: 'center' }]} lines={2}>{data.sponsor.body}</G> : null}
      </View>
    )
  }

  // Endstand / Halbzeit: the broadcast pattern.
  const team = (side: StudioTeamSide) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 1.6 * u }}>
      <Crest side={side} size={15} ctx={ctx} />
      <G style={{ fontFamily: FONT_FAMILY_BOLD, fontSize: 3.2 * u, lineHeight: 3.2 * u * 1.2, letterSpacing: 0.32 * u, color: p.fg }}>
        {side.short}
      </G>
    </View>
  )
  return (
    <>
      <Ghost text={data.score} ctx={ctx} width={width} height={height} size={92} anchor="start" x={0} top={14} />
      <View style={[lay, { justifyContent: 'center', gap: 4 * u, paddingTop: 30 * u }]}>
        <G style={[kick(ctx), { textAlign: 'center' }]} lines={1}>{data.kicker}</G>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 * u }}>
          {team(data.left)}
          <G style={[pd(ctx, 30, p.fg), { letterSpacing: -0.02 * 30 * u }]} lines={1}>{data.score}</G>
          {team(data.right)}
        </View>
        {data.shootout ? <G style={[small(ctx), { textAlign: 'center', color: p.fg }]} lines={1}>{data.shootout}</G> : null}
        {data.scorers ? <G style={[small(ctx), { textAlign: 'center' }]} lines={2}>{data.scorers}</G> : null}
      </View>
    </>
  )
}

// ─── Header and footer ──────────────────────────────────────────────────────

function Frame({ data, ctx, presentedBy }: { data: StudioGraphicData; ctx: Ctx; presentedBy: string }) {
  const { u, p } = ctx
  return (
    <View style={{ ...FILL, padding: 6.5 * u }} pointerEvents="none">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2.6 * u }}>
        <Crest
          side={{ short: data.header.clubShort, color: data.header.clubColor, crestUrl: data.header.crestUrl }}
          size={10}
          ctx={ctx}
        />
        <View style={{ flex: 1 }}>
          <G
            lines={1}
            style={{
              fontFamily: FONT_FAMILY_BOLD,
              fontSize: 3.9 * u,
              lineHeight: 3.9 * u * 1.1,
              letterSpacing: 0.08 * 3.9 * u,
              textTransform: 'uppercase',
              color: p.fg,
            }}
          >
            {data.header.clubName}
          </G>
          {data.header.competition ? (
            <G
              lines={1}
              style={{
                fontFamily: FONT_FAMILY_SEMIBOLD,
                fontSize: 2.9 * u,
                lineHeight: 2.9 * u * 1.2,
                letterSpacing: 0.12 * 2.9 * u,
                textTransform: 'uppercase',
                color: p.sub,
              }}
            >
              {data.header.competition}
            </G>
          ) : null}
        </View>
      </View>
      <View
        style={{
          marginTop: AUTO,
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 3 * u,
          paddingTop: 3 * u,
          borderTopWidth: 0.3 * u,
          borderTopColor: p.line,
        }}
      >
        <G lines={1} style={{ fontFamily: FONT_FAMILY_SEMIBOLD, fontSize: 3.1 * u, lineHeight: 3.1 * u * 1.3, color: p.sub }}>
          {data.footer.handle ?? ''}
        </G>
        {data.footer.sponsor ? (
          <View style={{ alignItems: 'flex-end', gap: 0.2 * u, flexShrink: 1 }}>
            <G
              lines={1}
              style={{
                fontFamily: FONT_FAMILY_BOLD,
                fontSize: 2.4 * u,
                // Room for the diaeresis of "PRÄSENTIERT".
                lineHeight: 2.4 * u * 1.6,
                letterSpacing: 0.16 * 2.4 * u,
                textTransform: 'uppercase',
                color: p.sub,
              }}
            >
              {presentedBy}
            </G>
            <G
              lines={1}
              style={{
                fontFamily: FONT_FAMILY_DISPLAY,
                fontSize: 4.6 * u,
                lineHeight: 4.6 * u,
                letterSpacing: 0.06 * 4.6 * u,
                textTransform: 'uppercase',
                color: p.fg,
              }}
            >
              {data.footer.sponsor}
            </G>
          </View>
        ) : null}
      </View>
    </View>
  )
}

// ─── Clip overlay tile (9:16) ───────────────────────────────────────────────

function ClipTile({ data, width, height, ctx }: { data: StudioGraphicData; width: number; height: number; ctx: Ctx }) {
  const { u } = ctx
  const play = 22 * u
  return (
    <>
      <View style={[styles.clipFade, { height: height / 2 }]}>
        <View style={{ flex: 1, backgroundColor: STUDIO_TRANSPARENT }} />
        <View style={{ flex: 1, backgroundColor: STUDIO_CLIP_SCRIM, opacity: 0.5 }} />
        <View style={{ flex: 1, backgroundColor: STUDIO_CLIP_SCRIM }} />
      </View>
      <View
        style={{
          position: 'absolute',
          top: 7 * u,
          left: 6 * u,
          flexDirection: 'row',
          gap: 2 * u,
          paddingVertical: 1.6 * u,
          paddingHorizontal: 3 * u,
          borderRadius: 2 * u,
          backgroundColor: STUDIO_CLIP_BUG,
        }}
      >
        {[data.left.short, data.score, data.right.short].map((part, i) => (
          <G
            key={`${part}-${i}`}
            lines={1}
            style={{
              fontFamily: FONT_FAMILY_BOLD,
              fontSize: 4 * u,
              lineHeight: 4 * u * 1.2,
              letterSpacing: 0.16 * u,
              color: i === 1 ? STUDIO_ACCENT : STUDIO_ON_WORKSPACE,
            }}
          >
            {part}
          </G>
        ))}
      </View>
      <View style={{ position: 'absolute', left: (width - play) / 2, top: height * 0.46 - play / 2 }}>
        <Svg width={play} height={play} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={11} fill={STUDIO_WORKSPACE_FILL} stroke={STUDIO_ON_WORKSPACE} strokeWidth={0.8} />
          <Path d="M10 8.5v7l5.5-3.5z" fill={STUDIO_ON_WORKSPACE} />
        </Svg>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
  clipFade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
})
