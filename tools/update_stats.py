#!/usr/bin/env python3
"""Regenerate data/nfl_qbs.json for the Scramble game.

For every player who ever threw a pass for each franchise, records their CAREER
passing yards. Career totals are computed offline by summing a player's
franchise pass_yds across all 32 cached PFR team pages (a player's career total
is the sum of their yards with each franchise). No network access, no 5000
placeholder.

Known limitation: players who also played for defunct pre-1950 franchises
outside today's 32 (e.g. the AAFC Baltimore Colts) are slightly undercounted.
"""
import json
import os
import sys
from collections import defaultdict
from lxml import html

# Franchise code -> display name. Codes match the game's internal team codes.
TEAM_NAMES = {
    "crd": "Arizona Cardinals",   "atl": "Atlanta Falcons",      "rav": "Baltimore Ravens",
    "buf": "Buffalo Bills",       "car": "Carolina Panthers",    "chi": "Chicago Bears",
    "cin": "Cincinnati Bengals",  "cle": "Cleveland Browns",     "dal": "Dallas Cowboys",
    "den": "Denver Broncos",      "det": "Detroit Lions",        "gnb": "Green Bay Packers",
    "htx": "Houston Texans",      "clt": "Indianapolis Colts",   "jax": "Jacksonville Jaguars",
    "kan": "Kansas City Chiefs",  "rai": "Las Vegas Raiders",    "sdg": "Los Angeles Chargers",
    "ram": "Los Angeles Rams",    "mia": "Miami Dolphins",       "min": "Minnesota Vikings",
    "nwe": "New England Patriots", "nor": "New Orleans Saints",   "nyg": "New York Giants",
    "nyj": "New York Jets",       "phi": "Philadelphia Eagles",  "pit": "Pittsburgh Steelers",
    "sfo": "San Francisco 49ers", "sea": "Seattle Seahawks",     "tam": "Tampa Bay Buccaneers",
    "oti": "Tennessee Titans",    "was": "Washington Commanders",
}


def normalize(s: str) -> str:
    return " ".join(s.strip().split()).lower()


def parse_team(html_path: str):
    """Return {player_name: franchise_pass_yds} for one team page."""
    with open(html_path, encoding="utf-8") as f:
        doc = html.fromstring(f.read())
    out = {}
    for row in doc.xpath("//table[@id='passing']//tbody//tr"):
        name = row.xpath(".//td[@data-stat='player']//text()")
        yds = row.xpath(".//td[@data-stat='pass_yds']//text()")
        if not name:
            continue
        player = normalize(name[0])
        if not player:
            continue
        value = int(yds[0].replace(",", "")) if (yds and yds[0].strip()) else 0
        # A player may appear on multiple rows of one page; keep the largest.
        out[player] = max(out.get(player, 0), value)
    return out


def main() -> int:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    caches = os.path.join(root, "caches")

    per_team = {}          # code -> {player: franchise_yds}
    career = defaultdict(int)  # player -> career yds (sum across franchises)
    for code in TEAM_NAMES:
        html_path = os.path.join(caches, f"team_{code}.html")
        if not os.path.exists(html_path):
            print(f"ERROR: missing {html_path}", file=sys.stderr)
            return 1
        team = parse_team(html_path)
        per_team[code] = team
        for player, yds in team.items():
            career[player] += yds

    result = {}
    for code, name in TEAM_NAMES.items():
        qbs = {p: career[p] for p in per_team[code]}
        qbs = dict(sorted(qbs.items(), key=lambda kv: kv[1], reverse=True))
        result[code] = {"display_name": name, "qbs": qbs}

    out_dir = os.path.join(root, "data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "nfl_qbs.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    total_rows = sum(len(v["qbs"]) for v in result.values())
    print(f"Wrote {out_path}")
    print(f"  teams: {len(result)}  unique players: {len(career)}  team-QB rows: {total_rows}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
