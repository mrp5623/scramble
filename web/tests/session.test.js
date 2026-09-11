import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRoster } from '../src/roster.js';
import { createSession } from '../src/session.js';
import { POLICIES } from '../src/policies/index.js';
import { TINY_DATA } from './fixtures/tiny-roster.js';

const DATA = JSON.parse(
  readFileSync(new URL('../../data/nfl_qbs.json', import.meta.url), 'utf8'),
);
const ROSTER = buildRoster(DATA);
const TINY = buildRoster(TINY_DATA);

test('a classic session carries no opponent state', () => {
  const s = createSession({ roster: ROSTER, teamSequence: ['den'] });
  assert.equal(s.opponent, null);
  assert.equal(s.botScore, null);
  assert.equal(s.margin, null);
  assert.equal(s.currentTeam, 'den');
  assert.equal(s.round, 1);
  assert.equal(s.rounds, 1);
});

test('a matched answer ends the turn and records the round', () => {
  const s = createSession({ roster: ROSTER, teamSequence: ['den', 'crd'] });
  const result = s.submit('peyton manning');
  assert.equal(result.kind, 'accepted');
  assert.equal(result.qb, 'peyton manning');
  assert.equal(result.yards, 71940);
  assert.deepEqual(result.row, {
    round: 1, team: 'den', youPick: 'peyton manning', youYards: 71940,
    botPick: null, botYards: null, delta: null,
  });
  assert.equal(s.youScore, 71940);
  assert.equal(s.round, 2);
  assert.equal(s.currentTeam, 'crd');
});

test('a rejected guess changes nothing, so the player can try again', () => {
  const s = createSession({ roster: ROSTER, teamSequence: ['den'] });
  assert.deepEqual(s.submit('zzzqqqxyz'), { kind: 'rejected', status: 'unknown', qb: null });
  assert.equal(s.round, 1);
  assert.equal(s.youScore, 0);
  assert.equal(s.ledger.length, 0);
});

test('a rejection reports who the input resolved to', () => {
  const s = createSession({ roster: ROSTER, teamSequence: ['crd'] });
  assert.deepEqual(s.submit('Peyton Manning'), {
    kind: 'rejected', status: 'wrong-team', qb: 'peyton manning',
  });
});

test('the opponent answers only after the player ends a turn', () => {
  const s = createSession({ roster: ROSTER, opponent: POLICIES.bob, teamSequence: ['den', 'den'] });
  s.submit('zzzqqqxyz');
  assert.equal(s.botScore, 0);

  const { row } = s.submit('john elway');
  assert.equal(row.youYards, 51475);
  assert.equal(row.botPick, 'peyton manning');
  assert.equal(row.botYards, 71940);
  assert.equal(row.delta, 51475 - 71940);
  assert.equal(s.margin, 51475 - 71940);
});

test('player and opponent draw from independent pools', () => {
  const s = createSession({ roster: ROSTER, opponent: POLICIES.bob, teamSequence: ['den', 'den'] });
  const first = s.submit('peyton manning').row;
  assert.equal(first.botPick, 'peyton manning');
  assert.equal(first.delta, 0);

  const second = s.skip().row;
  assert.equal(second.botPick, 'john elway');
});

test('skipping ends the turn with no yards, and the opponent still answers', () => {
  const s = createSession({ roster: ROSTER, opponent: POLICIES.bob, teamSequence: ['den'] });
  const result = s.skip();
  assert.equal(result.kind, 'skipped');
  assert.equal(result.row.youPick, null);
  assert.equal(result.row.youYards, 0);
  assert.equal(result.row.botPick, 'peyton manning');
});

test('the ledger lists rounds newest first', () => {
  const s = createSession({ roster: ROSTER, teamSequence: ['den', 'crd', 'gnb'] });
  s.skip();
  s.skip();
  s.skip();
  assert.deepEqual(s.ledger.map((r) => r.round), [3, 2, 1]);
  assert.deepEqual(s.ledger.map((r) => r.team), ['gnb', 'crd', 'den']);
});

test('the session finishes after the last round and ignores further input', () => {
  const s = createSession({ roster: ROSTER, teamSequence: ['den'] });
  s.skip();
  assert.equal(s.done, true);
  assert.equal(s.currentTeam, null);
  assert.equal(s.round, 1);
  assert.deepEqual(s.submit('john elway'), { kind: 'ignored' });
  assert.deepEqual(s.skip(), { kind: 'ignored' });
  assert.equal(s.ledger.length, 1);
});

test('a seeded session plays 25 rounds and replays identically', () => {
  const teamsFor = (seed) => {
    const s = createSession({ roster: ROSTER, seed });
    const teams = [];
    while (!s.done) {
      teams.push(s.currentTeam);
      s.skip();
    }
    return teams;
  };
  const a = teamsFor(42);
  assert.equal(a.length, 25);
  assert.deepEqual(a, teamsFor(42));
  assert.equal(createSession({ roster: ROSTER, seed: 42 }).seed, 42);
});

test('stuck is true only while the current team has no quarterbacks left', () => {
  const s = createSession({ roster: TINY, teamSequence: ['aaa', 'aaa', 'aaa'] });
  assert.equal(s.stuck, false);
  s.submit('alpha qb');
  s.submit('beta qb');
  assert.equal(s.stuck, true);
  s.skip();
  assert.equal(s.done, true);
  assert.equal(s.stuck, false);
});

test('an opponent that is not ready cannot start a session', () => {
  const notReady = { name: 'Sal', ready: false, pick: () => null };
  assert.throws(
    () => createSession({ roster: ROSTER, opponent: notReady, seed: 1 }),
    /Sal is not ready/,
  );
});

test('replaying a seed replays the opponent, including Carl\'s sampled futures', () => {
  const botPicksFor = () => {
    const s = createSession({ roster: ROSTER, opponent: POLICIES.carl, seed: 7 });
    while (!s.done) s.skip();
    return s.ledger.map((r) => r.botPick);
  };
  assert.deepEqual(botPicksFor(), botPicksFor());
});
