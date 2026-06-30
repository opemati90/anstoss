"""
Derived scoring insights (goal timing + top scorers) for a team.

Everything here is a pure transform over already-fetched ``Game`` objects, so
it carries no network or scraping dependency and is fully unit-testable. The
input games are expected to already include ``match_events`` (the crawler
populates these via the per-game match course).

Perspective is inferred, not given: fussball.de game rows do not say which
side "we" are, but the team under analysis is the one club that appears in
(almost) every one of its own games. We pick the most frequently occurring
team name across the sample and treat that as the subject team.
"""

import logging
import re
from collections import Counter
from typing import List, Optional

from .schemas import (
    Game,
    GoalTiming,
    GoalTimingBand,
    MatchEvent,
    ScoringInsights,
    TopScorer,
)

logger = logging.getLogger(__name__)

# Six 15-minute windows. Stoppage time folds into the closing window of its half
# (45+x -> 31-45, 90+x -> 76-90) because amateur match courses rarely expose it
# distinctly and over-segmenting would scatter the signal.
BAND_LABELS = ["1-15", "16-30", "31-45", "46-60", "61-75", "76-90"]
_BAND_COUNT = len(BAND_LABELS)

_GOAL_TYPES = {"goal"}
# Goal descriptions that are not a real scorer name we want to surface.
_NON_SCORER_MARKERS = ("eigentor", "own goal", "elfmeter", "strafstoß")


def _normalize_team_name(name: Optional[str]) -> str:
    """Lowercase + collapse whitespace so minor formatting drift still matches."""
    if not name:
        return ""
    return re.sub(r"\s+", " ", name).strip().lower()


def _parse_minute(time_str: Optional[str]) -> Optional[int]:
    """
    Extract the leading minute from a fussball.de time label.

    Handles '43', "43'", '45+2', '90+3', '43’' and similar. Returns the base
    minute (stoppage offset dropped) or None when nothing numeric is present.
    """
    if not time_str:
        return None
    match = re.match(r"\s*(\d{1,3})", time_str)
    if not match:
        return None
    return int(match.group(1))


def _band_index(minute: int) -> int:
    """Map a 1-based match minute to a 0..5 window index, clamped to 90'."""
    clamped = max(1, min(minute, 90))
    return min((clamped - 1) // 15, _BAND_COUNT - 1)


def derive_team_name(games: List[Game]) -> Optional[str]:
    """
    Infer the subject team as the most frequent name across home/away slots.

    Returns the original (non-normalized) spelling from its first occurrence so
    the label reads naturally, or None when the sample is empty.
    """
    counter: Counter = Counter()
    display: dict = {}
    for game in games:
        for raw in (game.home_team, game.away_team):
            key = _normalize_team_name(raw)
            if not key:
                continue
            counter[key] += 1
            display.setdefault(key, raw)
    if not counter:
        return None
    best_key, _ = counter.most_common(1)[0]
    return display.get(best_key)


def _our_side(game: Game, team_key: str) -> Optional[str]:
    """Return 'home' or 'away' for the subject team in this game, else None."""
    if _normalize_team_name(game.home_team) == team_key:
        return "home"
    if _normalize_team_name(game.away_team) == team_key:
        return "away"
    return None


def _is_scorer_description(desc: Optional[str]) -> bool:
    if not desc:
        return False
    lowered = desc.strip().lower()
    if not lowered:
        return False
    return not any(marker in lowered for marker in _NON_SCORER_MARKERS)


def build_goal_timing(games: List[Game], team_name: Optional[str]) -> GoalTiming:
    """Aggregate scored/conceded goals per 15-minute window for the subject team."""
    bands = [GoalTimingBand(label=label) for label in BAND_LABELS]
    team_key = _normalize_team_name(team_name)
    sample = 0

    for game in games:
        side = _our_side(game, team_key)
        if side is None:
            continue
        sample += 1
        for event in game.match_events or []:
            if event.type not in _GOAL_TYPES:
                continue
            minute = _parse_minute(event.time)
            if minute is None:
                continue
            band = bands[_band_index(minute)]
            if event.team == side:
                band.scored += 1
            elif event.team in ("home", "away"):
                band.conceded += 1

    return GoalTiming(team_name=team_name, sample_size=sample, bands=bands)


def build_top_scorers(
    games: List[Game], team_name: Optional[str], limit: int = 8
) -> List[TopScorer]:
    """
    Tally goals per scorer for the subject team from match-course goal events.

    ``matches`` counts the distinct sampled games a player scored in (we only
    observe goal events, not lineups, so true appearances are not knowable).
    """
    team_key = _normalize_team_name(team_name)
    goals: Counter = Counter()
    games_scored: dict = {}

    for index, game in enumerate(games):
        side = _our_side(game, team_key)
        if side is None:
            continue
        for event in game.match_events or []:
            if event.type not in _GOAL_TYPES or event.team != side:
                continue
            if not _is_scorer_description(event.description):
                continue
            name = re.sub(r"\s+", " ", event.description).strip()
            goals[name] += 1
            games_scored.setdefault(name, set()).add(index)

    ranked = sorted(goals.items(), key=lambda kv: (-kv[1], kv[0]))
    return [
        TopScorer(name=name, goals=count, matches=len(games_scored.get(name, set())))
        for name, count in ranked[:limit]
    ]


def build_scoring_insights(games: List[Game]) -> ScoringInsights:
    """Top-level transform: infer the subject team, then derive timing + scorers."""
    team_name = derive_team_name(games)
    goal_timing = build_goal_timing(games, team_name)
    top_scorers = build_top_scorers(games, team_name)
    return ScoringInsights(
        team_name=team_name,
        sample_size=goal_timing.sample_size,
        goal_timing=goal_timing,
        top_scorers=top_scorers,
    )
