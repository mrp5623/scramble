/** Franchise code -> display name. Matches the game's own dataset exactly. */
export const TEAM_NAMES = {
  crd: 'Arizona Cardinals',
  atl: 'Atlanta Falcons',
  rav: 'Baltimore Ravens',
  buf: 'Buffalo Bills',
  car: 'Carolina Panthers',
  chi: 'Chicago Bears',
  cin: 'Cincinnati Bengals',
  cle: 'Cleveland Browns',
  dal: 'Dallas Cowboys',
  den: 'Denver Broncos',
  det: 'Detroit Lions',
  gnb: 'Green Bay Packers',
  htx: 'Houston Texans',
  clt: 'Indianapolis Colts',
  jax: 'Jacksonville Jaguars',
  kan: 'Kansas City Chiefs',
  rai: 'Las Vegas Raiders',
  sdg: 'Los Angeles Chargers',
  ram: 'Los Angeles Rams',
  mia: 'Miami Dolphins',
  min: 'Minnesota Vikings',
  nwe: 'New England Patriots',
  nor: 'New Orleans Saints',
  nyg: 'New York Giants',
  nyj: 'New York Jets',
  phi: 'Philadelphia Eagles',
  pit: 'Pittsburgh Steelers',
  sfo: 'San Francisco 49ers',
  sea: 'Seattle Seahawks',
  tam: 'Tampa Bay Buccaneers',
  oti: 'Tennessee Titans',
  was: 'Washington Commanders',
};

/**
 * nflverse abbreviation -> franchise code. Relocations collapse onto the surviving
 * franchise: a quarterback who threw for Oakland and Las Vegas played for one team,
 * which is the one the game asks about.
 */
const ABBR = {
  ARI: 'crd', ATL: 'atl', BAL: 'rav', BUF: 'buf', CAR: 'car', CHI: 'chi',
  CIN: 'cin', CLE: 'cle', DAL: 'dal', DEN: 'den', DET: 'det', GB: 'gnb',
  HOU: 'htx', IND: 'clt', JAX: 'jax', JAC: 'jax', KC: 'kan',
  LA: 'ram', LAR: 'ram', STL: 'ram', LAC: 'sdg', SD: 'sdg',
  LV: 'rai', OAK: 'rai', MIA: 'mia', MIN: 'min', NE: 'nwe', NO: 'nor',
  NYG: 'nyg', NYJ: 'nyj', PHI: 'phi', PIT: 'pit', SEA: 'sea', SF: 'sfo',
  TB: 'tam', TEN: 'oti', WAS: 'was', WSH: 'was',
};

export function teamCode(abbr) {
  const code = ABBR[String(abbr).toUpperCase()];
  if (!code) throw new Error(`Unknown team abbreviation: ${abbr}`);
  return code;
}
