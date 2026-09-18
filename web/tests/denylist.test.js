import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedName } from '../src/denylist.js';

test('blocks an exact match', () => {
  assert.equal(isBlockedName('FUCK'), true);
  assert.equal(isBlockedName('NAZI'), true);
  assert.equal(isBlockedName('ASS'), true);
});

test('blocks a slur embedded in a longer name', () => {
  assert.equal(isBlockedName('BIGFUCKER'), true);
  assert.equal(isBlockedName('XXFAGGOTXX'), true);
});

// The regression that matters. A substring rule that rejects real surnames is worse
// than no rule: it tells a real person their name is obscene. Every name below is a
// genuine surname or place name containing a banned substring.
test('legitimate names containing awkward substrings are accepted', () => {
  for (const name of [
    'SCUNTHORPE', // cunt
    'HANCOCK', // cock
    'COCKBURN', // cock
    'DICKINSON', // dick
    'ASSANGE', // ass
    'CUMMINGS', // cum
    'TITSWORTH', // tit
    'DRAPER', // rape
    'CANALE', // anal
    'SHITTU', // shit
    'MIKE',
    'MICHAELPRIOR',
  ]) {
    assert.equal(isBlockedName(name), false, name);
  }
});

test('matching ignores case, and junk input is not blocked', () => {
  assert.equal(isBlockedName('fuck'), true);
  assert.equal(isBlockedName(''), false);
  assert.equal(isBlockedName(undefined), false);
  assert.equal(isBlockedName(null), false);
});
