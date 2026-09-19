import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../lib/csv.mjs';

test('parses a simple table into objects', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n3,4\n'), [
    { a: '1', b: '2' },
    { a: '3', b: '4' },
  ]);
});

test('a quoted field may contain commas', () => {
  // This is the real shape: headshot_url carries commas inside quotes, and a naive
  // split(',') shifts every later column by one.
  const rows = parseCsv('name,url,yards\nBurrow,"http://x/a,b,c",4918\n');
  assert.equal(rows[0].url, 'http://x/a,b,c');
  assert.equal(rows[0].yards, '4918');
});

test('a quoted field may contain doubled quotes and newlines', () => {
  const rows = parseCsv('a,b\n"he said ""hi""","two\nlines"\n');
  assert.equal(rows[0].a, 'he said "hi"');
  assert.equal(rows[0].b, 'two\nlines');
});

test('trailing newline and CRLF are tolerated', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [{ a: '1', b: '2' }]);
  assert.deepEqual(parseCsv('a,b\n1,2'), [{ a: '1', b: '2' }]);
});

test('rows with the wrong column count are dropped, not silently misaligned', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n3\n'), [{ a: '1', b: '2' }]);
});

test('an empty table is an empty array', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,b\n'), []);
});
