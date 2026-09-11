import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../src/ui/html.js';
import { renderScoreboard, renderScores } from '../src/ui/scoreboard.js';

const MINUS = '\u2212';

const base = {
  round: 12,
  rounds: 25,
  modeLabel: 'vs Bob',
  teamName: 'Denver Broncos',
  colors: { primary: '#FB4F14', accent: '#002244' },
  youScore: 612430,
  opponent: { name: 'Bob', score: 598110, margin: 14320 },
};

const count = (html, needle) => html.split(needle).length - 1;

test('escapeHtml neutralizes markup characters', () => {
  assert.equal(escapeHtml('<b a="1">Tom & Jerry\'s</b>'), '&lt;b a=&quot;1&quot;&gt;Tom &amp; Jerry&#39;s&lt;/b&gt;');
  assert.equal(escapeHtml(42), '42');
});

test('shows the round counter and mode', () => {
  const html = renderScoreboard(base);
  assert.ok(html.includes('Round 12 / 25'));
  assert.ok(html.includes('vs Bob'));
});

test('the team name is the page heading', () => {
  assert.ok(renderScoreboard(base).includes('<h1 class="team-name">Denver Broncos</h1>'));
});

test('the team block carries the team colours as custom properties', () => {
  const html = renderScoreboard(base);
  assert.ok(html.includes('--team: #FB4F14'));
  assert.ok(html.includes('--accent: #002244'));
});

test('the team block holds nothing but the team name', () => {
  const block = renderScoreboard(base).match(/<div class="team-block"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(block, 'team block present');
  assert.equal(block[1].trim(), '<h1 class="team-name">Denver Broncos</h1>');
});

test('a vs-mode score row shows both scores and the signed margin', () => {
  const html = renderScoreboard(base);
  assert.equal(count(html, '<div class="score'), 3);
  assert.ok(html.includes('612,430'));
  assert.ok(html.includes('598,110'));
  assert.ok(html.includes('>Bob<'));
  assert.ok(html.includes('+14,320'));
  assert.ok(html.includes('is-ahead'));
});

test('margin state follows the sign', () => {
  const behind = renderScoreboard({ ...base, opponent: { ...base.opponent, margin: -2300 } });
  assert.ok(behind.includes(`${MINUS}2,300`));
  assert.ok(behind.includes('is-behind'));

  const even = renderScoreboard({ ...base, opponent: { ...base.opponent, margin: 0 } });
  assert.ok(even.includes('Even'));
  assert.ok(even.includes('is-even'));
});

test('a classic score row shows only the player', () => {
  const html = renderScoreboard({ ...base, modeLabel: 'Classic', opponent: null });
  assert.equal(count(html, '<div class="score'), 1);
  assert.ok(!html.includes('Margin'));
});

test('renderScores stands alone for the game-over screen', () => {
  const html = renderScores({ youScore: 1000, opponent: { name: 'Sal', score: 900, margin: 100 } });
  assert.ok(html.startsWith('<dl class="scores">'));
  assert.ok(html.includes('>Sal<'));
  assert.ok(html.includes('+100'));
});

test('team colours are escaped inside the style attribute', () => {
  // A quote in a colour value could otherwise close the attribute and open another.
  const html = renderScoreboard({
    ...base,
    colors: { primary: '#FB4F14" onload="alert(1)', accent: '<script>' },
  });
  assert.ok(!html.includes('onload="alert(1)'), 'attribute breakout');
  assert.ok(html.includes('&quot; onload=&quot;alert(1)'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
});

test('interpolated text is escaped', () => {
  const html = renderScoreboard({ ...base, teamName: '<script>', modeLabel: 'a & b' });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('a &amp; b'));
  assert.ok(!html.includes('<script>'));
});
