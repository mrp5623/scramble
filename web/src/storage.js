/**
 * The leaderboard seam: exactly two exports (spec section 9).
 *
 * Both return Promises even though localStorage is synchronous, so a hosted backend
 * can later replace this module's body without changing a single call site.
 *
 * Storage can be missing or throw -- private browsing, blocked site data, a full
 * quota. Scores are a convenience, so every failure degrades to "nothing saved"
 * rather than breaking the game.
 */
const KEY = 'scramble.scores.v1';

function backing() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readAll(store) {
  try {
    const parsed = JSON.parse(store.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveScore({ name, score, mode, seed, date }) {
  const store = backing();
  if (!store) return;
  const scores = readAll(store);
  scores.push({ name, score, mode, seed, date });
  try {
    store.setItem(KEY, JSON.stringify(scores));
  } catch {
    // Quota exceeded or storage blocked: this score simply isn't kept.
  }
}

export async function topScores(mode, limit = 10) {
  const store = backing();
  if (!store) return [];
  return readAll(store)
    .filter((s) => s.mode === mode)
    .sort((a, b) => b.score - a.score || String(a.date).localeCompare(String(b.date)))
    .slice(0, limit);
}
