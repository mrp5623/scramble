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

test('the opponent beat never disables the answer input', () => {
  // Disabling the focused input blurs it, which dismisses the soft keyboard on iOS.
  const setBusy = SOURCE.match(/function setBusy\([\s\S]*?\n\}/);
  assert.ok(setBusy, 'setBusy present');
  assert.match(setBusy[0], /if \(control !== input\) control\.disabled = value;/);
});

test("the daily's seed is derived once at game start, never re-read mid-game", () => {
  // Re-reading todayKey() during play would change the puzzle under a player at
  // midnight. startGame captures it; nothing else calls seedForDay.
  assert.equal((SOURCE.match(/seedForDay\(/g) ?? []).length, 1);
  assert.match(SOURCE, /dailyDay = daily \? todayKey\(\) : null/);
});

test('a rejected name never reaches the network', () => {
  // The denylist check must run before saveScore, not after.
  const blockedAt = SOURCE.indexOf('isBlockedName(');
  const saveAt = SOURCE.indexOf('await saveScore(');
  assert.ok(blockedAt > -1 && saveAt > -1);
  assert.ok(blockedAt < saveAt, 'denylist is checked before saving');
});

test('each new round announces its team in the live region', () => {
  assert.match(
    SOURCE,
    /setMessage\(`\$\{confirmation\} \$\{MIDDLE_DOT\} \$\{teamShort\(session\.currentTeam\)\}`\)/,
  );
});
