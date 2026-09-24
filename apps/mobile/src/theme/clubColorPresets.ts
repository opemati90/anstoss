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
