# NHL Standings Tracker

[![Tests](https://github.com/OWNER/nhl-standings-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/nhl-standings-tracker/actions/workflows/ci.yml)

An automated daily tracker for NHL regular-season standings. The pipeline downloads the NHL's public standings JSON, archives the response, converts the tracked teams to a common history table, writes a run status file, and opens a dated GitHub Issue describing the biggest changes.

The browser site has Today, Browse, and Trends pages. It reads `data/history.csv` and `data/status.json` in the browser, stores shortlist stars in `localStorage`, and includes a web app manifest plus service worker for offline use.

## Source and scope

| Source | Format | Kept |
| --- | --- | --- |
| NHL public standings endpoint (`https://api-web.nhle.com/v1/standings/now`) | JSON | All regular-season teams returned by the endpoint, one row per team. No API key or login is required. |

The source currently reports 32 teams. `teamAbbrev.default` is the stable `item_id`, so the same team lines up from day to day. The raw response is stored as `data/raw/YYYY-MM-DD/nhl_standings.json.gz`. A second run on the same UTC date replaces that day's raw file and rebuilds the history.

## Pipeline behavior

The daily workflow runs at 06:15 UTC and can also be started manually. A source failure is recorded in `data/status.json`; it does not stop the run or delete existing history. A successful workflow run commits the raw files, history, and status back to the repository.

The move rule is:

```text
move_score = abs(points - previous_points) + abs(rank - previous_rank)
```

The Today page and daily issue list the ten highest-scoring teams. New teams receive a score of `points + rank`; disappeared teams are listed separately. A team with no numeric change is still available in the latest table but is not in the biggest-moves list.

## Data files

`data/history.csv` is sorted by UTC `date`, then `item_id`. Its columns are:

| Column | Meaning | Unit |
| --- | --- | --- |
| `date` | UTC date represented by the raw snapshot | `YYYY-MM-DD` |
| `item_id` | Stable NHL team abbreviation | text |
| `item` | Full team name | text |
| `source` | Source label | text |
| `conference` | Eastern or Western conference | text |
| `division` | Atlantic, Metropolitan, Central, or Pacific | text |
| `conference_rank` | Team's rank within its conference | ordinal |
| `division_rank` | Team's rank within its division | ordinal |
| `wildcard_rank` | Wild-card sequence supplied by the source; zero means not in the wildcard pool | ordinal |
| `rank` | League-wide sequence in the source response | ordinal |
| `games_played` | Games played | games |
| `wins` | Regulation or overtime wins | wins |
| `losses` | Regulation losses | losses |
| `ot_losses` | Overtime/shootout losses | losses |
| `points` | Standings points | points |
| `point_pct` | Points percentage | proportion |
| `goals_for` | Goals scored | goals |
| `goals_against` | Goals allowed | goals |
| `goal_differential` | Goals for minus goals against | goals |
| `streak_code` | Current streak type | text |
| `streak_count` | Current streak length | games |
| `season_id` | NHL season identifier | integer |
| `team_logo` | NHL logo URL | URL |

`data/status.json` contains `run_time`, `first_run_date`, `days_with_success`, `items`, `new_today`, `gone_today`, and `sources`. The `sources` list has one object per source with `name`, `ok`, and `count`; the file also includes `latest_data_date` as a convenience for the site.

## Rebuild and run

From the project directory:

```bash
uv run python pipeline.py
uv run python pipeline.py --offline --date 2026-11-25
```

The build is reproducible from raw files alone:

```bash
uv run python -c "from pipeline import build_history; build_history()"
```

For a local site preview, serve the project root so the pages can reach `data/`:

```bash
uv run python -m http.server 8000
# open http://localhost:8000/site/
```

The GitHub Actions workflow installs pytest and runs:

```bash
pytest -q
```

## File guide

| File | Purpose |
| --- | --- |
| `pipeline.py` | Fetches, archives, normalizes, rebuilds history, writes status, and publishes issues. |
| `scripts/seed_demo.py` | Creates two synthetic 32-team snapshots for an offline UI preview only. |
| `tests/test_pipeline.py` | Tests source conversion, the move rule, history rebuilds, and same-day replacement. |
| `data/raw/` | Compressed source snapshots, grouped by UTC date. |
| `data/history.csv` | Rebuilt one-row-per-team-per-day history. |
| `data/status.json` | Latest pipeline metadata and source results. |
| `site/index.html` | Today page. |
| `site/browse.html` | Filterable, searchable, sortable standings with persistent shortlist stars. |
| `site/trends.html` | Browser-computed history findings and interactive trend charts. |
| `site/app.js` | Today page rendering and shared data loading. |
| `site/browse.js` | Browse controls, table rendering, and shortlist persistence. |
| `site/trends.js` | History calculations and canvas charts. |
| `site/styles.css` | Shared responsive visual system. |
| `site/manifest.webmanifest` | Installable web app metadata. |
| `site/icon.svg` | App icon used by the manifest. |
| `site/icon-192.png` and `site/icon-512.png` | Installable PWA icons generated from the same icon design. |
| `scripts/create_icons.swift` | Recreates the PNG app icons on macOS. |
| `submission.txt` | Four-line submission template for name, student ID, repository URL, and live site URL. |
| `site/sw.js` | Offline app-shell and data cache. |
| `.github/workflows/ci.yml` | Tests on every push and pull request. |
| `.github/workflows/daily.yml` | Daily fetch, build, issue, and commit workflow. |
| `.github/workflows/pages.yml` | Publishes `site/` plus `data/` to GitHub Pages. |
| `pyproject.toml` | Python version and development dependency metadata. |

## GitHub setup

1. Push this folder to a public repository named `nhl-standings-tracker` (or update the badge URL above).
2. Enable GitHub Pages with the GitHub Actions source.
3. In repository settings, allow Actions to read and write repository contents and issues. The workflow uses its built-in `GITHUB_TOKEN`; no personal token or NHL API key is needed.
4. Run the daily workflow manually once to seed the first raw snapshot, then let the schedule build the seven-day history required by the assignment.

The checked-in preview data is synthetic and is only there so the three pages are useful before the first network run. Generate it again with `uv run python scripts/seed_demo.py`; scheduled runs always use the live NHL endpoint.

Before submitting, replace the synthetic preview snapshots by running the live workflow. Do not use `--date` to manufacture seven successful run days; use the daily schedule or manual workflow runs on the actual dates. The date override is for recovery and for testing the NHL historical endpoint.
