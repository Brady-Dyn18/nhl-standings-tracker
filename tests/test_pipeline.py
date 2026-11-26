import csv
import gzip
import json
from pathlib import Path
from urllib.error import URLError

import pipeline
from pipeline import HISTORY_COLUMNS, build_history, calculate_move_score, convert_standings, write_raw


def payload(*teams):
    return {"standings": [{
        "teamAbbrev": {"default": code}, "teamName": {"default": name},
        "conferenceName": conference, "divisionName": division, "leagueSequence": rank,
        "conferenceSequence": rank, "divisionSequence": rank, "wildcardSequence": 0,
        "gamesPlayed": games, "wins": wins, "losses": losses, "otLosses": ot_losses,
        "points": points, "pointPctg": points / (games * 2), "goalFor": goals_for,
        "goalAgainst": goals_against, "goalDifferential": goals_for - goals_against,
        "streakCode": "W", "streakCount": 2, "seasonId": 20262027,
        "teamLogo": f"https://assets.nhle.com/logos/{code}.svg",
    } for code, name, conference, division, rank, games, wins, losses, ot_losses, points, goals_for, goals_against in teams]}


def test_convert_standings_uses_fixed_columns_and_numeric_values():
    data = payload(("AAA", "Alpha Bears", "Eastern", "Atlantic", 1, 10, 8, 1, 1, 17, 40, 20))
    rows = convert_standings(data, "2026-11-25")
    assert rows[0]["date"] == "2026-11-25"
    assert rows[0]["item_id"] == "AAA"
    assert rows[0]["item"] == "Alpha Bears"
    assert rows[0]["points"] == 17
    assert rows[0]["goal_differential"] == 20
    assert list(rows[0]) == HISTORY_COLUMNS


def test_move_rule_is_absolute_points_plus_rank_change():
    assert calculate_move_score({"points": "23", "rank": "3"}, {"points": "20", "rank": "6"}) == 6


def test_history_rebuild_is_sorted_and_same_day_raw_replacement_wins(tmp_path: Path):
    raw_dir, history = tmp_path / "raw", tmp_path / "history.csv"
    day_one = payload(("BBB", "Beta Foxes", "Western", "Central", 2, 10, 5, 4, 1, 11, 31, 30), ("AAA", "Alpha Bears", "Eastern", "Atlantic", 1, 10, 8, 1, 1, 17, 40, 20))
    day_two_first = payload(("BBB", "Beta Foxes", "Western", "Central", 2, 11, 5, 5, 1, 11, 32, 35), ("AAA", "Alpha Bears", "Eastern", "Atlantic", 1, 11, 9, 1, 1, 19, 44, 21))
    day_two_replacement = payload(("BBB", "Beta Foxes", "Western", "Central", 2, 11, 6, 4, 1, 13, 36, 35), ("AAA", "Alpha Bears", "Eastern", "Atlantic", 1, 11, 9, 1, 1, 19, 44, 21))
    write_raw(json.dumps(day_one).encode(), "2026-11-24", raw_dir)
    write_raw(json.dumps(day_two_first).encode(), "2026-11-25", raw_dir)
    write_raw(json.dumps(day_two_replacement).encode(), "2026-11-25", raw_dir)
    rows = build_history(raw_dir, history)
    assert [(row["date"], row["item_id"]) for row in rows] == [("2026-11-24", "AAA"), ("2026-11-24", "BBB"), ("2026-11-25", "AAA"), ("2026-11-25", "BBB")]
    assert rows[-1]["points"] == 13
    with history.open(newline="", encoding="utf-8") as source:
        assert len(list(csv.DictReader(source))) == 4


def test_raw_snapshot_is_gzipped_json(tmp_path: Path):
    raw = write_raw(b'{"standings": []}', "2026-11-25", tmp_path / "raw")
    with gzip.open(raw, "rt", encoding="utf-8") as source:
        assert json.load(source) == {"standings": []}


def test_failed_source_is_recorded_without_writing_a_new_raw_file(tmp_path: Path, monkeypatch):
    raw_dir, history, status_path = tmp_path / "data" / "raw", tmp_path / "data" / "history.csv", tmp_path / "data" / "status.json"
    write_raw(json.dumps(payload(("AAA", "Alpha Bears", "Eastern", "Atlantic", 1, 10, 8, 1, 1, 17, 40, 20))).encode(), "2026-11-24", raw_dir)
    monkeypatch.setattr(pipeline, "RAW_DIR", raw_dir)
    monkeypatch.setattr(pipeline, "HISTORY_PATH", history)
    monkeypatch.setattr(pipeline, "STATUS_PATH", status_path)
    monkeypatch.setattr(pipeline, "fetch_source", lambda **kwargs: (_ for _ in ()).throw(URLError("offline")))

    result = pipeline.run_pipeline(run_date="2026-11-25", publish=False)

    assert result["sources"] == [{"name": "nhl-standings", "ok": False, "count": 0}]
    assert result["days_with_success"] == 1
    assert result["latest_data_date"] == "2026-11-24"
    assert not (raw_dir / "2026-11-25").exists()


def test_history_rows_include_playoff_rank_fields():
    row = convert_standings(payload(("AAA", "Alpha Bears", "Eastern", "Atlantic", 1, 10, 8, 1, 1, 17, 40, 20)), "2026-11-25")[0]
    assert row["conference_rank"] == 1
    assert row["division_rank"] == 1
    assert row["wildcard_rank"] == 0


def test_fetch_source_can_target_a_historical_standings_date(monkeypatch):
    seen = {}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return b'{"standings": []}'

    def fake_urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["timeout"] = timeout
        return Response()

    monkeypatch.setattr(pipeline, "urlopen", fake_urlopen)
    assert pipeline.fetch_source(date="2026-11-24") == b'{"standings": []}'
    assert seen == {"url": "https://api-web.nhle.com/v1/standings/2026-11-24", "timeout": 30}
