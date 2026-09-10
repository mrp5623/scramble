import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRoster } from '../src/roster.js';
import { createGame } from '../src/engine.js';
import { createAgent, agentPick } from '../src/policies/agent.js';
import { N_ACTIONS } from '../src/policies/features.js';

const DATA = JSON.parse(
  readFileSync(new URL('../../data/nfl_qbs.json', import.meta.url), 'utf8'),
);
const WEIGHTS = JSON.parse(
  readFileSync(new URL('../weights/sal.json', import.meta.url), 'utf8'),
);
const ROSTER = buildRoster(DATA);
const AGENT = createAgent(WEIGHTS);

test('the exported blob has the expected shapes and no value head', () => {
  assert.equal(WEIGHTS.obs_dim, 11);
  assert.equal(WEIGHTS.hidden, 64);
  assert.equal(WEIGHTS.n_actions, 4);
  assert.equal(WEIGHTS.params['trunk.0.weight'].length, 64);
  assert.equal(WEIGHTS.params['trunk.0.weight'][0].length, 11);
  assert.equal(WEIGHTS.params['policy_head.weight'].length, 4);
  assert.ok(!('value_head.weight' in WEIGHTS.params));
});

test('createAgent rejects a blob with the wrong observation size', () => {
  assert.throws(
    () => createAgent({ ...WEIGHTS, obs_dim: 14 }),
    /obs_dim/,
  );
});

test('forward returns one finite logit per action', () => {
  const logits = AGENT.forward(new Array(11).fill(0.1));
  assert.equal(logits.length, N_ACTIONS);
  for (const v of logits) assert.ok(Number.isFinite(v));
});

test('is deterministic: the same state always yields the same pick', () => {
  const a = createGame({ roster: ROSTER, teamSequence: ['den', 'crd'] });
  const b = createGame({ roster: ROSTER, teamSequence: ['den', 'crd'] });
  assert.equal(agentPick(a, AGENT), agentPick(b, AGENT));
});

test('only ever picks an available QB or skips', () => {
  const g = createGame({ roster: ROSTER, seed: 4242 });
  while (!g.done) {
    const avail = g.available();
    const pick = agentPick(g, AGENT);
    if (pick !== null) assert.ok(avail.slice(0, 3).includes(pick));
    g.step(pick);
  }
  assert.equal(g.turn, 25);
});

test('returns null when nothing is available', () => {
  const g = createGame({ roster: ROSTER, teamSequence: ['den'] });
  for (const q of ROSTER.teamQbs.den) g.used.add(q);
  assert.equal(agentPick(g, AGENT), null);
});

test('plays a full game without reusing a QB', () => {
  const g = createGame({ roster: ROSTER, seed: 8 });
  const picked = [];
  while (!g.done) {
    const p = agentPick(g, AGENT);
    if (p) picked.push(p);
    g.step(p);
  }
  assert.ok(g.totalScore > 0);
  assert.equal(new Set(picked).size, picked.length);
});
