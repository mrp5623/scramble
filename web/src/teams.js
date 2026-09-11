/**
 * Team presentation data: the abbreviation fans recognize, and the two inks each
 * card is printed in.
 *
 * Keyed by the Pro-Football-Reference franchise codes used in data/nfl_qbs.json,
 * which is why the Colts are `clt` but display as IND. Presentation only -- the C++
 * game reads nfl_qbs.json, so colours never go there.
 *
 * `primary` fills the team block behind a white team name. `accent` is printed only
 * as the halftone dot screen and must never carry text.
 */
export const TEAMS = {
  atl: { abbr: 'ATL', primary: '#A71930', accent: '#000000' },
  buf: { abbr: 'BUF', primary: '#00338D', accent: '#C60C30' },
  car: { abbr: 'CAR', primary: '#0085CA', accent: '#101820' },
  chi: { abbr: 'CHI', primary: '#0B162A', accent: '#C83803' },
  cin: { abbr: 'CIN', primary: '#FB4F14', accent: '#000000' },
  cle: { abbr: 'CLE', primary: '#311D00', accent: '#FF3C00' },
  clt: { abbr: 'IND', primary: '#002C5F', accent: '#A2AAAD' },
  crd: { abbr: 'ARI', primary: '#97233F', accent: '#FFB612' },
  dal: { abbr: 'DAL', primary: '#041E42', accent: '#869397' },
  den: { abbr: 'DEN', primary: '#FB4F14', accent: '#002244' },
  det: { abbr: 'DET', primary: '#0076B6', accent: '#B0B7BC' },
  gnb: { abbr: 'GB', primary: '#203731', accent: '#FFB612' },
  htx: { abbr: 'HOU', primary: '#03202F', accent: '#A71930' },
  jax: { abbr: 'JAX', primary: '#006778', accent: '#D7A22A' },
  kan: { abbr: 'KC', primary: '#E31837', accent: '#FFB81C' },
  mia: { abbr: 'MIA', primary: '#008E97', accent: '#FC4C02' },
  min: { abbr: 'MIN', primary: '#4F2683', accent: '#FFC62F' },
  nor: { abbr: 'NO', primary: '#D3BC8D', accent: '#101820' },
  nwe: { abbr: 'NE', primary: '#002244', accent: '#C60C30' },
  nyg: { abbr: 'NYG', primary: '#0B2265', accent: '#A71930' },
  nyj: { abbr: 'NYJ', primary: '#125740', accent: '#FFFFFF' },
  oti: { abbr: 'TEN', primary: '#0C2340', accent: '#4B92DB' },
  phi: { abbr: 'PHI', primary: '#004C54', accent: '#A5ACAF' },
  pit: { abbr: 'PIT', primary: '#101820', accent: '#FFB612' },
  rai: { abbr: 'LV', primary: '#000000', accent: '#A5ACAF' },
  ram: { abbr: 'LAR', primary: '#003594', accent: '#FFA300' },
  rav: { abbr: 'BAL', primary: '#241773', accent: '#9E7C0C' },
  sdg: { abbr: 'LAC', primary: '#0080C6', accent: '#FFC20E' },
  sea: { abbr: 'SEA', primary: '#002244', accent: '#69BE28' },
  sfo: { abbr: 'SF', primary: '#AA0000', accent: '#B3995D' },
  tam: { abbr: 'TB', primary: '#D50A0A', accent: '#34302B' },
  was: { abbr: 'WAS', primary: '#5A1414', accent: '#FFB612' },
};

export function teamStyle(code) {
  const team = TEAMS[code];
  if (!team) throw new Error(`No presentation data for team code: ${code}`);
  return team;
}
