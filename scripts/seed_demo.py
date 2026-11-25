"""Create two clearly labeled local preview snapshots for the static site."""

from __future__ import annotations

import json
from pathlib import Path

from pipeline import write_raw


ROOT = Path(__file__).resolve().parents[1]

TEAMS = [
    ("ANA", "Anaheim Ducks", "Western", "Pacific"),
    ("BOS", "Boston Bruins", "Eastern", "Atlantic"),
    ("BUF", "Buffalo Sabres", "Eastern", "Atlantic"),
    ("CGY", "Calgary Flames", "Western", "Pacific"),
    ("CAR", "Carolina Hurricanes", "Eastern", "Metropolitan"),
    ("CHI", "Chicago Blackhawks", "Western", "Central"),
    ("COL", "Colorado Avalanche", "Western", "Central"),
    ("CBJ", "Columbus Blue Jackets", "Eastern", "Metropolitan"),
    ("DAL", "Dallas Stars", "Western", "Central"),
    ("DET", "Detroit Red Wings", "Eastern", "Atlantic"),
    ("EDM", "Edmonton Oilers", "Western", "Pacific"),
    ("FLA", "Florida Panthers", "Eastern", "Atlantic"),
    ("LAK", "Los Angeles Kings", "Western", "Pacific"),
    ("MIN", "Minnesota Wild", "Western", "Central"),
    ("MTL", "Montréal Canadiens", "Eastern", "Atlantic"),
    ("NSH", "Nashville Predators", "Western", "Central"),
    ("NJD", "New Jersey Devils", "Eastern", "Metropolitan"),
    ("NYI", "New York Islanders", "Eastern", "Metropolitan"),
    ("NYR", "New York Rangers", "Eastern", "Metropolitan"),
    ("OTT", "Ottawa Senators", "Eastern", "Atlantic"),
    ("PHI", "Philadelphia Flyers", "Eastern", "Metropolitan"),
    ("PIT", "Pittsburgh Penguins", "Eastern", "Metropolitan"),
    ("SJS", "San Jose Sharks", "Western", "Pacific"),
    ("SEA", "Seattle Kraken", "Western", "Pacific"),
    ("STL", "St. Louis Blues", "Western", "Central"),
    ("TBL", "Tampa Bay Lightning", "Eastern", "Atlantic"),
    ("TOR", "Toronto Maple Leafs", "Eastern", "Atlantic"),
    ("UTA", "Utah Mammoth", "Western", "Central"),
    ("VAN", "Vancouver Canucks", "Western", "Pacific"),
    ("VGK", "Vegas Golden Knights", "Western", "Pacific"),
    ("WSH", "Washington Capitals", "Eastern", "Metropolitan"),
    ("WPG", "Winnipeg Jets", "Western", "Central"),
]


def snapshot(day_offset: int) -> dict:
    rows = []
    for index, (code, name, conference, division) in enumerate(TEAMS):
        games = 18 + ((index * 3 + day_offset) % 8)
        wins = 5 + ((index * 5 + day_offset * 2) % 12)
        losses = 2 + ((index * 2 + day_offset) % 7)
        ot_losses = max(0, games - wins - losses)
        if ot_losses > 4:
            losses += ot_losses - 4
            ot_losses = 4
        points = wins * 2 + ot_losses
        goals_for = 48 + index * 2 + day_offset * (index % 3)
        goals_against = 44 + (31 - index) + day_offset * ((index + 1) % 3)
        rows.append({
            "teamAbbrev": {"default": code}, "teamName": {"default": name},
            "conferenceName": conference, "divisionName": division,
            "gamesPlayed": games, "wins": wins, "losses": losses, "otLosses": ot_losses,
            "points": points, "pointPctg": round(points / (games * 2), 6),
            "goalFor": goals_for, "goalAgainst": goals_against,
            "goalDifferential": goals_for - goals_against,
            "streakCode": "W" if index % 3 else "L", "streakCount": 1 + (index + day_offset) % 4,
            "seasonId": 20262027, "teamLogo": f"https://assets.nhle.com/logos/nhl/svg/{code}_light.svg",
        })
    rows.sort(key=lambda row: (-row["points"], -row["goalDifferential"], row["teamAbbrev"]["default"]))
    for rank, row in enumerate(rows, 1):
        row["leagueSequence"] = rank
    return {"standingsDateTimeUtc": f"2026-11-{24 + day_offset:02d}T06:15:00Z", "standings": rows}


if __name__ == "__main__":
    for offset, date in enumerate(("2026-11-24", "2026-11-25")):
        write_raw(json.dumps(snapshot(offset), ensure_ascii=False).encode(), date, ROOT / "data" / "raw")
    print("Seeded two local preview snapshots. Replace them with live pipeline runs for the assignment.")
