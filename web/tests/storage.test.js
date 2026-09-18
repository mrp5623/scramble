import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { saveScore, topScores } from '../src/storage.js';

let calls = [];

function stubFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options);
  };
}

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

// localStorage backs deviceId(); without it every call would take the ephemeral path.
beforeEach(() => {
  const data = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, String(v)),
    },
    configurable: true,
    writable: true,
  });
  stubFetch(() => ok([]));
});

test('both functions still return promises', async () => {
  const saving = saveScore({ name: 'MIKE', score: 10, seed: 1 });
  const reading = topScores({});
  assert.ok(saving instanceof Promise);
  assert.ok(reading instanceof Promise);
  await saving;
  await reading;
});

test('saving posts the row and resolves to its id', async () => {
  stubFetch(() => ok([{ id: 7 }]));
  const result = await saveScore({ name: 'MIKE', score: 1231400, seed: 99 });
  assert.deepEqual(result, { id: 7 });

  const [call] = calls;
  assert.equal(call.options.method, 'POST');
  assert.match(call.url, /\/rest\/v1\/scores$/);
  assert.equal(call.options.headers.Prefer, 'return=representation');
  const body = JSON.parse(call.options.body);
  assert.equal(body.name, 'MIKE');
  assert.equal(body.score, 1231400);
  assert.equal(body.seed, 99);
  assert.equal(body.day, null);
  assert.match(body.device_id, /^[0-9a-f-]{36}$/);
});

test('a daily save carries its day', async () => {
  stubFetch(() => ok([{ id: 8 }]));
  await saveScore({ name: 'MIKE', score: 5, seed: 1, day: '2026-09-17' });
  assert.equal(JSON.parse(calls[0].options.body).day, '2026-09-17');
});

test('the request carries the anon key both ways round', async () => {
  await topScores({});
  const { headers } = calls[0].options;
  assert.ok(headers.apikey);
  assert.match(headers.Authorization, /^Bearer /);
});

test('the all-time board asks for the top scores, ties to the earliest', async () => {
  await topScores({ limit: 10 });
  const url = decodeURIComponent(calls[0].url);
  assert.ok(url.includes('order=score.desc,created_at.asc'));
  assert.ok(url.includes('limit=10'));
  assert.ok(!url.includes('day='));
});

test('the daily board filters to one day', async () => {
  await topScores({ day: '2026-09-17' });
  assert.ok(decodeURIComponent(calls[0].url).includes('day=eq.2026-09-17'));
});

test('rows come back as given', async () => {
  const rows = [
    { id: 1, name: 'MIKE', score: 30 },
    { id: 2, name: 'ANN', score: 20 },
  ];
  stubFetch(() => ok(rows));
  assert.deepEqual(await topScores({}), rows);
});

test('an HTTP error degrades instead of throwing', async () => {
  stubFetch(() => ({ ok: false, status: 409, json: async () => ({}) }));
  assert.equal(await saveScore({ name: 'MIKE', score: 1, seed: 1 }), null);
  assert.deepEqual(await topScores({}), []);
});

test('a network failure degrades instead of throwing', async () => {
  stubFetch(() => {
    throw new TypeError('Failed to fetch');
  });
  assert.equal(await saveScore({ name: 'MIKE', score: 1, seed: 1 }), null);
  assert.deepEqual(await topScores({}), []);
});

test('unexpected response shapes degrade', async () => {
  stubFetch(() => ok({ not: 'an array' }));
  assert.equal(await saveScore({ name: 'MIKE', score: 1, seed: 1 }), null);
  assert.deepEqual(await topScores({}), []);
});

test('the old local board key is never touched', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/storage.js', import.meta.url), 'utf8');
  assert.ok(!source.includes('scramble.scores.v1'));
});
