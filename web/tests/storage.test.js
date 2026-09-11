import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { saveScore, topScores } from '../src/storage.js';

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      data.set(key, String(value));
    },
    data,
  };
}

function install(storage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
}

const entry = (overrides = {}) => ({
  name: 'Mike',
  score: 1000,
  mode: 'classic',
  seed: 1,
  date: '2026-09-11T09:00:00.000Z',
  ...overrides,
});

beforeEach(() => install(fakeStorage()));

test('both functions return promises', async () => {
  const saving = saveScore(entry());
  const reading = topScores('classic');
  assert.ok(saving instanceof Promise);
  assert.ok(reading instanceof Promise);
  await saving;
  await reading;
});

test('a saved score comes back', async () => {
  await saveScore(entry());
  assert.deepEqual(await topScores('classic'), [entry()]);
});

test('scores are kept separately per mode', async () => {
  await saveScore(entry({ mode: 'classic' }));
  await saveScore(entry({ mode: 'sal', name: 'Beat Sal' }));
  assert.deepEqual((await topScores('sal')).map((s) => s.name), ['Beat Sal']);
  assert.equal((await topScores('bob')).length, 0);
});

test('scores come back highest first, capped at the limit', async () => {
  await saveScore(entry({ name: 'low', score: 10 }));
  await saveScore(entry({ name: 'high', score: 30 }));
  await saveScore(entry({ name: 'mid', score: 20 }));
  assert.deepEqual((await topScores('classic', 2)).map((s) => s.name), ['high', 'mid']);
});

test('a tied score goes to whoever set it first', async () => {
  await saveScore(entry({ name: 'later', score: 50, date: '2026-09-11T10:00:00.000Z' }));
  await saveScore(entry({ name: 'earlier', score: 50, date: '2026-09-11T09:00:00.000Z' }));
  assert.deepEqual((await topScores('classic')).map((s) => s.name), ['earlier', 'later']);
});

test('scores persist under the versioned key', async () => {
  const storage = fakeStorage();
  install(storage);
  await saveScore(entry());
  assert.ok(storage.data.has('scramble.scores.v1'));
});

test('corrupt or unexpected stored data reads as empty', async () => {
  install(fakeStorage({ 'scramble.scores.v1': '{not json' }));
  assert.deepEqual(await topScores('classic'), []);

  install(fakeStorage({ 'scramble.scores.v1': '{"a":1}' }));
  assert.deepEqual(await topScores('classic'), []);
});

test('a full store does not break saving', async () => {
  install({
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  });
  await assert.doesNotReject(saveScore(entry()));
});

test('missing storage degrades to nothing saved', async () => {
  install(undefined);
  await assert.doesNotReject(saveScore(entry()));
  assert.deepEqual(await topScores('classic'), []);
});

test('storage that throws on access degrades the same way', async () => {
  Object.defineProperty(globalThis, 'localStorage', {
    get() {
      throw new Error('SecurityError');
    },
    configurable: true,
  });
  await assert.doesNotReject(saveScore(entry()));
  assert.deepEqual(await topScores('classic'), []);
});
