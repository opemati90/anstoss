import React from 'react'
import { Ionicons } from '@expo/vector-icons'
import type { StyleProp, TextStyle } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import type { ClubTheme } from '../../theme/club-theme'
import { iconSize as iconSizes } from '../../theme/tokens'

/**
 * Single icon API for the app. Call sites reference semantic icon names
 * (e.g. "calendar", "bell.fill") and this component resolves them to the
 * underlying glyph set.
 *
 * Current implementation backs SF-Symbol-style names with Ionicons (fills
 * and outlines) so iOS and Android render consistently. When `expo-symbols`
 * lands, this file is the only edit needed to swap in native SF Symbols on
 * iOS 16+ — call sites stay untouched.
 */

export type IconSize = 'sm' | 'md' | 'lg' | 'xl' | number
export type IconWeight = 'regular' | 'medium' | 'semibold' | 'bold'

/**
 * SF-Symbol-style name → Ionicons name map. Keep additions here, not at
 * call sites. Suffix a name with ".fill" for the filled variant.
 */
const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  // Navigation / structure
  home: 'home-outline',
  'home.fill': 'home',
  calendar: 'calendar-outline',
  'calendar.fill': 'calendar',
  bell: 'notifications-outline',
  'bell.fill': 'notifications',
  'bell.badge.fill': 'notifications',
  search: 'search-outline',
  settings: 'settings-outline',
  'settings.fill': 'settings',
  ellipsis: 'ellipsis-horizontal',
  'ellipsis.circle': 'ellipsis-horizontal-circle-outline',
  'ellipsis.circle.fill': 'ellipsis-horizontal-circle',
  more: 'ellipsis-horizontal',

  // People
  person: 'person-outline',
  'person.fill': 'person',
  'person.2': 'people-outline',
  'person.2.fill': 'people',
  'person.3': 'people-outline',
  'person.circle': 'person-circle-outline',
  'person.circle.fill': 'person-circle',
  'person.badge.plus': 'person-add-outline',

  // Actions
  plus: 'add',
  'plus.circle': 'add-circle-outline',
  'plus.circle.fill': 'add-circle',
  minus: 'remove',
  xmark: 'close',
  'xmark.circle': 'close-circle-outline',
  'xmark.circle.fill': 'close-circle',
  checkmark: 'checkmark',
  'checkmark.circle': 'checkmark-circle-outline',
  'checkmark.circle.fill': 'checkmark-circle',
  'checkmark.seal.fill': 'shield-checkmark',
  'checkmark.shield': 'shield-checkmark-outline',
  'checkmark.shield.fill': 'shield-checkmark',
  shield: 'shield-outline',
  'shield.fill': 'shield',

  // Chevrons / arrows
  'chevron.left': 'chevron-back',
  'chevron.right': 'chevron-forward',
  'chevron.up': 'chevron-up',
  'chevron.down': 'chevron-down',
  'chevron.up.chevron.down': 'swap-vertical',
  'arrow.left': 'arrow-back',
  'arrow.right': 'arrow-forward',
  'arrow.up': 'arrow-up',
  'arrow.up.circle.fill': 'arrow-up-circle',
  'arrow.clockwise': 'refresh',
  'arrow.up.arrow.down': 'swap-vertical',
  'arrow.down': 'arrow-down',
  'arrow.down.circle': 'download-outline',
  'arrow.down.circle.fill': 'download',
  'arrow.triangle.turn.up.right.diamond.fill': 'navigate',

  // Communication
  message: 'chatbubble-outline',
  'message.fill': 'chatbubble',
  bubble: 'chatbubbles-outline',
  'bubble.fill': 'chatbubbles',
  envelope: 'mail-outline',
  'envelope.fill': 'mail',
  paperplane: 'paper-plane-outline',
  'paperplane.fill': 'paper-plane',

  // Place / venue
  mappin: 'location-outline',
  'mappin.circle': 'pin-outline',
  'mappin.circle.fill': 'pin',
  'mappin.and.ellipse': 'location',
  map: 'map-outline',
  'map.fill': 'map',
  globe: 'globe-outline',
  flag: 'flag-outline',
  'flag.fill': 'flag',

  // Content
  photo: 'image-outline',
  'photo.fill': 'image',
  camera: 'camera-outline',
  'camera.fill': 'camera',
  doc: 'document-outline',
  'doc.fill': 'document',
  'doc.on.doc': 'copy-outline',
  'doc.text': 'document-text-outline',
  'doc.text.fill': 'document-text',
  'arrowshape.turn.up.left': 'arrow-undo-outline',
  'list.clipboard': 'clipboard-outline',
  'list.clipboard.fill': 'clipboard',
  'list.bullet.clipboard': 'clipboard-outline',
  book: 'book-outline',
  'book.fill': 'book',

  // Status
  star: 'star-outline',
  'star.fill': 'star',
  heart: 'heart-outline',
  'heart.fill': 'heart',
  bookmark: 'bookmark-outline',
  'bookmark.fill': 'bookmark',

  // Security
  lock: 'lock-closed-outline',
  'lock.fill': 'lock-closed',
  'lock.shield': 'shield-outline',
  'lock.shield.fill': 'shield',
  key: 'key-outline',

  // Sport / domain
  trophy: 'trophy-outline',
  'trophy.fill': 'trophy',
  'figure.soccer': 'football-outline',
  'figure.soccer.fill': 'football',
  football: 'football-outline',
  'football.fill': 'football',
  whistle: 'megaphone-outline',
  megaphone: 'megaphone-outline',
  'megaphone.fill': 'megaphone',

  // Misc
  info: 'information-circle-outline',
  'info.circle': 'information-circle-outline',
  'info.circle.fill': 'information-circle',
  'exclamationmark.triangle': 'warning-outline',
  'exclamationmark.triangle.fill': 'warning',
  'exclamationmark.circle': 'alert-circle-outline',
  'exclamationmark.circle.fill': 'alert-circle',
  clock: 'time-outline',
  'clock.fill': 'time',
  'line.3.horizontal': 'menu',
  'line.3.horizontal.decrease': 'filter-outline',
  'slider.horizontal.3': 'options-outline',
  pencil: 'pencil-outline',
  'pencil.circle': 'pencil',
  'square.and.pencil': 'create-outline',
  'square.and.arrow.up': 'share-outline',
  'rectangle.portrait.and.arrow.right': 'log-out-outline',
  'rectangle.portrait.and.arrow.right.fill': 'log-out',
  trash: 'trash-outline',
  'trash.fill': 'trash',
  'creditcard.fill': 'card',
  creditcard: 'card-outline',
  banknote: 'cash-outline',
  'eye.fill': 'eye',
  eye: 'eye-outline',
  'eye.slash': 'eye-off-outline',
  pin: 'pin-outline',
  'pin.fill': 'pin',
  car: 'car-outline',
  'car.fill': 'car',
  'car.side': 'car-sport-outline',
  'chart.bar': 'stats-chart-outline',
  'chart.bar.fill': 'stats-chart',
  'magnifyingglass': 'search-outline',
  'questionmark.circle': 'help-circle-outline',
  'questionmark.circle.fill': 'help-circle',
  'link': 'link-outline',
  'link.circle': 'link-outline',
  'log.out': 'log-out-outline',
  'power': 'power-outline',
  'receipt': 'receipt-outline',
  'receipt.fill': 'receipt',
  'hand.raised': 'hand-left-outline',
  'hand.raised.fill': 'hand-left',
  'hand.tap.fill': 'hand-left',
  qrcode: 'qr-code-outline',
  gearshape: 'settings-outline',
  'gearshape.fill': 'settings',
  circle: 'ellipse-outline',
  'circle.fill': 'ellipse',
  'bolt.fill': 'flash',
  bolt: 'flash-outline',
  'dot.radiowaves.left.and.right': 'radio-outline',
  'square.grid.3x3.fill': 'grid',
  'square.grid.3x3': 'grid-outline',
  'minus.circle': 'remove-circle-outline',
  'minus.circle.fill': 'remove-circle',
} as const

export type IconName = keyof typeof ICON_MAP | string

export interface IconProps {
  name: IconName
  size?: IconSize
  weight?: IconWeight
  /**
   * Semantic color key or a raw color. Defaults to `textSecondary`.
   * Pass `"tint"` for the club primary color.
   */
  color?:
    | 'primary'
    | 'secondary'
    | 'tertiary'
    | 'inverse'
    | 'tint'
    | 'success'
    | 'warning'
    | 'error'
    | 'info'
    | string
  style?: StyleProp<TextStyle>
  accessibilityLabel?: string
  testID?: string
}

function resolveSize(size: IconSize | undefined): number {
  if (typeof size === 'number') return size
  return iconSizes[size ?? 'md']
}

function resolveColor(
  color: IconProps['color'] | undefined,
  c: ClubTheme,
): string {
  if (!color || color === 'secondary') return c.textSecondary
  if (color === 'primary') return c.textPrimary
  if (color === 'tertiary') return c.textTertiary
  if (color === 'inverse') return c.textInverse
  if (color === 'tint') return c.primary
  if (color === 'success') return c.success
  if (color === 'warning') return c.warning
  if (color === 'error') return c.error
  if (color === 'info') return c.info
  return color
}

function resolveName(name: IconName): keyof typeof Ionicons.glyphMap {
  const mapped = ICON_MAP[name as keyof typeof ICON_MAP]
  if (mapped) return mapped
  // Fall through: allow passing an Ionicon name directly for compatibility
  return name as keyof typeof Ionicons.glyphMap
}

export function Icon({
  name,
  size,
  color,
  style,
  accessibilityLabel,
  testID,
  weight: _weight,
}: IconProps) {
  const c = useClubColors()
  // Reserve `weight` for when SF Symbols renderer lands — Ionicons has
  // no weight concept, so we silently accept the prop now to keep call
  // sites stable across the future swap.
  void _weight
  return (
    <Ionicons
      name={resolveName(name)}
      size={resolveSize(size)}
      color={resolveColor(color, c)}
      style={style}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    />
  )
}
