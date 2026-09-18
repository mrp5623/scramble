import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  modeOptions,
  renderModeSelect,
  renderGameShell,
  renderGameOver,
  renderLeaderboard,
  renderScoreboardScreen,
  renderScoreboardButton,
} from '../src/ui/screens.js';

const FAKE_POLICIES = {
  bob: { id: 'bob', name: 'Bob', fullName: 'Best Option Bot', ready: true },
  sal: { id: 'sal', name: 'Sal', fullName: 'Saving Artificial Learner', ready: false },
};

// A separate fixture: FAKE_POLICIES is indexed positionally by the loading/failed
// tests above and must keep exactly two entries.
const ORDERED_POLICIES = {
  bob: { id: 'bob', name: 'Bob', fullName: 'Greedy Bot', ready: true },
  sal: { id: 'sal', name: 'Sal', fullName: 'Trained Reinforcement Learning Agent', ready: true },
  carl: { id: 'carl', name: 'Carl', fullName: 'Monte Carlo rollout', ready: true },
};

const count = (html, needle) => html.split(needle).length - 1;

test('the menu leads with the daily, then Classic, then the bots in registry order', () => {
  const options = modeOptions(ORDERED_POLICIES, { daily: { played: false, score: null } });
  assert.deepEqual(
    options.map((o) => o.id),
    ['daily', 'classic', 'bob', 'sal', 'carl'],
  );
  assert.equal(options[0].label, 'Daily Special');
});

test('without daily state the menu is unchanged', () => {
  const options = modeOptions(ORDERED_POLICIES);
  assert.deepEqual(
    options.map((o) => o.id),
    ['classic', 'bob', 'sal', 'carl'],
  );
});

test('an unplayed daily explains itself; a played one shows the score', () => {
  const fresh = modeOptions(ORDERED_POLICIES, { daily: { played: false, score: null } })[0];
  assert.equal(fresh.fullName, 'One game a day, same teams for everyone');

  const done = modeOptions(ORDERED_POLICIES, { daily: { played: true, score: 1231400 } })[0];
  assert.equal(done.fullName, 'Today: 1,231,400');
  assert.equal(done.status, 'ready', 'a played daily stays clickable so the board can be read');
});

test('modeOptions lists Classic first, then one option per opponent', () => {
  const options = modeOptions(FAKE_POLICIES);
  assert.deepEqual(options.map((o) => o.id), ['classic', 'bob', 'sal']);
  assert.equal(options[0].label, 'Classic');
  assert.equal(options[0].status, 'ready');
  assert.equal(options[1].label, 'vs Bob');
  assert.equal(options[1].fullName, 'Best Option Bot');
});

test('modeOptions marks an unready opponent as loading, or failed', () => {
  assert.equal(modeOptions(FAKE_POLICIES)[2].status, 'loading');
  assert.equal(modeOptions(FAKE_POLICIES, { failedIds: ['sal'] })[2].status, 'failed');
  assert.equal(modeOptions(FAKE_POLICIES, { failedIds: ['sal'] })[1].status, 'ready');
});

test('mode select renders a button per option under the wordmark', () => {
  const html = renderModeSelect(modeOptions(FAKE_POLICIES));
  assert.ok(html.includes('<h1 id="wordmark" class="wordmark">Scramble</h1>'));
  assert.equal(count(html, '<button type="button" class="mode"'), 3);
  assert.ok(html.includes('data-mode="classic"'));
  assert.ok(html.includes('data-mode="bob"'));
});

test('an unready opponent is disabled and says why', () => {
  const loading = renderModeSelect(modeOptions(FAKE_POLICIES));
  assert.equal(count(loading, ' disabled'), 1);
  assert.ok(loading.includes('aria-describedby="mode-sal-status"'));
  assert.ok(loading.includes('Loading\u2026'));

  const failed = renderModeSelect(modeOptions(FAKE_POLICIES, { failedIds: ['sal'] }));
  assert.ok(failed.includes('Unavailable right now.'));
});

test('mode select escapes registry text', () => {
  const html = renderModeSelect([
    { id: 'x', label: '<i>', fullName: 'a & b', status: 'ready' },
  ]);
  assert.ok(html.includes('&lt;i&gt;'));
  assert.ok(html.includes('a &amp; b'));
  assert.ok(!html.includes('<i>'));
});

test('the scoreboard shows dashes when nobody has played today', () => {
  const html = renderScoreboardButton({ topScore: null });
  assert.ok(html.includes('id="scoreboard"'));
  assert.ok(html.includes('–––'));
  assert.ok(html.includes('aria-label="Scoreboard, no scores yet today"'));
});

test("the scoreboard shows today's leading score", () => {
  const html = renderScoreboardButton({ topScore: 1183984 });
  assert.ok(html.includes('1,183,984'));
  assert.ok(html.includes('today&#39;s best 1,183,984'));
});

test('the scoreboard names itself on its own nameplate', () => {
  const html = renderScoreboardButton({ topScore: 5 });
  assert.ok(html.includes('class="scoreboard-label"'));
  assert.ok(html.includes('>Scoreboard<'));
  // The digits come first; the nameplate sits beneath them.
  assert.ok(html.indexOf('scoreboard-digits') < html.indexOf('scoreboard-label'));
});

test('the digits are hidden from screen readers, which read the label instead', () => {
  const html = renderScoreboardButton({ topScore: 1183984 });
  assert.ok(html.includes('aria-hidden="true"'));
  // The number appears once for sighted users and once inside the label.
  assert.equal(html.split('1,183,984').length - 1, 2);
});

test('mode select carries the scoreboard inside the masthead', () => {
  const html = renderModeSelect(modeOptions(ORDERED_POLICIES), { topScore: 500 });
  assert.ok(html.includes('id="scoreboard"'));
  assert.ok(html.indexOf('id="scoreboard"') < html.indexOf('class="lede"'));
  assert.ok(html.indexOf('id="wordmark"') < html.indexOf('id="scoreboard"'));
});

test('mode select still renders without a score', () => {
  const html = renderModeSelect(modeOptions(ORDERED_POLICIES));
  assert.ok(html.includes('–––'));
});

test('the game shell holds every region main.js fills', () => {
  const html = renderGameShell();
  for (const id of ['scoreboard', 'answer-form', 'answer', 'skip', 'message', 'ledger']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
});

test('the game shell wires the input as a combobox over the suggestion list', () => {
  const html = renderGameShell();
  assert.ok(html.includes('id="suggest"'));
  assert.ok(html.includes('role="combobox"'));
  assert.ok(html.includes('aria-autocomplete="list"'));
  assert.ok(html.includes('aria-expanded="false"'));
  assert.ok(html.includes('aria-controls="suggest-list"'));
});

test('the answer input is labelled and the skip shortcut is shown', () => {
  const html = renderGameShell();
  assert.ok(html.includes('<label class="visually-hidden" for="answer">'));
  assert.ok(html.includes('<kbd class="hint">Shift+Enter</kbd>'));
});

test('the message region is announced politely', () => {
  assert.ok(renderGameShell().includes('id="message" class="message" role="status" aria-live="polite"'));
});

test('game over leads with the verdict and embeds the score row and ledger', () => {
  const html = renderGameOver({
    modeLabel: 'vs Bob',
    resultText: 'You beat Bob by 12,459.',
    scoresHtml: '<dl class="scores">SCORES</dl>',
    ledgerHtml: '<table class="ledger">LEDGER</table>',
    seed: 42,
  });
  assert.ok(html.includes('<h1 class="final-result">You beat Bob by 12,459.</h1>'));
  assert.ok(html.includes('<dl class="scores">SCORES</dl>'));
  assert.ok(html.includes('<table class="ledger">LEDGER</table>'));
  assert.ok(html.includes('Seed 42'));
});

test('game over in Classic has no verdict to give', () => {
  const html = renderGameOver({ modeLabel: 'Classic', resultText: null, scoresHtml: '', ledgerHtml: '', seed: 1 });
  assert.ok(html.includes('<h1 class="final-result">Game over.</h1>'));
});

test('game over offers saving, the leaderboard, and a way onward', () => {
  const html = renderGameOver({ modeLabel: 'Classic', resultText: null, scoresHtml: '', ledgerHtml: '', seed: 1 });
  for (const id of ['save-form', 'player-name', 'save-error', 'leaderboard', 'play-again', 'change-mode']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
});

test('the name input matches the 12-letter rule and has somewhere to report errors', () => {
  const html = renderGameOver({ modeLabel: 'Classic', resultText: null, scoresHtml: '', ledgerHtml: '', seed: 1 });
  assert.ok(html.includes('maxlength="12"'));
  assert.ok(html.includes('autocapitalize="characters"'));
  assert.ok(html.includes('id="save-error"'));
  assert.ok(html.includes('role="alert"'));
  assert.ok(!html.includes('maxlength="20"'));
});

test('game over after the daily offers the scoreboard, not another attempt', () => {
  const daily = renderGameOver({
    modeLabel: 'Daily Special',
    resultText: null,
    scoresHtml: '',
    ledgerHtml: '',
    seed: 1,
    daily: true,
  });
  assert.ok(daily.includes('id="view-board"'));
  assert.ok(!daily.includes('id="play-again"'), 'one game a day means no replay button');

  const normal = renderGameOver({
    modeLabel: 'Classic',
    resultText: null,
    scoresHtml: '',
    ledgerHtml: '',
    seed: 1,
  });
  assert.ok(normal.includes('id="play-again"'));
  assert.ok(!normal.includes('id="view-board"'));
});

test('an empty leaderboard says so', () => {
  assert.ok(renderLeaderboard([]).includes('No scores saved yet.'));
});

test('the leaderboard ranks entries and highlights the row just saved', () => {
  const scores = [
    { id: 1, name: 'MIKE', score: 1231400 },
    { id: 2, name: '<ANN>', score: 1200000 },
  ];
  const html = renderLeaderboard(scores, { highlightId: 2 });
  assert.equal(count(html, 'class="board-row'), 2);
  assert.ok(html.includes('1,231,400'));
  assert.ok(html.includes('&lt;ANN&gt;'));
  assert.equal(count(html, 'is-you'), 1);
  assert.ok(html.indexOf('MIKE') < html.indexOf('&lt;ANN&gt;'));
});

test('the leaderboard highlights nothing without an id', () => {
  const html = renderLeaderboard([{ id: 1, name: 'MIKE', score: 5 }]);
  assert.equal(count(html, 'is-you'), 0);
});

test('a leaderboard can be titled, and defaults to Top scores', () => {
  assert.ok(renderLeaderboard([]).includes('Top scores'));
  assert.ok(renderLeaderboard([], { title: 'Today' }).includes('Today'));
  assert.ok(
    renderLeaderboard([{ id: 1, name: 'MIKE', score: 5 }], { title: 'All time' }).includes('All time'),
  );
});

test('the scoreboard screen stacks today above all time', () => {
  const html = renderScoreboardScreen({
    dayKey: '2026-09-17',
    yourScore: 1183984,
    todayHtml: '<ol class="board">TODAY</ol>',
    allTimeHtml: '<ol class="board">ALLTIME</ol>',
  });
  assert.ok(html.includes('2026-09-17'));
  assert.ok(html.includes('1,183,984'));
  assert.ok(html.indexOf('TODAY') < html.indexOf('ALLTIME'));
  assert.ok(html.includes('id="back-to-modes"'));
  assert.ok(!html.includes('id="save-form"'), 'the scoreboard is read-only');
});

test('the scoreboard screen omits your score when you have not played today', () => {
  const html = renderScoreboardScreen({
    dayKey: '2026-09-17',
    yourScore: null,
    todayHtml: '',
    allTimeHtml: '',
  });
  assert.ok(!html.includes('You scored'));
});

test('the scoreboard screen escapes its own fields', () => {
  const html = renderScoreboardScreen({
    dayKey: '<script>',
    yourScore: null,
    todayHtml: '',
    allTimeHtml: '',
  });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
});

test('game over escapes its own text fields', () => {
  const html = renderGameOver({
    modeLabel: 'vs <b>Bob</b>',
    resultText: 'You beat <i>Bob</i> by 1.',
    scoresHtml: '',
    ledgerHtml: '',
    seed: '<script>',
  });
  assert.ok(html.includes('vs &lt;b&gt;Bob&lt;/b&gt;'));
  assert.ok(html.includes('You beat &lt;i&gt;Bob&lt;/i&gt; by 1.'));
  assert.ok(html.includes('Seed &lt;script&gt;'));
  assert.ok(!html.includes('<b>Bob</b>'));
  assert.ok(!html.includes('<script>'));
});
