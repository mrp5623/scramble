/**
 * The leaderboard seam: still exactly two exports (spec section 9), now backed by
 * Supabase instead of localStorage.
 *
 * Both return Promises, which is why this swap touched no call site -- the original
 * localStorage implementation was already async-shaped for exactly this change.
 *
 * One table serves both boards. `day` is null for Classic and the bot modes and set
 * for a Daily Special run; the all-time board ignores it, the daily board filters on
 * it. A daily run therefore counts for both boards from one row.
 *
 * Scores are a convenience, so every failure -- offline, HTTP error, unconfigured
 * project, garbage response -- degrades to "no scores" rather than breaking the game.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { deviceId } from './daily.js';

const ENDPOINT = `${SUPABASE_URL}/rest/v1/scores`;
const COLUMNS = 'id,name,score';

function headers(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** Resolves to the inserted row's id, or null if it did not land. */
export async function saveScore({ name, score, seed, day = null }) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ name, score, seed, day, device_id: deviceId() }),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const id = Array.isArray(rows) ? rows[0]?.id : undefined;
    return id == null ? null : { id };
  } catch {
    return null;
  }
}

/** `day` null reads the all-time board; a date reads that day's board. */
export async function topScores({ day = null, limit = 10 } = {}) {
  const params = new URLSearchParams({
    select: COLUMNS,
    order: 'score.desc,created_at.asc',
    limit: String(limit),
  });
  if (day) params.set('day', `eq.${day}`);

  try {
    const res = await fetch(`${ENDPOINT}?${params}`, { headers: headers() });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
