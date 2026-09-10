import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRoster } from '../src/roster.js';

const DATA = JSON.parse(
  readFileSync(new URL('../../data/nfl_qbs.json', import.meta.url), 'utf8'),
);

test('indexes all 32 franchises with codes sorted', () => {
  const r = buildRoster(DATA);
  assert.equal(r.teamCodes.length, 32);
  assert.deepEqual(r.teamCodes, [...r.teamCodes].sort());
});

test('yardScale is the dataset maximum', () => {
  const r = buildRoster(DATA);
  assert.equal(r.yardScale, 89214);
  assert.equal(r.qbYards['tom brady'], 89214);
});

test('team QBs are sorted by yards desc, ties broken by name asc', () => {
  const r = buildRoster(DATA);
  for (const code of r.teamCodes) {
    const list = r.teamQbs[code];
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      const dy = r.qbYards[prev] - r.qbYards[cur];
      assert.ok(dy >= 0, `${code}: ${prev} before ${cur} but has fewer yards`);
      if (dy === 0) {
        assert.ok(prev < cur, `${code}: tie ${prev}/${cur} not in name order`);
      }
    }
  }
});

test('the best QB for a team is element 0', () => {
  const r = buildRoster(DATA);
  assert.equal(r.teamQbs.den[0], 'peyton manning');
  assert.equal(r.teamQbs.crd[0], 'carson palmer');
});

test('a multi-franchise QB maps to every franchise he played for', () => {
  const r = buildRoster(DATA);
  assert.deepEqual(
    [...r.qbTeams.get('brett favre')].sort(),
    ['atl', 'gnb', 'min', 'nyj'],
  );
});

test('display names are captured', () => {
  const r = buildRoster(DATA);
  assert.equal(r.teamNames.den, 'Denver Broncos');
});
