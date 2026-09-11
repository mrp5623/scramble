import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderLedger } from '../src/ui/ledger.js';

const EM_DASH = '\u2014';
const MINUS = '\u2212';
const DELTA = '\u0394';

const VS_ROWS = [
  { round: 3, team: 'clt', youPick: null, youYards: 0, botPick: 'peyton manning', botYards: 71940, delta: -71940 },
  { round: 2, team: 'gnb', youPick: 'aaron rodgers', youYards: 65980, botPick: 'aaron rodgers', botYards: 65980, delta: 0 },
  { round: 1, team: 'den', youPick: 'peyton manning', youYards: 71940, botPick: 'john elway', botYards: 51475, delta: 20465 },
];

const CLASSIC_ROWS = VS_ROWS.map((r) => ({ ...r, botPick: null, botYards: null, delta: null }));

const count = (html, needle) => html.split(needle).length - 1;

test('an empty ledger says so', () => {
  assert.equal(renderLedger({ rows: [] }), '<p class="ledger-empty">No rounds yet.</p>');
});

test('a classic ledger has three columns and no margin', () => {
  const html = renderLedger({ rows: CLASSIC_ROWS });
  assert.equal(count(html, 'role="columnheader"'), 3);
  assert.ok(!html.includes(DELTA));
  assert.ok(!html.includes('c-delta'));
});

test('a vs ledger adds the opponent and margin columns', () => {
  const html = renderLedger({ rows: VS_ROWS, opponentName: 'Bob' });
  assert.equal(count(html, 'role="columnheader"'), 5);
  assert.ok(html.includes('>Bob</th>'));
  assert.ok(html.includes(`aria-label="Margin">${DELTA}</th>`));
  assert.ok(html.includes('aria-label="Round">#</th>'));
});

test('rows keep the newest-first order they are given', () => {
  const html = renderLedger({ rows: VS_ROWS, opponentName: 'Bob' });
  assert.ok(html.indexOf('>IND<') < html.indexOf('>GB<'));
  assert.ok(html.indexOf('>GB<') < html.indexOf('>DEN<'));
});

test('teams show familiar abbreviations and picks show proper names', () => {
  const html = renderLedger({ rows: VS_ROWS, opponentName: 'Bob' });
  assert.ok(html.includes('>IND<'));
  assert.ok(html.includes('Peyton Manning'));
  assert.ok(html.includes('71,940'));
});

test('a skipped pick reads Skipped', () => {
  assert.ok(renderLedger({ rows: VS_ROWS, opponentName: 'Bob' }).includes('Skipped'));
});

test('margins are signed and carry an outcome state', () => {
  const html = renderLedger({ rows: VS_ROWS, opponentName: 'Bob' });
  assert.ok(html.includes('+20,465'));
  assert.ok(html.includes(`${MINUS}71,940`));
  assert.ok(html.includes(EM_DASH));
  assert.ok(html.includes('is-win'));
  assert.ok(html.includes('is-loss'));
  assert.ok(html.includes('is-even'));
});

test('cells carry captions for the stacked phone layout', () => {
  const html = renderLedger({ rows: VS_ROWS, opponentName: 'Bob' });
  assert.ok(html.includes('data-label="You"'));
  assert.ok(html.includes('data-label="Bob"'));
  assert.ok(html.includes('data-label="Margin"'));
});

test('only the newest round is highlighted', () => {
  const html = renderLedger({ rows: VS_ROWS, opponentName: 'Bob', newestRound: 3 });
  assert.equal(count(html, 'is-new'), 1);
  assert.equal(count(renderLedger({ rows: VS_ROWS, opponentName: 'Bob' }), 'is-new'), 0);
});

test('table semantics survive a CSS display change', () => {
  const html = renderLedger({ rows: VS_ROWS, opponentName: 'Bob' });
  assert.ok(html.includes('role="table"'));
  assert.equal(count(html, 'role="row"'), 4);
  assert.equal(count(html, 'role="cell"'), 15);
});

test('the opponent name is escaped', () => {
  const html = renderLedger({ rows: VS_ROWS, opponentName: '<b>Bob</b>' });
  assert.ok(html.includes('&lt;b&gt;Bob&lt;/b&gt;'));
  assert.ok(!html.includes('<b>Bob</b>'));
});
