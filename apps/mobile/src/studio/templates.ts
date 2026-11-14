import type { StudioFormat, StudioStyle, StudioTemplate } from '@anstoss/shared'

/** Route slugs: /studio/editor?template=endstand */
export const TEMPLATE_SLUGS: Record<string, StudioTemplate> = {
  spieltag: 'MATCHDAY',
  aufstellung: 'LINEUP',
  halbzeit: 'HALF_TIME',
  endstand: 'FULL_TIME',
  tor: 'GOAL',
  spieler: 'PLAYER_OF_THE_MATCH',
  news: 'NEWS',
  sponsor: 'SPONSOR',
}

export function templateSlug(template: StudioTemplate): string {
  return Object.keys(TEMPLATE_SLUGS).find((slug) => TEMPLATE_SLUGS[slug] === template) ?? 'endstand'
}

export function templateFromSlug(slug: string | undefined | null): StudioTemplate {
  return (slug && TEMPLATE_SLUGS[slug.toLowerCase()]) || 'FULL_TIME'
}

/** Editor picker order (board 39), then the rest. */
export const EDITOR_TEMPLATES: StudioTemplate[] = [
  'LINEUP',
  'MATCHDAY',
  'FULL_TIME',
  'GOAL',
  'HALF_TIME',
  'PLAYER_OF_THE_MATCH',
  'NEWS',
  'SPONSOR',
]

/** Studio home rails (board 38) with the style each thumbnail previews. */
export const HOME_MATCH_RAIL: Array<{ template: StudioTemplate; style: StudioStyle }> = [
  { template: 'MATCHDAY', style: 'FLUTLICHT' },
  { template: 'LINEUP', style: 'KREIDE' },
  { template: 'HALF_TIME', style: 'DERBY' },
  { template: 'GOAL', style: 'FLUTLICHT' },
  { template: 'FULL_TIME', style: 'KREIDE' },
]
export const HOME_CLUB_RAIL: Array<{ template: StudioTemplate; style: StudioStyle }> = [
  { template: 'PLAYER_OF_THE_MATCH', style: 'DERBY' },
  { template: 'NEWS', style: 'KREIDE' },
  { template: 'SPONSOR', style: 'FLUTLICHT' },
  { template: 'CLIP_OVERLAY', style: 'FLUTLICHT' },
]

/** Templates that have a score to type in. */
export const SCORE_TEMPLATES = new Set<StudioTemplate>(['FULL_TIME', 'HALF_TIME', 'GOAL'])
export const TEXT_TEMPLATES = new Set<StudioTemplate>(['NEWS', 'SPONSOR'])

export const FORMAT_SLUGS: Record<StudioFormat, string> = { '1:1': '11', '4:5': '45', '9:16': '916' }
