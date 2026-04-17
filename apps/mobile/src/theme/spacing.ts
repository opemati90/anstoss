/**
 * Spacing, radii, and component dimensions — adapted from Renuir's spacing.ts.
 * All values pass through ms() so they scale with device width.
 */
import { ms } from './scale'

// Base spacing units
export const SPACING_XXS = ms(2)
export const SPACING_XS = ms(4)
export const SPACING_SM = ms(8)
export const SPACING_MD = ms(12)
export const SPACING_LG = ms(16)
export const SPACING_XL = ms(20)
export const SPACING_XXL = ms(24)
export const SPACING_XXXL = ms(32)
export const SPACING_BACK = ms(40)

// Component-specific spacing
export const SCREEN_PADDING = ms(24)
export const BODY_PADDING = ms(20)
export const CARD_PADDING = ms(16)
export const BUTTON_PADDING_HORIZONTAL = ms(16)
export const BUTTON_PADDING_VERTICAL = ms(12)
export const INPUT_PADDING_HORIZONTAL = ms(16)
export const INPUT_PADDING_VERTICAL = ms(12)

// Gaps
export const GAP_XS = ms(4)
export const GAP_SM = ms(8)
export const GAP_MD = ms(12)
export const GAP_LG = ms(16)
export const GAP_XL = ms(24)

// Border radius
export const RADIUS_SM = ms(8)
export const RADIUS_MD = ms(12)
export const RADIUS_LG = ms(16)
export const RADIUS_XL = ms(20)
export const RADIUS_FULL = 9999
export const RADIUS_BUTTON = ms(23)
export const RADIUS_CARD = ms(16)
export const RADIUS_INPUT = ms(12)

// Icon sizes
export const ICON_SM = ms(16)
export const ICON_MD = ms(20)
export const ICON_LG = ms(24)
export const ICON_XL = ms(28)
export const ICON_XXL = ms(32)

// Button heights
export const BUTTON_HEIGHT_SM = ms(36)
export const BUTTON_HEIGHT_MD = ms(46)

// Input heights
export const INPUT_HEIGHT = ms(46)

// Tab bar
export const TAB_BAR_HEIGHT = ms(85)
export const TAB_ICON_SIZE = ms(28)
export const TAB_BUTTON_SIZE = ms(58)

// Back button
export const BACK_BUTTON_SIZE = ms(40)

// Semantic collections
export const Spacing = {
  xxs: SPACING_XXS,
  xs: SPACING_XS,
  sm: SPACING_SM,
  md: SPACING_MD,
  lg: SPACING_LG,
  xl: SPACING_XL,
  xxl: SPACING_XXL,
  xxxl: SPACING_XXXL,
  screenPadding: SCREEN_PADDING,
  bodyPadding: BODY_PADDING,
  cardPadding: CARD_PADDING,
} as const

export const Radius = {
  sm: RADIUS_SM,
  md: RADIUS_MD,
  lg: RADIUS_LG,
  xl: RADIUS_XL,
  full: RADIUS_FULL,
  button: RADIUS_BUTTON,
  card: RADIUS_CARD,
  input: RADIUS_INPUT,
} as const

export default Spacing
