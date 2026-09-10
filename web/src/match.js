/**
 * Resolves a typed answer to a quarterback. See spec section 7.
 *
 * Matching runs against ALL of the current team's QBs, not just unused ones, so an
 * already-spent QB reports 'used' rather than the misleading 'wrong-team'.
 */

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

export function normalize(text) {
  const base = String(text)
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // strip combining accents left by NFD
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '') // drop periods, apostrophes (straight or curly), hyphens
    .replace(/\s+/g, ' ')
    .trim();

  const parts = base.split(' ').filter(Boolean);
  while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1])) parts.pop();
  return parts.join(' ');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

const lastNameOf = (name) => {
  const parts = normalize(name).split(' ');
  return parts[parts.length - 1];
};

/** Tolerate one edit on short inputs, two on longer ones. */
const thresholdFor = (query) => (query.length <= 5 ? 1 : 2);

/** Candidates arrive yards-descending, so the first unused one is the best available. */
function preferUnused(game, candidates) {
  return candidates.find((q) => !game.used.has(q)) ?? candidates[0];
}

function finish(game, qb) {
  if (game.used.has(qb)) return { status: 'used', qb };
  return { status: 'ok', qb, yards: game.roster.qbYards[qb] };
}

export function resolveAnswer(game, input) {
  const query = normalize(input);
  if (!query) return { status: 'unknown' };

  const { roster } = game;
  const teamList = roster.teamQbs[game.currentTeam];

  // 1. An exact full name always wins outright, which is how a player deliberately
  //    spends a lesser QB in order to save the star for a later team.
  const exact = teamList.find((name) => normalize(name) === query);
  if (exact) return finish(game, exact);

  // 2. Last name only -> the best available match on this team.
  const byLastName = teamList.filter((name) => lastNameOf(name) === query);
  if (byLastName.length) return finish(game, preferUnused(game, byLastName));

  // 3. Typo tolerance against both the full name and the last name.
  const limit = thresholdFor(query);
  let bestDistance = Infinity;
  let pool = [];
  for (const name of teamList) {
    const d = Math.min(
      levenshtein(query, normalize(name)),
      levenshtein(query, lastNameOf(name)),
    );
    if (d > limit) continue;
    if (d < bestDistance) {
      bestDistance = d;
      pool = [name];
    } else if (d === bestDistance) {
      pool.push(name);
    }
  }
  if (pool.length) return finish(game, preferUnused(game, pool));

  // 4. A real QB, just not for this franchise. Several namesakes can match a bare
  //    last name, so report the highest-yardage one, consistent with tier 2.
  let bestName = null;
  for (const name of Object.keys(roster.qbYards)) {
    if (normalize(name) !== query && lastNameOf(name) !== query) continue;
    if (bestName === null || roster.qbYards[name] > roster.qbYards[bestName]) {
      bestName = name;
    }
  }
  if (bestName !== null) return { status: 'wrong-team', qb: bestName };

  return { status: 'unknown' };
}
