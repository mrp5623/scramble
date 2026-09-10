/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * Deliberately NOT an attempt to reproduce Python's Mersenne Twister. Parity with
 * the Python study is established by replaying exported team sequences, not by
 * matching random streams -- see web/tools/parity.mjs.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    int(n) {
      return Math.floor(next() * n);
    },
    choice(array) {
      return array[Math.floor(next() * array.length)];
    },
  };
}

export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}
