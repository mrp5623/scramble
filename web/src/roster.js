/**
 * Loads and indexes data/nfl_qbs.json.
 *
 * The per-team sort must match Python's
 *   sorted(qbs.keys(), key=lambda q: (-int(qbs[q]), q))
 * exactly: yards descending, ties broken by name ascending. Greedy takes element 0,
 * so a different tiebreak silently breaks parity with the study.
 */

export function buildRoster(data) {
  const teamCodes = Object.keys(data).sort();
  const teamNames = {};
  const teamQbs = {};
  const qbYards = {};
  const qbTeams = new Map();

  for (const code of teamCodes) {
    teamNames[code] = data[code].display_name;
    const qbs = data[code].qbs;

    teamQbs[code] = Object.keys(qbs).sort((p, q) => {
      const dy = Number(qbs[q]) - Number(qbs[p]);
      if (dy !== 0) return dy;
      return p < q ? -1 : p > q ? 1 : 0;
    });

    for (const [name, yards] of Object.entries(qbs)) {
      qbYards[name] = Number(yards);
      let teams = qbTeams.get(name);
      if (!teams) {
        teams = new Set();
        qbTeams.set(name, teams);
      }
      teams.add(code);
    }
  }

  let yardScale = 0;
  for (const y of Object.values(qbYards)) {
    if (y > yardScale) yardScale = y;
  }

  return { teamCodes, teamNames, teamQbs, qbYards, qbTeams, yardScale };
}

export async function fetchRoster(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load roster from ${url}: ${res.status}`);
  return buildRoster(await res.json());
}
