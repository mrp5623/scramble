/**
 * The Daily Special: one shared puzzle per day, and the anonymous identity used to
 * hold a player to one attempt at it.
 *
 * Everything here is deliberately pure or storage-degrading -- the game must stay
 * playable with localStorage blocked, so no function throws.
 */

// One fixed zone, so every player worldwide gets the same puzzle. Device-local dates
// would split the board across two days; UTC would roll the puzzle at 8pm Eastern,
// mid-evening for this audience.
const DAY_ZONE = 'America/New_York';
const DEVICE_KEY = 'scramble.device.v1';
const DAILY_KEY = 'scramble.daily.v1';

let ephemeralId = null;

function backing() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(key) {
  const store = backing();
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  const store = backing();
  if (!store) return false;
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Today's puzzle key, `YYYY-MM-DD`, in Eastern time. */
export function todayKey(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: DAY_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const at = (type) => parts.find((p) => p.type === type).value;
    return `${at('year')}-${at('month')}-${at('day')}`;
  } catch {
    // A wrong boundary beats a crash.
    return now.toISOString().slice(0, 10);
  }
}

/**
 * FNV-1a, 32-bit, over the day key. Chosen because it is four lines, needs no
 * dependency, and is stable forever -- the same date must always yield the same 25
 * teams. The result feeds createGame({ seed }) unchanged.
 */
export function seedForDay(dayKey) {
  let hash = 2166136261;
  for (let i = 0; i < dayKey.length; i++) {
    hash ^= dayKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function newUuid() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // fall through to the manual shape
  }
  // The column is a Postgres uuid, so the fallback must still be UUID-shaped.
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const block = (n) => Array.from({ length: n }, hex).join('');
  return `${block(8)}-${block(4)}-4${block(3)}-a${block(3)}-${block(12)}`;
}

/** A stable anonymous id for this browser. Ephemeral if storage is unavailable. */
export function deviceId() {
  const existing = read(DEVICE_KEY);
  if (existing) return existing;
  const id = newUuid();
  if (write(DEVICE_KEY, id)) return id;
  ephemeralId = ephemeralId ?? id;
  return ephemeralId;
}

/** This browser's record of the last daily it played, or null. */
export function readDaily() {
  const raw = read(DAILY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && typeof parsed.day === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeDaily(record) {
  write(DAILY_KEY, JSON.stringify(record));
}
