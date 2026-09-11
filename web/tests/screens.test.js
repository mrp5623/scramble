import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  modeOptions,
  renderModeSelect,
  renderGameShell,
  renderGameOver,
  renderLeaderboard,
} from '../src/ui/screens.js';

const FAKE_POLICIES = {
  bob: { id: 'bob', name: 'Bob', fullName: 'Best Option Bot', blurb: 'Takes the best.', ready: true },
  sal: { id: 'sal', name: 'Sal', fullName: 'Saving Artificial Learner', blurb: 'Saves.', ready: false },
};

const count = (html, needle) => html.split(needle).length - 1;

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
    { id: 'x', label: '<i>', fullName: null, blurb: 'a & b', status: 'ready' },
  ]);
  assert.ok(html.includes('&lt;i&gt;'));
  assert.ok(html.includes('a &amp; b'));
});

test('the game shell holds every region main.js fills', () => {
  const html = renderGameShell();
  for (const id of ['scoreboard', 'answer-form', 'answer', 'skip', 'message', 'ledger']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
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
  for (const id of ['save-form', 'player-name', 'leaderboard', 'play-again', 'change-mode']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.ok(html.includes('maxlength="20"'));
});

test('an empty leaderboard says so', () => {
  assert.ok(renderLeaderboard([]).includes('No scores saved yet.'));
});

test('the leaderboard ranks entries and highlights the one just saved', () => {
  const scores = [
    { name: 'Mike', score: 1231400, mode: 'bob', seed: 1, date: 'd1' },
    { name: '<Ann>', score: 1200000, mode: 'bob', seed: 2, date: 'd2' },
  ];
  const html = renderLeaderboard(scores, { highlightDate: 'd2' });
  assert.equal(count(html, 'class="board-row'), 2);
  assert.ok(html.includes('1,231,400'));
  assert.ok(html.includes('&lt;Ann&gt;'));
  assert.equal(count(html, 'is-you'), 1);
  assert.ok(html.indexOf('Mike') < html.indexOf('&lt;Ann&gt;'));
});
