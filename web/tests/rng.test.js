import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, randomSeed } from '../src/rng.js';

test('the same seed produces the same sequence', () => {
  const a = createRng(42);
  const b = createRng(42);
  const xs = Array.from({ length: 8 }, () => a.next());
  const ys = Array.from({ length: 8 }, () => b.next());
  assert.deepEqual(xs, ys);
});

test('different seeds diverge', () => {
  assert.notEqual(createRng(1).next(), createRng(2).next());
});

test('values fall in [0, 1)', () => {
  const r = createRng(7);
  for (let i = 0; i < 2000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('choice returns array members and eventually covers the array', () => {
  const r = createRng(99);
  const items = ['a', 'b', 'c'];
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const c = r.choice(items);
    assert.ok(items.includes(c));
    seen.add(c);
  }
  assert.equal(seen.size, 3);
});

test('randomSeed returns a 32-bit unsigned integer', () => {
  const s = randomSeed();
  assert.ok(Number.isInteger(s));
  assert.ok(s >= 0 && s < 2 ** 32);
});
