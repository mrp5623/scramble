import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEAMS, teamStyle } from '../src/teams.js';

const DATA = JSON.parse(
  readFileSync(new URL('../../data/nfl_qbs.json', import.meta.url), 'utf8'),
);

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('covers exactly the franchises in the dataset', () => {
  assert.deepEqual(Object.keys(TEAMS).sort(), Object.keys(DATA).sort());
});

test('every colour is a six-digit uppercase hex', () => {
  for (const [code, team] of Object.entries(TEAMS)) {
    assert.match(team.primary, /^#[0-9A-F]{6}$/, `${code} primary`);
    assert.match(team.accent, /^#[0-9A-F]{6}$/, `${code} accent`);
  }
});

test('abbreviations are unique', () => {
  const abbrs = Object.values(TEAMS).map((t) => t.abbr);
  assert.equal(new Set(abbrs).size, abbrs.length);
});

test('shows familiar abbreviations where the dataset code differs', () => {
  const expected = {
    clt: 'IND', crd: 'ARI', sdg: 'LAC', oti: 'TEN', htx: 'HOU', rai: 'LV', ram: 'LAR',
    rav: 'BAL', gnb: 'GB', kan: 'KC', nor: 'NO', nwe: 'NE', sfo: 'SF', tam: 'TB',
  };
  for (const [code, abbr] of Object.entries(expected)) assert.equal(TEAMS[code].abbr, abbr);
});

test('white team names reach large-text contrast on every primary but the Saints', () => {
  for (const [code, team] of Object.entries(TEAMS)) {
    if (code === 'nor') continue;
    const ratio = contrast(team.primary, '#FFFFFF');
    assert.ok(ratio >= 3, `${code} is ${ratio.toFixed(2)}:1`);
  }
});

test('the Saints remain the one deliberate contrast exception', () => {
  // Owner decision recorded in PRODUCT.md and the game screen brief. If this starts
  // failing because the colour changed, update both documents rather than the test.
  assert.ok(contrast(TEAMS.nor.primary, '#FFFFFF') < 3);
});

test('teamStyle returns the entry and rejects unknown codes', () => {
  assert.equal(teamStyle('den').abbr, 'DEN');
  assert.throws(() => teamStyle('xyz'), /No presentation data/);
});
