/**
 * nflverse-data release assets. Public GitHub downloads -- no auth, no scraping, and
 * no rate limit worth worrying about at one file per season.
 */
import { parseCsv } from './csv.mjs';

const BASE = 'https://github.com/nflverse/nflverse-data/releases/download/stats_player';

export async function fetchWeekly(season) {
  const url = `${BASE}/stats_player_week_${season}.csv`;
  const res = await fetch(url);
  if (res.status === 404) return null; // season not published yet
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return parseCsv(await res.text());
}

/** NFL seasons span September to January, so before March we are still in last year's. */
export function currentSeason(now = new Date()) {
  return now.getMonth() + 1 >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}
