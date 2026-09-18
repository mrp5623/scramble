import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestQbs, renderSuggestions, MIN_CHARS } from '../src/ui/suggest.js';

// Deliberately yards-descending, the order session.available() returns.
const BENGALS = ['carson palmer', 'joe flacco', 'joe burrow', 'andy dalton', 'boomer esiason'];

test('nothing is offered until two characters', () => {
  assert.equal(MIN_CHARS, 2);
  assert.deepEqual(suggestQbs('', BENGALS), []);
  assert.deepEqual(suggestQbs('j', BENGALS), []);
  assert.ok(suggestQbs('jo', BENGALS).length > 0);
});

test('punctuation alone never reaches the threshold', () => {
  assert.deepEqual(suggestQbs('..', BENGALS), []);
  assert.deepEqual(suggestQbs('   ', BENGALS), []);
});

test('a first name prefix matches', () => {
  assert.deepEqual(suggestQbs('joe', BENGALS), ['joe burrow', 'joe flacco']);
});

test('a surname prefix matches too', () => {
  assert.deepEqual(suggestQbs('bur', BENGALS), ['joe burrow']);
  assert.deepEqual(suggestQbs('dalt', BENGALS), ['andy dalton']);
});

test('a full-name prefix outranks a word prefix', () => {
  // "and" prefixes the full name "andy dalton" and the word "anderson".
  const list = ['ken anderson', 'andy dalton'];
  assert.deepEqual(suggestQbs('and', list), ['andy dalton', 'ken anderson']);
});

test('ordering is alphabetical, NOT by yards', () => {
  // BENGALS is yards-descending, so Flacco precedes Burrow there. If the suggestions
  // came back in that order the list would rank picks by value and hand the player
  // the greedy strategy for free.
  assert.deepEqual(suggestQbs('joe', BENGALS), ['joe burrow', 'joe flacco']);
});

test('the list is capped', () => {
  const many = Array.from({ length: 20 }, (_, i) => `joe player${String(i).padStart(2, '0')}`);
  assert.equal(suggestQbs('joe', many).length, 8);
  assert.equal(suggestQbs('joe', many, { limit: 3 }).length, 3);
});

test('matching ignores accents, punctuation and case, like the answer matcher', () => {
  assert.deepEqual(suggestQbs("O'B", ["ken o'brien"]), ["ken o'brien"]);
  assert.deepEqual(suggestQbs('KEN', ["ken o'brien"]), ["ken o'brien"]);
});

test('an empty result renders nothing at all', () => {
  assert.equal(renderSuggestions([]), '');
});

test('rows carry the raw name and a display name', () => {
  const html = renderSuggestions(['joe burrow']);
  assert.ok(html.includes('role="listbox"'));
  assert.ok(html.includes('role="option"'));
  assert.ok(html.includes('data-qb="joe burrow"'));
  assert.ok(html.includes('>Joe Burrow<'));
  assert.ok(!html.includes('aria-selected="true"'));
});

test('the active row is marked for the screen reader and the eye', () => {
  const html = renderSuggestions(['joe burrow', 'joe flacco'], { activeIndex: 1 });
  assert.ok(html.includes('id="suggest-1"'));
  assert.equal(html.split('aria-selected="true"').length - 1, 1);
  assert.equal(html.split('is-active').length - 1, 1);
});

test('names are escaped', () => {
  const html = renderSuggestions(['<script>']);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
});

test('suggestions never carry yardage', () => {
  assert.doesNotMatch(renderSuggestions(['joe burrow']), /\d{3}/);
});
