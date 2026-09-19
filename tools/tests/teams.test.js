import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamCode, TEAM_NAMES } from '../lib/teams.mjs';

test('the map covers exactly the 32 franchises', () => {
  assert.equal(Object.keys(TEAM_NAMES).length, 32);
});

test('current abbreviations map to the game codes', () => {
  assert.equal(teamCode('CIN'), 'cin');
  assert.equal(teamCode('ARI'), 'crd');
  assert.equal(teamCode('BAL'), 'rav');
  assert.equal(teamCode('GB'), 'gnb');
  assert.equal(teamCode('NE'), 'nwe');
  assert.equal(teamCode('TEN'), 'oti');
});

test('relocated franchises map to their surviving code', () => {
  // A quarterback who threw for the Oakland Raiders and the Las Vegas Raiders played
  // for one franchise, which is the one the game asks about.
  assert.equal(teamCode('OAK'), 'rai');
  assert.equal(teamCode('LV'), 'rai');
  assert.equal(teamCode('SD'), 'sdg');
  assert.equal(teamCode('LAC'), 'sdg');
  assert.equal(teamCode('STL'), 'ram');
  assert.equal(teamCode('LA'), 'ram');
  assert.equal(teamCode('LAR'), 'ram');
});

test('case does not matter', () => {
  assert.equal(teamCode('cin'), 'cin');
});

test('an unknown abbreviation is a hard error', () => {
  // Skipping the row would silently lose a team association.
  assert.throws(() => teamCode('XXX'), /Unknown team/);
});

test('every franchise code in the name map is a real one', () => {
  for (const [code, name] of Object.entries(TEAM_NAMES)) {
    assert.match(code, /^[a-z]{3}$/);
    assert.ok(name.length > 0);
  }
  assert.ok('crd' in TEAM_NAMES);
});
