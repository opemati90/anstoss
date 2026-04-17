/**
 * Responsive scaling utility — adapted from Renuir's scale.ts.
 *
 * Scales values proportionally to device width with a clamped, dampened curve
 * so small phones (iPhone SE 320pt, Pixel 4a 360dp) stay readable and large
 * phones (iPhone 14 Pro Max 430pt) don't blow out.
 *
 * Baseline: 390pt (iPhone 14). Clamp: [0.92, 1.15]. Default damp factor: 0.5.
 */
import { Dimensions } from 'react-native'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const BASE_WIDTH = 390
const MIN_SCALE = 0.92
const MAX_SCALE = 1.15

const rawScale = SCREEN_WIDTH / BASE_WIDTH
const scale = Math.min(Math.max(rawScale, MIN_SCALE), MAX_SCALE)

export const moderateScale = (size: number, factor = 0.5): number =>
  size + (scale - 1) * size * factor

export const ms = moderateScale

export const isTablet = SCREEN_WIDTH >= 600

export const SCREEN_WIDTH_PX = SCREEN_WIDTH
