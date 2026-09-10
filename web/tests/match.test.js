import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRoster } from '../src/roster.js';
import { createGame } from '../src/engine.js';
import { normalize, levenshtein, resolveAnswer } from '../src/match.js';

const DATA = JSON.parse(
  readFileSync(new URL('../../data/nfl_qbs.json', import.meta.url), 'utf8'),
);
const ROSTER = buildRoster(DATA);

const game = (seq) => createGame({ roster: ROSTER, teamSequence: seq });

test('normalize strips case, punctuation, and suffixes', () => {
  assert.equal(normalize('  Peyton   Manning '), 'peyton manning');
  assert.equal(normalize('A.J. McCarron'), 'aj mccarron');
  assert.equal(normalize("Ken O'Brien"), 'ken obrien');
  assert.equal(normalize('Robert Griffin III'), 'robert griffin');
  assert.equal(normalize('Ed Jones Jr.'), 'ed jones');
});

test('normalize keeps a bare suffix that is the whole input', () => {
  assert.equal(normalize('V'), 'v');
});

test('levenshtein counts single edits', () => {
  assert.equal(levenshtein('manning', 'manning'), 0);
  assert.equal(levenshtein('maning', 'manning'), 1);
  assert.equal(levenshtein('', 'abc'), 3);
});

test('an exact full name resolves to that QB', () => {
  const g = game(['den']);
  assert.deepEqual(resolveAnswer(g, 'Peyton Manning'), {
    status: 'ok',
    qb: 'peyton manning',
    yards: 71940,
  });
});

test('an ambiguous last name resolves to the best available match', () => {
  const g = game(['sfo']);
  assert.deepEqual(resolveAnswer(g, 'smith'), {
    status: 'ok',
    qb: 'alex smith',
    yards: 35650,
  });
});

test('an ambiguous last name falls through when the best is used', () => {
  const g = game(['sfo', 'sfo']);
  g.step('alex smith');
  assert.equal(resolveAnswer(g, 'smith').qb, 'troy smith');
});

test('an exact full name overrides the best-match rule', () => {
  // This is what lets a player deliberately spend the lesser QB to save the star.
  const g = game(['sfo']);
  assert.equal(resolveAnswer(g, 'troy smith').qb, 'troy smith');
});

test('a typo still resolves', () => {
  const g = game(['den']);
  // 'peyton maning' is 1 edit from the full name (length 13 -> threshold 2)
  assert.equal(resolveAnswer(g, 'peyton maning').qb, 'peyton manning');
  // 'elwa' is 1 edit from the last name (length 4 -> threshold 1)
  assert.equal(resolveAnswer(g, 'elwa').qb, 'john elway');
});

test('a typo beyond the threshold is not force-matched', () => {
  // 'elwya' is 2 edits from 'elway' but only 5 characters, so the threshold is 1.
  // Silently accepting this would mean guessing on the player's behalf.
  const g = game(['den']);
  assert.equal(resolveAnswer(g, 'elwya').status, 'unknown');
});

test('an already-used QB reports used, not wrong-team', () => {
  const g = game(['den', 'den']);
  g.step('peyton manning');
  assert.deepEqual(resolveAnswer(g, 'Peyton Manning'), {
    status: 'used',
    qb: 'peyton manning',
  });
});

test('a real QB who never played for this team reports wrong-team', () => {
  const g = game(['crd']);
  assert.deepEqual(resolveAnswer(g, 'Peyton Manning'), {
    status: 'wrong-team',
    qb: 'peyton manning',
  });
});

test('a last-name-only miss reports wrong-team for the highest-yardage namesake', () => {
  // Several Palmers played in the league (Carson, Jordan, Paul, Jesse), none for
  // Denver. The fallback must pick Carson (46,247 yards), not whichever indexes first.
  const g = game(['den']);
  assert.deepEqual(resolveAnswer(g, 'palmer'), {
    status: 'wrong-team',
    qb: 'carson palmer',
  });
});

test('nonsense reports unknown', () => {
  const g = game(['den']);
  assert.deepEqual(resolveAnswer(g, 'zzzqqqxyz'), { status: 'unknown' });
  assert.deepEqual(resolveAnswer(g, '   '), { status: 'unknown' });
});
