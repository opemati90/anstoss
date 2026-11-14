import type { StudioTemplate } from '@anstoss/shared'
import type { StudioMatchInput, Translate } from './buildGraphicData'

/**
 * "Jetzt dran" on Studio home: after kickoff, half time, a goal and the final
 * whistle the Studio proposes the graphic that fits the moment. Nothing is
 * suggested before kickoff or once the result is older than a day.
 */
export type StudioSuggestion = {
  template: StudioTemplate
  title: string
  body: string
}

const FRESH_GOAL_MS = 10 * 60_000
const FRESH_RESULT_MS = 24 * 60 * 60_000

export function buildSuggestion(
  match: StudioMatchInput | null,
  timing: { kickoffAt?: string | null; finishedAt?: string | null },
  t: Translate,
  now: Date = new Date(),
): StudioSuggestion | null {
  if (!match || !match.opponent || !match.hasLiveData) return null
  const score =
    match.homeAway === 'AWAY'
      ? `${match.goalsAgainst}:${match.goalsFor}`
      : `${match.goalsFor}:${match.goalsAgainst}`
  const minutesSince = (iso: string | null | undefined) =>
    iso ? Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000)) : null

  if (match.state === 'FINISHED') {
    const ago = minutesSince(timing.finishedAt)
    if (ago != null && ago * 60_000 > FRESH_RESULT_MS) return null
    return {
      template: 'FULL_TIME',
      title: t('studio.suggest.fullTimeTitle', { score }),
      body: [
        ago == null
          ? t('studio.suggest.fullTimeDone')
          : ago < 60
            ? t('studio.suggest.fullTimeAgo', { count: ago })
            : t('studio.suggest.fullTimeHours', { count: Math.round(ago / 60) }),
        match.goalsFor > 0 ? t('studio.suggest.fullTimeBody') : t('studio.suggest.fullTimeBodyNoGoals'),
      ].join(' '),
    }
  }
  if (match.state === 'HALF_TIME') {
    return {
      template: 'HALF_TIME',
      title: t('studio.suggest.halfTimeTitle', { score }),
      body: t('studio.suggest.halfTimeBody'),
    }
  }
  if (match.state === 'FIRST_HALF' || match.state === 'SECOND_HALF') {
    const lastGoal = match.events
      .filter((e) => e.kind === 'GOAL')
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.minute - a.minute)[0]
    const goalAge = lastGoal?.createdAt ? now.getTime() - new Date(lastGoal.createdAt).getTime() : null
    if (lastGoal && goalAge != null && goalAge <= FRESH_GOAL_MS) {
      return {
        template: 'GOAL',
        title: t('studio.suggest.goalTitle', { score }),
        body: t('studio.suggest.goalBody', { minute: lastGoal.minute }),
      }
    }
    // After kickoff: the lineup when one is saved, else the matchday card.
    const hasLineup = Boolean(match.lineup?.starters.length)
    return {
      template: hasLineup ? 'LINEUP' : 'MATCHDAY',
      title: t(hasLineup ? 'studio.suggest.kickoffLineupTitle' : 'studio.suggest.kickoffTitle'),
      body: t('studio.suggest.kickoffBody', { opponent: match.opponent.name }),
    }
  }
  return null
}
