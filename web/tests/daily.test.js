import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { todayKey, seedForDay, deviceId, readDaily, writeDaily } from '../src/daily.js';

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
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

beforeEach(() => install(fakeStorage()));

test('the day key is an ISO date in Eastern time', () => {
  assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/);
  // 04:30 UTC on Jan 2 is 23:30 Eastern on Jan 1 -- still the previous day's puzzle.
  assert.equal(todayKey(new Date('2026-01-02T04:30:00Z')), '2026-01-01');
  // 05:30 UTC the same night has crossed Eastern midnight.
  assert.equal(todayKey(new Date('2026-01-02T05:30:00Z')), '2026-01-02');
});

test('a day key always produces the same seed', () => {
  assert.equal(seedForDay('2026-09-17'), seedForDay('2026-09-17'));
});

test('the seed is a uint32 and adjacent days differ', () => {
  const seed = seedForDay('2026-09-17');
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
  assert.notEqual(seedForDay('2026-09-17'), seedForDay('2026-09-18'));
});

test('the device id is minted once and then reused', () => {
  const first = deviceId();
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(deviceId(), first);
});

test('the device id survives in storage under its versioned key', () => {
  const storage = fakeStorage();
  install(storage);
  const id = deviceId();
  assert.equal(storage.data.get('scramble.device.v1'), id);
});

test('the daily record round-trips', () => {
  assert.equal(readDaily(), null);
  writeDaily({ day: '2026-09-17', score: 1231400, name: 'MIKE', id: 42 });
  assert.deepEqual(readDaily(), { day: '2026-09-17', score: 1231400, name: 'MIKE', id: 42 });
});

test('a corrupt daily record reads as nothing played', () => {
  install(fakeStorage({ 'scramble.daily.v1': '{not json' }));
  assert.equal(readDaily(), null);
});

test('missing storage degrades instead of throwing', () => {
  install(undefined);
  assert.equal(readDaily(), null);
  assert.doesNotThrow(() => writeDaily({ day: 'x', score: 1, name: 'A', id: 1 }));
  assert.match(deviceId(), /^[0-9a-f-]{36}$/);
});

test('storage that throws on access degrades the same way', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    get() {
      throw new Error('SecurityError');
    },
    configurable: true,
  });
  assert.equal(readDaily(), null);
  assert.doesNotThrow(() => writeDaily({ day: 'x', score: 1, name: 'A', id: 1 }));
});
