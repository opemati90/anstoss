import React from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

/**
 * Anstoss Redesign line icons (2026-11), copied 1:1 from the design boards:
 * 24×24 grid, round caps and joins, 1.8 stroke for UI icons, 1.7 for the
 * tab bar (2.0 when active) and 2–2.4 for chevrons and checkmarks.
 *
 * `Icon` renders these for every semantic name listed in DESIGN_ICONS and
 * falls back to Ionicons for the rest. A ".fill" name draws the same glyph
 * with a heavier stroke — the design marks "active" by weight, not by fill.
 */

type Shape =
  | { t: 'path'; d: string }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx?: number }

type DesignIcon = { stroke: number; shapes: Shape[] }

const p = (d: string): Shape => ({ t: 'path', d })
const c = (cx: number, cy: number, r: number): Shape => ({ t: 'circle', cx, cy, r })
const r = (x: number, y: number, w: number, h: number, rx?: number): Shape => ({ t: 'rect', x, y, w, h, rx })

const ICONS = {
  home: { stroke: 1.7, shapes: [p('M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z')] },
  calendar: { stroke: 1.7, shapes: [r(3, 5, 18, 16, 2), p('M3 10h18M8 3v4M16 3v4')] },
  bubble: { stroke: 1.8, shapes: [p('M4 5h16v11H8l-4 4z')] },
  people: {
    stroke: 1.7,
    shapes: [
      c(9, 8, 3.5),
      p('M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5'),
      p('M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.5 3.5 5.2'),
    ],
  },
  person: { stroke: 1.8, shapes: [c(12, 8, 4), p('M4 21c1-4 4-6 8-6s7 2 8 6')] },
  ellipsis: { stroke: 1.7, shapes: [c(5, 12, 1.2), c(12, 12, 1.2), c(19, 12, 1.2)] },
  bell: {
    stroke: 1.8,
    shapes: [p('M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z'), p('M10 20a2 2 0 0 0 4 0')],
  },
  chevronDown: { stroke: 2.4, shapes: [p('M6 9l6 6 6-6')] },
  chevronRight: { stroke: 2, shapes: [p('M9 6l6 6-6 6')] },
  chevronLeft: { stroke: 2, shapes: [p('M15 5l-7 7 7 7')] },
  checkmark: { stroke: 2.4, shapes: [p('M5 12l5 5 9-10')] },
  plus: { stroke: 2.2, shapes: [p('M12 5v14M5 12h14')] },
  arrowRight: { stroke: 2.2, shapes: [p('M5 12h14M13 6l6 6-6 6')] },
  lineup: { stroke: 1.8, shapes: [r(4, 3, 16, 18, 2), p('M4 12h16'), c(12, 12, 3)] },
  megaphone: {
    stroke: 1.8,
    shapes: [p('M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z'), p('M16 9a4 4 0 0 1 0 6')],
  },
  pencil: { stroke: 1.8, shapes: [p('M12 20h9'), p('M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z')] },
  camera: { stroke: 1.8, shapes: [p('M4 8h3l2-3h6l2 3h3v11H4z'), c(12, 13, 3.5)] },
  clock: { stroke: 1.8, shapes: [c(12, 12, 9), p('M12 7v5l3 2')] },
  mappin: {
    stroke: 1.8,
    shapes: [p('M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z'), c(12, 9, 2.5)],
  },
  repeat: {
    stroke: 1.8,
    shapes: [p('M17 2l3 3-3 3'), p('M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3'), p('M20 13v2a4 4 0 0 1-4 4H4')],
  },
  share: { stroke: 1.8, shapes: [p('M12 15V3M7 8l5-5 5 5M5 13v7h14v-7')] },
  whistle: { stroke: 1.8, shapes: [c(9, 14, 5), p('M13 10l8-4v4l-6 3')] },
  table: { stroke: 1.8, shapes: [r(3, 4, 18, 16, 2), p('M3 10h18M9 10v10')] },
  card: { stroke: 1.8, shapes: [r(3, 6, 18, 13, 2), p('M3 10h18M7 15h3')] },
  link: {
    stroke: 2,
    shapes: [
      p('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1'),
      p('M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'),
    ],
  },
  search: { stroke: 2, shapes: [c(11, 11, 7), p('M20 20l-4-4')] },
  swap: { stroke: 1.8, shapes: [p('M7 7h12l-3-3M17 17H5l3 3')] },
  globe: {
    stroke: 1.8,
    shapes: [
      c(12, 12, 9),
      p('M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z'),
    ],
  },
  shield: { stroke: 1.8, shapes: [p('M12 3l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z')] },
  exit: { stroke: 1.8, shapes: [p('M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10')] },
  car: {
    stroke: 1.8,
    shapes: [p('M3 13l2-6h14l2 6v5H3z'), c(7.5, 18, 1.5), c(16.5, 18, 1.5)],
  },
} satisfies Record<string, DesignIcon>

type GlyphName = keyof typeof ICONS

/** Semantic (SF-Symbol-style) name → design glyph. ".fill" variants resolve here too. */
const NAME_TO_GLYPH: Record<string, GlyphName> = {
  home: 'home',
  calendar: 'calendar',
  bubble: 'bubble',
  message: 'bubble',
  'person.2': 'people',
  'person.3': 'people',
  person: 'person',
  'person.circle': 'person',
  ellipsis: 'ellipsis',
  more: 'ellipsis',
  bell: 'bell',
  'chevron.down': 'chevronDown',
  'chevron.right': 'chevronRight',
  'chevron.left': 'chevronLeft',
  checkmark: 'checkmark',
  plus: 'plus',
  'arrow.right': 'arrowRight',
  'square.grid.3x3': 'lineup',
  megaphone: 'megaphone',
  pencil: 'pencil',
  'square.and.pencil': 'pencil',
  camera: 'camera',
  clock: 'clock',
  mappin: 'mappin',
  'mappin.and.ellipse': 'mappin',
  'arrow.clockwise': 'repeat',
  'square.and.arrow.up': 'share',
  whistle: 'whistle',
  'chart.bar': 'table',
  card: 'card',
  creditcard: 'card',
  link: 'link',
  magnifyingglass: 'search',
  search: 'search',
  'arrow.left.arrow.right': 'swap',
  globe: 'globe',
  shield: 'shield',
  'rectangle.portrait.and.arrow.right': 'exit',
  'log.out': 'exit',
  car: 'car',
  'car.side': 'car',
}

/** Extra stroke for ".fill" (active) variants, matching the tab bar's 1.7 → 2.0. */
const ACTIVE_EXTRA_STROKE = 0.3

export function resolveDesignGlyph(name: string): { glyph: DesignIcon; active: boolean } | null {
  const active = name.endsWith('.fill')
  const base = active ? name.slice(0, -'.fill'.length) : name
  const key = NAME_TO_GLYPH[base]
  return key ? { glyph: ICONS[key], active } : null
}

export function DesignIconGlyph({
  glyph,
  active,
  size,
  color,
  style,
  accessibilityLabel,
  testID,
}: {
  glyph: DesignIcon
  active: boolean
  size: number
  color: string
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
  testID?: string
}) {
  const strokeWidth = glyph.stroke + (active ? ACTIVE_EXTRA_STROKE : 0)
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      {...(accessibilityLabel ? { accessible: true, accessibilityLabel } : null)}
      testID={testID}
    >
      {glyph.shapes.map((s, i) =>
        s.t === 'path' ? (
          <Path key={i} d={s.d} />
        ) : s.t === 'circle' ? (
          <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} />
        ) : (
          <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} />
        ),
      )}
    </Svg>
  )
}
