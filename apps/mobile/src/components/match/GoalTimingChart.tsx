import { Component, type ReactNode, useState } from 'react'
import { LayoutChangeEvent, StyleSheet, View } from 'react-native'
import type { MatchGoalTimingBand } from '@anstoss/shared'
import { Text } from '../ui'
import { space, radius } from '../../theme/tokens'

/**
 * "When goals happen" — a smooth scored-vs-conceded area chart across the 90
 * minutes, matching the match-facts design. The real curve is drawn with
 * react-native-svg; if that native module isn't in the running binary yet
 * (e.g. before a dev-client rebuild), an error boundary falls back to a clean
 * column chart so the screen never crashes.
 */

export type GoalTimingChartProps = {
  bands: MatchGoalTimingBand[]
  scoredColor: string
  concededColor: string
  axisColor: string
  height?: number
}

// Lazy, guarded load: a missing native module must degrade, not crash.
let RNSVG: typeof import('react-native-svg') | null = null
let svgLoadTried = false
function loadSvg() {
  if (svgLoadTried) return RNSVG
  svgLoadTried = true
  try {
    RNSVG = require('react-native-svg')
  } catch {
    RNSVG = null
  }
  return RNSVG
}

const AXIS_TICKS = ['0', '15', '30', '45', '60', '75', '90']

/** Catmull-Rom → cubic-bezier smoothing for an array of [x,y] points. */
function smoothPath(points: Array<[number, number]>): string {
  if (points.length < 2) return ''
  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2[0]} ${p2[1]}`
  }
  return d
}

function SvgArea({
  bands,
  width,
  height,
  scoredColor,
  concededColor,
}: GoalTimingChartProps & { width: number; height: number }) {
  const svg = loadSvg()
  if (!svg) throw new Error('react-native-svg unavailable')
  const { default: Svg, Path } = svg
  const max = Math.max(1, ...bands.flatMap((b) => [b.scored, b.conceded]))
  const pad = 4
  const usableH = height - pad
  // X at each band's centre minute (i*15+7.5) mapped across 0..90.
  const xs = bands.map((_, i) => ((i * 15 + 7.5) / 90) * width)
  const toPts = (key: 'scored' | 'conceded'): Array<[number, number]> =>
    bands.map((b, i) => [xs[i], pad + usableH - (b[key] / max) * usableH])
  const scoredPts = toPts('scored')
  const concededPts = toPts('conceded')
  const scoredLine = smoothPath(scoredPts)
  const concededLine = smoothPath(concededPts)
  const area =
    `${scoredLine} L ${xs[xs.length - 1]} ${height} L ${xs[0]} ${height} Z`

  return (
    <Svg width={width} height={height}>
      <Path d={area} fill={scoredColor} fillOpacity={0.16} />
      <Path d={scoredLine} stroke={scoredColor} strokeWidth={2.5} fill="none" />
      <Path
        d={concededLine}
        stroke={concededColor}
        strokeWidth={2}
        fill="none"
        strokeDasharray="1 0"
      />
    </Svg>
  )
}

/** Column fallback — used if svg can't load/render. Clean, contiguous bars. */
function ColumnFallback({ bands, scoredColor, concededColor, height = 96 }: GoalTimingChartProps) {
  const max = Math.max(1, ...bands.flatMap((b) => [b.scored, b.conceded]))
  return (
    <View style={[styles.cols, { height }]}>
      {bands.map((b) => (
        <View key={b.label} style={styles.col}>
          <View style={[styles.bar, { height: `${(b.scored / max) * 100}%`, backgroundColor: scoredColor }]} />
          <View style={[styles.bar, { height: `${(b.conceded / max) * 100}%`, backgroundColor: concededColor }]} />
        </View>
      ))}
    </View>
  )
}

class SvgBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function GoalTimingChart(props: GoalTimingChartProps) {
  const height = props.height ?? 96
  const [width, setWidth] = useState(0)
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)

  return (
    <View>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 ? (
          <SvgBoundary fallback={<ColumnFallback {...props} height={height} />}>
            <SvgArea {...props} width={width} height={height} />
          </SvgBoundary>
        ) : null}
      </View>
      <View style={[styles.axis, { borderTopColor: props.axisColor }]}>
        {AXIS_TICKS.map((tick) => (
          <Text key={tick} variant="caption2" color="tertiary" tabular>
            {`${tick}'`}
          </Text>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  cols: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs },
  col: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: space['2xs'],
  },
  bar: { width: 9, minHeight: 2, borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.xs,
    marginTop: space.xs,
  },
})
