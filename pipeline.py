"""Daily NHL standings download, normalization, history, and issue publishing."""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
HISTORY_PATH = DATA_DIR / "history.csv"
STATUS_PATH = DATA_DIR / "status.json"
SOURCE_NAME = "nhl-standings"
SOURCE_URL = "https://api-web.nhle.com/v1/standings/now"

HISTORY_COLUMNS = [
    "date", "item_id", "item", "source", "conference", "division", "conference_rank", "division_rank", "wildcard_rank", "rank",
    "games_played", "wins", "losses", "ot_losses", "points", "point_pct",
    "goals_for", "goals_against", "goal_differential", "streak_code",
    "streak_count", "season_id", "team_logo",
]

NUMERIC_COLUMNS = [
    "rank", "games_played", "wins", "losses", "ot_losses", "points", "point_pct",
    "goals_for", "goals_against", "goal_differential", "streak_count", "season_id",
]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_date(value: datetime | None = None) -> str:
    return (value or utc_now()).date().isoformat()


def nested_default(value: Any, fallback: Any = "") -> Any:
    if isinstance(value, dict):
        return value.get("default", fallback)
    return value if value is not None else fallback


def _number(value: Any) -> Any:
    return "" if value is None or value == "" else value


def convert_standings(payload: dict[str, Any], date: str) -> list[dict[str, Any]]:
    """Convert one NHL response into the fixed history schema."""
    standings = payload.get("standings")
    if not isinstance(standings, list):
        raise ValueError("NHL response did not contain a standings list")

    rows: list[dict[str, Any]] = []
    for entry in standings:
        team_id = str(nested_default(entry.get("teamAbbrev"))).strip()
        team_name = str(nested_default(entry.get("teamName"), nested_default(entry.get("placeName")))).strip()
        if not team_id or not team_name:
            raise ValueError("NHL standings row is missing teamAbbrev or teamName")
        rows.append({
            "date": date, "item_id": team_id, "item": team_name, "source": SOURCE_NAME,
            "conference": entry.get("conferenceName", ""), "division": entry.get("divisionName", ""),
            "conference_rank": _number(entry.get("conferenceSequence")), "division_rank": _number(entry.get("divisionSequence")),
            "wildcard_rank": _number(entry.get("wildcardSequence")),
            "rank": _number(entry.get("leagueSequence")), "games_played": _number(entry.get("gamesPlayed")),
            "wins": _number(entry.get("wins")), "losses": _number(entry.get("losses")),
            "ot_losses": _number(entry.get("otLosses")), "points": _number(entry.get("points")),
            "point_pct": _number(entry.get("pointPctg")), "goals_for": _number(entry.get("goalFor")),
            "goals_against": _number(entry.get("goalAgainst")), "goal_differential": _number(entry.get("goalDifferential")),
            "streak_code": entry.get("streakCode", ""), "streak_count": _number(entry.get("streakCount")),
            "season_id": _number(entry.get("seasonId")), "team_logo": entry.get("teamLogo", ""),
        })

    ids = [row["item_id"] for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("NHL response contained duplicate team abbreviations")
    return sorted(rows, key=lambda row: (str(row["date"]), str(row["item_id"])))


def fetch_source(url: str | None = None, timeout: int = 30, date: str | None = None) -> bytes:
    if url is None:
        url = SOURCE_URL if date is None else f"https://api-web.nhle.com/v1/standings/{date}"
    request = Request(url, headers={"User-Agent": "nhl-standings-tracker/1.0"})
    with urlopen(request, timeout=timeout) as response:
        content = response.read()
    payload = json.loads(content)
    if not isinstance(payload, dict) or not isinstance(payload.get("standings"), list):
        raise ValueError("source returned invalid NHL standings JSON")
    return content


def write_raw(raw_bytes: bytes, run_date: str, raw_dir: Path = RAW_DIR) -> Path:
    target_dir = raw_dir / run_date
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / "nhl_standings.json.gz"
    with target.open("wb") as output:
        with gzip.GzipFile(fileobj=output, mode="wb", mtime=0) as compressed:
            compressed.write(raw_bytes)
    return target


def raw_files(raw_dir: Path = RAW_DIR) -> list[tuple[str, Path]]:
    files: list[tuple[str, Path]] = []
    if not raw_dir.exists():
        return files
    for path in sorted(raw_dir.glob("*/nhl_standings.json.gz")):
        date = path.parent.name
        try:
            datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            continue
        files.append((date, path))
    return files


def read_raw(path: Path) -> dict[str, Any]:
    with gzip.open(path, "rt", encoding="utf-8") as source:
        payload = json.load(source)
    if not isinstance(payload, dict):
        raise ValueError(f"raw file is not a JSON object: {path}")
    return payload


def build_history(raw_dir: Path = RAW_DIR, history_path: Path = HISTORY_PATH) -> list[dict[str, Any]]:
    """Rebuild the CSV from compressed raw files only."""
    by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for date, path in raw_files(raw_dir):
        for row in convert_standings(read_raw(path), date):
            by_key[(date, str(row["item_id"]))] = row
    rows = [by_key[key] for key in sorted(by_key)]
    history_path.parent.mkdir(parents=True, exist_ok=True)
    with history_path.open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(output, fieldnames=HISTORY_COLUMNS, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return rows


def load_history(history_path: Path = HISTORY_PATH) -> list[dict[str, Any]]:
    if not history_path.exists():
        return []
    with history_path.open(newline="", encoding="utf-8") as source:
        return list(csv.DictReader(source))


def as_float(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def calculate_move_score(current: dict[str, Any], previous: dict[str, Any] | None) -> float:
    """Return the documented points-plus-rank absolute movement score."""
    if previous is None:
        return (as_float(current.get("points")) or 0.0) + (as_float(current.get("rank")) or 0.0)
    point_delta = abs((as_float(current.get("points")) or 0.0) - (as_float(previous.get("points")) or 0.0))
    rank_delta = abs((as_float(current.get("rank")) or 0.0) - (as_float(previous.get("rank")) or 0.0))
    return point_delta + rank_delta


def calculate_moves(current_rows: Iterable[dict[str, Any]], previous_rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    current = {str(row["item_id"]): row for row in current_rows}
    previous = {str(row["item_id"]): row for row in previous_rows}
    moves: list[dict[str, Any]] = []
    for item_id in sorted(set(current) | set(previous)):
        now, before = current.get(item_id), previous.get(item_id)
        if now is None:
            moves.append({"item_id": item_id, "item": before.get("item", item_id), "kind": "gone", "score": 0.0, "current": None, "previous": before})
        elif before is None:
            moves.append({"item_id": item_id, "item": now.get("item", item_id), "kind": "new", "score": calculate_move_score(now, None), "current": now, "previous": None})
        else:
            score = calculate_move_score(now, before)
            if score > 0:
                moves.append({"item_id": item_id, "item": now.get("item", item_id), "kind": "changed", "score": score, "current": now, "previous": before})
    return sorted(moves, key=lambda move: (-float(move["score"]), str(move["item_id"])))


def previous_date(rows: list[dict[str, Any]], latest_date: str) -> str | None:
    dates = sorted({str(row["date"]) for row in rows if str(row["date"]) < latest_date})
    return dates[-1] if dates else None


def write_status(rows: list[dict[str, Any]], source_results: list[dict[str, Any]], run_time: str, status_path: Path = STATUS_PATH) -> dict[str, Any]:
    dates = sorted({str(date) for date, _ in raw_files(status_path.parent / "raw")})
    latest_date = max({str(row["date"]) for row in rows}, default=None)
    latest_rows = [row for row in rows if row.get("date") == latest_date]
    prior = previous_date(rows, latest_date) if latest_date else None
    prior_rows = [row for row in rows if row.get("date") == prior]
    latest_ids = {str(row["item_id"]) for row in latest_rows}
    prior_ids = {str(row["item_id"]) for row in prior_rows}
    status = {
        "run_time": run_time, "first_run_date": dates[0] if dates else None,
        "days_with_success": len(dates), "items": len(latest_rows),
        "new_today": sorted(latest_ids - prior_ids), "gone_today": sorted(prior_ids - latest_ids),
        "sources": source_results, "latest_data_date": latest_date,
    }
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(json.dumps(status, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return status


def issue_body(status: dict[str, Any], moves: list[dict[str, Any]]) -> str:
    lines = [f"## NHL standings changes for {status.get('latest_data_date') or 'today'}", "", f"The move score is `abs(points change) + abs(rank change)`. {status.get('items', 0)} teams are in the latest snapshot.", "", "### Biggest moves", "", "| Team | Type | Previous points | New points | Previous rank | New rank | Score |", "| --- | --- | ---: | ---: | ---: | ---: | ---: |"]
    for move in [move for move in moves if move["kind"] != "gone"][:10]:
        before, now = move.get("previous") or {}, move.get("current") or {}
        lines.append(f"| {move['item']} | {move['kind']} | {before.get('points', '-')} | {now.get('points', '-')} | {before.get('rank', '-')} | {now.get('rank', '-')} | {move['score']:.1f} |")
    gone = [move for move in moves if move["kind"] == "gone"]
    if gone:
        lines.extend(["", "### Disappeared", "", ", ".join(move["item"] for move in gone)])
    return "\n".join(lines) + "\n"


def publish_issue(status: dict[str, Any], body: str, token: str | None = None, repository: str | None = None) -> bool:
    """Close open tracker issues and create today's issue when running in Actions."""
    token = token or os.environ.get("GITHUB_TOKEN")
    repository = repository or os.environ.get("GITHUB_REPOSITORY")
    if not token or not repository:
        return False
    api_root = f"https://api.github.com/repos/{repository}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "User-Agent": "nhl-standings-tracker"}

    def request(url: str, method: str = "GET", payload: dict[str, Any] | None = None) -> Any:
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = Request(url, data=data, headers={**headers, "Content-Type": "application/json"}, method=method)
        with urlopen(req, timeout=30) as response:
            raw = response.read()
        return json.loads(raw) if raw else None

    try:
        open_issues = request(f"{api_root}/issues?state=open&per_page=100")
        current_title = f"NHL Standings - {status.get('latest_data_date') or utc_date()}"
        current_issue = None
        for issue in open_issues if isinstance(open_issues, list) else []:
            if issue.get("title") == current_title:
                current_issue = issue
            elif str(issue.get("title", "")).startswith("NHL Standings - "):
                request(f"{api_root}/issues/{issue['number']}", method="PATCH", payload={"state": "closed"})
        if current_issue:
            request(f"{api_root}/issues/{current_issue['number']}", method="PATCH", payload={"body": body, "state": "open"})
        else:
            request(f"{api_root}/issues", method="POST", payload={"title": current_title, "body": body})
        return True
    except (HTTPError, URLError, TimeoutError, ValueError) as error:
        print(f"issue publishing skipped after GitHub API error: {error}", file=sys.stderr)
        return False


def run_pipeline(run_date: str | None = None, offline: bool = False, publish: bool = True) -> dict[str, Any]:
    run_date = run_date or utc_date()
    run_time = utc_now().isoformat().replace("+00:00", "Z")
    source_results: list[dict[str, Any]] = []
    if not offline:
        try:
            raw_bytes = fetch_source(date=run_date)
            write_raw(raw_bytes, run_date, RAW_DIR)
            count = len(convert_standings(json.loads(raw_bytes), run_date))
            source_results.append({"name": SOURCE_NAME, "ok": True, "count": count})
        except (HTTPError, URLError, TimeoutError, ValueError, OSError) as error:
            print(f"source failed: {error}", file=sys.stderr)
            source_results.append({"name": SOURCE_NAME, "ok": False, "count": 0})
    else:
        latest_count = sum(1 for row in build_history(RAW_DIR, HISTORY_PATH) if row.get("date") == run_date)
        source_results.append({"name": SOURCE_NAME, "ok": True, "count": latest_count})
    rows = build_history(RAW_DIR, HISTORY_PATH)
    status = write_status(rows, source_results, run_time, STATUS_PATH)
    latest_date = status.get("latest_data_date")
    latest_rows = [row for row in rows if row.get("date") == latest_date]
    prior = previous_date(rows, latest_date) if latest_date else None
    prior_rows = [row for row in rows if row.get("date") == prior]
    moves = calculate_moves(latest_rows, prior_rows)
    if publish:
        publish_issue(status, issue_body(status, moves))
    return status


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", help="UTC date override, useful for tests and backfills")
    parser.add_argument("--offline", action="store_true", help="rebuild from existing raw files without fetching")
    parser.add_argument("--skip-issue", action="store_true", help="do not call the GitHub Issues API")
    args = parser.parse_args()
    run_pipeline(run_date=args.date, offline=args.offline, publish=not args.skip_issue)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
