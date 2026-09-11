import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  formatYards,
  formatDelta,
  formatMargin,
  displayName,
  shortTeamName,
  guessMessage,
  pickConfirmation,
  SKIPPED_MESSAGE,
  autoSkipMessage,
  answeringMessage,
  resultLine,
  cleanName,
} from '../src/format.js';

const DATA = JSON.parse(
  readFileSync(new URL('../../data/nfl_qbs.json', import.meta.url), 'utf8'),
);
const EM_DASH = '\u2014';
const MINUS = '\u2212';
const DOT = '\u00b7';
const ARROW = '\u2192';

test('formatYards groups thousands', () => {
  assert.equal(formatYards(71940), '71,940');
  assert.equal(formatYards(1218941), '1,218,941');
  assert.equal(formatYards(0), '0');
});

test('formatDelta signs gains and losses and dashes a tie', () => {
  assert.equal(formatDelta(44175), '+44,175');
  assert.equal(formatDelta(-62792), `${MINUS}62,792`);
  assert.equal(formatDelta(0), EM_DASH);
});

test('formatMargin reads Even at zero', () => {
  assert.equal(formatMargin(14320), '+14,320');
  assert.equal(formatMargin(-2300), `${MINUS}2,300`);
  assert.equal(formatMargin(0), 'Even');
});

test('displayName restores conventional casing', () => {
  assert.equal(displayName('peyton manning'), 'Peyton Manning');
  assert.equal(displayName('a.j. mccarron'), 'A.J. McCarron');
  assert.equal(displayName('aidan o\'connell'), 'Aidan O\'Connell');
  assert.equal(displayName('d\'andre swift'), 'D\'Andre Swift');
  assert.equal(displayName('amon-ra st. brown'), 'Amon-Ra St. Brown');
  assert.equal(displayName('jaxon smith-njigba'), 'Jaxon Smith-Njigba');
  assert.equal(displayName('robert griffin iii'), 'Robert Griffin III');
  assert.equal(displayName('gardner minshew ii'), 'Gardner Minshew II');
});

test('displayName does not force a capital after Mac', () => {
  assert.equal(displayName('bill mackrides'), 'Bill Mackrides');
});

test('displayName only changes casing, never letters, for every dataset name', () => {
  for (const team of Object.values(DATA)) {
    for (const qb of Object.keys(team.qbs)) {
      assert.equal(displayName(qb).toLowerCase(), qb);
    }
  }
});

test('shortTeamName keeps the final word', () => {
  assert.equal(shortTeamName('Denver Broncos'), 'Broncos');
  assert.equal(shortTeamName('San Francisco 49ers'), '49ers');
});

test('guessMessage leads with the resolved name for a wrong team', () => {
  assert.equal(
    guessMessage({ status: 'wrong-team', qb: 'peyton manning' }, 'Cardinals'),
    'Peyton Manning. Not a Cardinals quarterback.',
  );
});

test('guessMessage uses "an" before a vowel', () => {
  assert.equal(
    guessMessage({ status: 'wrong-team', qb: 'tom brady' }, 'Eagles'),
    'Tom Brady. Not an Eagles quarterback.',
  );
  assert.equal(
    guessMessage({ status: 'wrong-team', qb: 'tom brady' }, '49ers'),
    'Tom Brady. Not a 49ers quarterback.',
  );
});

test('guessMessage covers used and unknown', () => {
  assert.equal(guessMessage({ status: 'used', qb: 'alex smith' }, '49ers'), 'Alex Smith. Already used.');
  assert.equal(guessMessage({ status: 'unknown', qb: null }, 'Broncos'), 'No one by that name.');
});

test('pickConfirmation echoes the typed text when it differs from the name', () => {
  assert.equal(pickConfirmation('smith', 'alex smith', 35650), `smith ${ARROW} Alex Smith ${DOT} +35,650`);
  assert.equal(pickConfirmation('  elwa ', 'john elway', 51475), `elwa ${ARROW} John Elway ${DOT} +51,475`);
});

test('pickConfirmation drops the echo when the full name was typed', () => {
  assert.equal(pickConfirmation('Peyton Manning', 'peyton manning', 71940), `Peyton Manning ${DOT} +71,940`);
  assert.equal(pickConfirmation('AJ McCarron', 'a.j. mccarron', 6799), `A.J. McCarron ${DOT} +6,799`);
});

test('fixed and templated status lines', () => {
  assert.equal(SKIPPED_MESSAGE, 'Skipped.');
  assert.equal(autoSkipMessage('Broncos'), 'No Broncos quarterbacks left.');
  assert.equal(answeringMessage('Bob'), 'Bob is answering\u2026');
});

test('resultLine describes the head-to-head outcome', () => {
  assert.equal(resultLine(1231400, 1218941, 'Bob'), 'You beat Bob by 12,459.');
  assert.equal(resultLine(1200000, 1202300, 'Carl'), 'Carl beat you by 2,300.');
  assert.equal(resultLine(1000, 1000, 'Sal'), 'Dead even with Sal.');
  assert.equal(resultLine(1000, null, null), null);
});

test('cleanName trims, collapses, caps length, and falls back', () => {
  assert.equal(cleanName('  Mike   P  '), 'Mike P');
  assert.equal(cleanName('abcdefghijklmnopqrstuvwxyz'), 'abcdefghijklmnopqrst');
  assert.equal(cleanName('abcdefghijklmnopqrs tuv'), 'abcdefghijklmnopqrs');
  assert.equal(cleanName('   '), 'Anonymous');
  assert.equal(cleanName(undefined), 'Anonymous');
});
