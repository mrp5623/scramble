import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoster } from '../src/roster.js';
import { createGame } from '../src/engine.js';
import {
  appearanceProb,
  relevances,
  saveValue,
  buildObservation,
  legalMask,
  N_ACTIONS,
} from '../src/policies/features.js';
import { TINY_DATA } from './fixtures/tiny-roster.js';

const TINY = buildRoster(TINY_DATA);

function tinyGame(sequence) {
  return createGame({ roster: TINY, teamSequence: sequence });
}

test('appearanceProb is zero on the final turn', () => {
  const g = tinyGame(['aaa']);
  // k = 1  ->  1 - (1/2)^0 = 0
  assert.equal(appearanceProb(g), 0);
});

test('appearanceProb with two turns left and two teams is 1/2', () => {
  const g = tinyGame(['aaa', 'bbb']);
  // k = 2  ->  1 - (1/2)^1 = 0.5
  assert.equal(appearanceProb(g), 0.5);
});

test('relevances measures the drop-off at the other franchise', () => {
  const g = tinyGame(['aaa', 'bbb']);
  // alpha (100) also plays for bbb, whose best alternative is gamma (40) -> 60
  assert.deepEqual(relevances(g, 'alpha qb'), [60]);
  // beta only plays for aaa, so there is nowhere to save him for
  assert.deepEqual(relevances(g, 'beta qb'), []);
});

test('relevances shrinks as the alternative pool is consumed', () => {
  const g = tinyGame(['bbb', 'aaa', 'aaa']);
  g.step('gamma qb'); // now bbb has no alternative to alpha
  assert.deepEqual(relevances(g, 'alpha qb'), [100]);
});

test('saveValue is appearanceProb times the largest relevance', () => {
  const g = tinyGame(['aaa', 'bbb']);
  assert.equal(saveValue(g, 'alpha qb'), 0.5 * 60);
  assert.equal(saveValue(g, 'beta qb'), 0);
});

test('buildObservation produces the 11-dim shuffled layout', () => {
  const g = tinyGame(['aaa', 'bbb']);
  const order = g.available(); // ['alpha qb', 'beta qb']
  const obs = buildObservation(g, order);
  assert.equal(obs.length, 11);
  assert.deepEqual(obs, [
    1.0, 0.3, 0.25,   // alpha: 100/100, (0.5*60)/100, 1 relevance / 4
    0.6, 0.0, 0.0,    // beta:  60/100,  no save value, no relevances
    0.0, 0.0, 0.0,    // empty third slot
    1.0,              // turnsRemaining 2 / rounds 2
    0.5,              // appearance probability
  ]);
});

test('buildObservation respects the given slot order', () => {
  const g = tinyGame(['aaa', 'bbb']);
  const obs = buildObservation(g, ['beta qb', 'alpha qb']);
  assert.equal(obs[0], 0.6);
  assert.equal(obs[3], 1.0);
});

test('legalMask marks one slot per candidate and always allows skip', () => {
  assert.deepEqual(legalMask(['a', 'b']), [true, true, false, true]);
  assert.deepEqual(legalMask([]), [false, false, false, true]);
  assert.equal(legalMask(['a']).length, N_ACTIONS);
});
