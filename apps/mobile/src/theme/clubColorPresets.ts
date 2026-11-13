/**
 * Classic amateur-club colours offered when an admin picks the club colour
 * (Vereinsprofil & Farben). Same palette as the club-setup wizard.
 */
export const CLUB_COLOR_PRESETS = [
  '#1E3A5F',
  '#C4372C',
  '#2D7A3A',
  '#1A1A18',
  '#B8860B',
  '#6B3FA0',
  '#E85D04',
  '#0077B6',
  '#800020',
  '#2F4F4F',
] as const

/**
 * Onboarding review fix (LOW): the colour's name for screen readers, in the
 * same order as CLUB_COLOR_PRESETS (i18n key onboardingFlow.clubSetup.colors.*).
 */
export const CLUB_COLOR_PRESET_NAMES = [
  'navy',
  'red',
  'green',
  'black',
  'gold',
  'purple',
  'orange',
  'blue',
] as const

/**
 * "Dein Verein" (onboarding redesign, board 06): Hauptfarbe presets and their
 * screen-reader names (onboardingFlow.clubSetup.colors.*).
 */
export const CLUB_SETUP_PRIMARY_PRESETS = [
  { hex: '#0E3B2B', name: 'green' },
  { hex: '#7A1F2B', name: 'red' },
  { hex: '#123A5C', name: 'blue' },
  { hex: '#1F2A44', name: 'navy' },
  { hex: '#5B2A86', name: 'purple' },
  { hex: '#B4511E', name: 'orange' },
] as const

/** Zweitfarbe presets (board 06). */
export const CLUB_SETUP_SECONDARY_PRESETS = [
  { hex: '#D4F25C', name: 'lime' },
  { hex: '#FFFFFF', name: 'white' },
  { hex: '#121A15', name: 'black' },
  { hex: '#E8B92E', name: 'gold' },
] as const

/** Colours of the "Eigene" swatch's colour wheel (decorative). */
export const CUSTOM_SWATCH_WHEEL = ['#C8102E', '#F2A33A', '#D4F25C', '#0E3B2B', '#123A5C', '#5B2A86'] as const

/** Pure white, the surface the 4.5:1 text contrast is checked against. */
export const CONTRAST_WHITE = '#FFFFFF'
