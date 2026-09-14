import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('main.js imports cleanly without a DOM, so every name it imports resolves', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  await assert.doesNotReject(import('../src/main.js'));
});

test('main.js loads its data from relative paths', () => {
  assert.ok(SOURCE.includes("fetchRoster('data/nfl_qbs.json')"));
  assert.ok(SOURCE.includes("loadAgent('weights/sal.json')"));
  assert.doesNotMatch(SOURCE, /(fetchRoster|loadAgent)\('\//);
});

test('player-facing messages are written as text, never parsed as HTML', () => {
  assert.ok(SOURCE.includes("$('message').textContent = "));
  assert.doesNotMatch(SOURCE, /\$\('message'\)\.innerHTML/);
});

test('the busy guard runs before the session is asked to do anything', () => {
  assert.match(SOURCE, /function submitAnswer\(\) \{\s*if \(busy\) return;/);
  assert.match(SOURCE, /function skipRound\(\) \{\s*if \(busy\) return;/);
});
