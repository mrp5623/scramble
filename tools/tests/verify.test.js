import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRebuild } from '../verify-data.mjs';
import { TEAM_NAMES } from '../lib/teams.mjs';

/**
 * Builds a dataset-shaped file. A career total is repeated under every franchise the
 * passer played for, which is why `passers` applies to all 32 teams by default.
 */
const file = (passers = { 'a b': 10 }, overrides = {}) => {
  const out = {};
  for (const code of Object.keys(TEAM_NAMES)) {
    out[code] = { display_name: TEAM_NAMES[code], qbs: { ...passers } };
  }
  return { ...out, ...overrides };
};

test('an unchanged rebuild is clean', () => {
  assert.deepEqual(checkRebuild(file(), file()), []);
});

test('growth is clean', () => {
  assert.deepEqual(checkRebuild(file(), file({ 'a b': 12, 'c d': 5 })), []);
});

test('a career total going down is refused', () => {
  assert.match(checkRebuild(file(), file({ 'a b': 9 })).join(' '), /a b.*decreased/);
});

test('a drop in a single team’s copy is still caught', () => {
  // The same total appears under every team, so a gate that lets the last team seen
  // win would miss this entirely.
  const next = file({ 'a b': 10 }, { cin: { display_name: 'Cincinnati Bengals', qbs: { 'a b': 9 } } });
  const complaints = checkRebuild(file(), next).join(' ');
  assert.match(complaints, /inconsistent totals/);
  assert.match(complaints, /decreased/);
});

test('a passer vanishing is refused', () => {
  assert.match(checkRebuild(file(), file({ 'z z': 1 })).join(' '), /a b.*vanished/);
});

test('a team losing every passer is refused', () => {
  const next = file({ 'a b': 10 }, { cin: { display_name: 'Cincinnati Bengals', qbs: {} } });
  assert.match(checkRebuild(file(), next).join(' '), /cin has no passers/);
});

test('a missing team is refused', () => {
  const next = file();
  delete next.cin;
  assert.match(checkRebuild(file(), next).join(' '), /cin is missing/);
});

test('an unknown team code is refused', () => {
  const next = file({ 'a b': 10 }, { zzz: { display_name: 'zzz', qbs: { 'a b': 10 } } });
  assert.match(checkRebuild(file(), next).join(' '), /unknown team code zzz/);
});

test('a shrinking passer count is refused', () => {
  assert.match(checkRebuild(file({ 'a b': 10, 'c d': 5 }), file()).join(' '), /count fell/);
});
