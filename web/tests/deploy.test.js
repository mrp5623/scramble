import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const VERCEL = JSON.parse(root('vercel.json'));
const TESTS = root('.github/workflows/test.yml');

test('vercel publishes an assembled site, not the repo', () => {
  assert.equal(VERCEL.outputDirectory, '_site');
  assert.equal(VERCEL.installCommand, '');
});

test('the build ships only what the browser loads', () => {
  const build = VERCEL.buildCommand;
  assert.ok(build.includes('cp web/index.html web/styles.css _site/'));
  assert.ok(build.includes('cp -r web/src web/weights _site/'));
  assert.ok(build.includes('cp data/nfl_qbs.json _site/data/'));
  // Tests, the parity tool and its fixtures, and package.json stay out of the site.
  assert.doesNotMatch(build, /web\/tests|web\/tools|web\/package\.json|cp -r web\s/);
});

test('the test gate survived dropping Pages', () => {
  assert.ok(TESTS.includes('node --test "web/tests/**/*.test.js"'));
  assert.ok(TESTS.includes('branches: [main]'));
  assert.ok(TESTS.includes('pull_request:'));
  assert.ok(TESTS.includes('node-version: "22"'));
});

test('workflows are indented with spaces only', () => {
  assert.ok(!TESTS.includes('\t'));
});

test('no GitHub Pages workflow remains', () => {
  assert.throws(() => root('.github/workflows/pages.yml'), /ENOENT/);
});
