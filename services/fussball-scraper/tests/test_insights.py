from datetime import datetime, timezone

from fussball_api.insights import (
    _band_index,
    _parse_minute,
    build_goal_timing,
    build_scoring_insights,
    build_top_scorers,
    derive_team_name,
)
from fussball_api.schemas import Game, MatchEvent


def _game(game_id, home, away, events):
    return Game(
        id=game_id,
        datetime_utc=datetime.now(timezone.utc),
        competition="Kreisliga",
        home_team=home,
        home_logo="",
        away_team=away,
        away_logo="",
        match_events=events,
    )


def _goal(minute, side, scorer):
    return MatchEvent(time=f"{minute}'", type="goal", team=side, description=scorer)


# --- minute / band parsing -------------------------------------------------

def test_parse_minute_variants():
    assert _parse_minute("43") == 43
    assert _parse_minute("43'") == 43
    assert _parse_minute("45+2") == 45
    assert _parse_minute("90+3'") == 90
    assert _parse_minute("90+3’") == 90
    assert _parse_minute(None) is None
    assert _parse_minute("foul") is None


def test_band_index_boundaries():
    assert _band_index(1) == 0
    assert _band_index(15) == 0
    assert _band_index(16) == 1
    assert _band_index(45) == 2
    assert _band_index(46) == 3
    assert _band_index(90) == 5
    assert _band_index(120) == 5  # clamped to 90'


# --- perspective inference -------------------------------------------------

def test_derive_team_name_picks_recurring_club():
    games = [
        _game("1", "SV Musterstadt", "FC Alpha", []),
        _game("2", "FC Beta", "SV Musterstadt", []),
        _game("3", "SV Musterstadt", "FC Gamma", []),
    ]
    assert derive_team_name(games) == "SV Musterstadt"


def test_derive_team_name_empty():
    assert derive_team_name([]) is None


# --- goal timing -----------------------------------------------------------

def test_goal_timing_scored_and_conceded_by_side():
    games = [
        # We are home: score at 10' (band 0), concede at 80' (band 5)
        _game("1", "Us", "Them", [_goal(10, "home", "A. Müller"), _goal(80, "away", "X")]),
        # We are away: score at 50' (band 3)
        _game("2", "Them", "Us", [_goal(50, "away", "A. Müller")]),
    ]
    timing = build_goal_timing(games, "Us")
    assert timing.sample_size == 2
    bands = {b.label: (b.scored, b.conceded) for b in timing.bands}
    assert bands["1-15"] == (1, 0)
    assert bands["46-60"] == (1, 0)
    assert bands["76-90"] == (0, 1)


def test_goal_timing_ignores_games_without_our_team():
    games = [_game("1", "Foo", "Bar", [_goal(10, "home", "Z")])]
    timing = build_goal_timing(games, "Us")
    assert timing.sample_size == 0
    assert all(b.scored == 0 and b.conceded == 0 for b in timing.bands)


# --- top scorers -----------------------------------------------------------

def test_top_scorers_rank_and_match_count():
    games = [
        _game("1", "Us", "Them", [_goal(10, "home", "A. Müller"), _goal(60, "home", "A. Müller")]),
        _game("2", "Them", "Us", [_goal(20, "away", "B. Schmidt"), _goal(70, "away", "A. Müller")]),
    ]
    scorers = build_top_scorers(games, "Us")
    assert scorers[0].name == "A. Müller"
    assert scorers[0].goals == 3
    assert scorers[0].matches == 2
    assert scorers[1].name == "B. Schmidt"
    assert scorers[1].goals == 1
    assert scorers[1].matches == 1


def test_top_scorers_skip_own_goals_and_opponent_goals():
    games = [
        _game("1", "Us", "Them", [
            _goal(10, "home", "Eigentor"),   # own goal marker -> skip
            _goal(20, "away", "Their Guy"),  # opponent goal -> skip
            _goal(30, "home", "Real Scorer"),
        ]),
    ]
    scorers = build_top_scorers(games, "Us")
    assert [s.name for s in scorers] == ["Real Scorer"]


# --- end to end ------------------------------------------------------------

def test_build_scoring_insights_end_to_end():
    games = [
        _game("1", "Us", "Them", [_goal(10, "home", "A. Müller"), _goal(80, "away", "X")]),
        _game("2", "Them", "Us", [_goal(50, "away", "A. Müller")]),
    ]
    insights = build_scoring_insights(games)
    assert insights.team_name == "Us"
    assert insights.sample_size == 2
    assert insights.goal_timing.sample_size == 2
    assert insights.top_scorers[0].name == "A. Müller"
    assert insights.top_scorers[0].goals == 2
