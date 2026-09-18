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

test("today's top score is fetched without blocking the menu", () => {
  // No await on this call: the menu must render before the network answers.
  assert.doesNotMatch(SOURCE, /await topScores\(\{ day: todayKey\(\), limit: 1 \}\)/);
  assert.match(SOURCE, /topScores\(\{ day: todayKey\(\), limit: 1 \}\)\s*\n?\s*\.then/);
});

test('finishing the daily spends the attempt, even if the score is never saved', () => {
  // writeDaily must run at game over, not only inside the save handler. Otherwise a
  // player replays the daily until they like the score and submits only that one --
  // the database's unique index blocks a second row, not a second attempt.
  const atGameOver = SOURCE.indexOf('if (day) writeDaily(');
  const atSaveForm = SOURCE.indexOf("$('save-form').addEventListener");
  assert.ok(atGameOver > -1, 'writeDaily called at game over');
  assert.ok(atSaveForm > -1);
  assert.ok(atGameOver < atSaveForm, 'the attempt is recorded before the save handler');
});

test('a spent daily cannot be restarted from any entry point', () => {
  // The menu hides a spent daily, but Play again called startGame directly and
  // handed out a second attempt on the same seed. The guard belongs in startGame,
  // where every entry point has to pass through it.
  const start = SOURCE.indexOf('function startGame(');
  assert.ok(start > -1);
  const body = SOURCE.slice(start, SOURCE.indexOf('\n}', start));
  assert.match(body, /if \(daily && dailyState\(\)\.played\)/);
});

test('the scoreboard button opens the board screen', () => {
  assert.match(SOURCE, /\$\('scoreboard'\)\?\.addEventListener/);
  assert.ok(SOURCE.includes('renderScoreboardScreen'));
  assert.ok(!SOURCE.includes('renderDailyBoard'));
});

test('the suggestion list is cleared whenever a round ends', () => {
  // A list left over from the previous team would offer the wrong quarterbacks.
  assert.ok(SOURCE.includes('clearSuggestions()'));
  assert.match(SOURCE, /function renderRound[\s\S]*?clearSuggestions\(\)/);
});

test('selecting a suggestion goes through the normal submit path', () => {
  // Not a private shortcut: the pick must produce the same confirmation, score and
  // ledger row as typing the name out.
  assert.match(SOURCE, /\$\('answer'\)\.value = qb;\s*\n?\s*submitAnswer\(\)/);
});

test('the typeahead keys are handled without breaking skip', () => {
  assert.ok(SOURCE.includes("event.key === 'ArrowDown'"));
  assert.ok(SOURCE.includes("event.key === 'ArrowUp'"));
  assert.ok(SOURCE.includes("event.key === 'Escape'"));
  assert.match(SOURCE, /event\.key === 'Enter' && event\.shiftKey/);
});

test('each new round announces its team in the live region', () => {
  assert.match(
    SOURCE,
    /setMessage\(`\$\{confirmation\} \$\{MIDDLE_DOT\} \$\{teamShort\(session\.currentTeam\)\}`\)/,
  );
});
