/**
 * A two-team, three-QB dataset with hand-computable feature values.
 *
 * 'alpha qb' plays for both teams, which is what makes save-value non-zero and
 * lets the feature tests assert exact numbers instead of approximations.
 */
export const TINY_DATA = {
  aaa: { display_name: 'Team A', qbs: { 'alpha qb': 100, 'beta qb': 60 } },
  bbb: { display_name: 'Team B', qbs: { 'alpha qb': 100, 'gamma qb': 40 } },
};
