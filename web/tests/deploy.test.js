import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const VERCEL = JSON.parse(root('vercel.json'));
const CI = root('.github/workflows/ci.yml');
const DATA_JOB = root('.github/workflows/data.yml');

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

test('CI still gates both suites after Pages was dropped', () => {
  assert.ok(CI.includes('node --test "web/tests/**/*.test.js" "tools/tests/**/*.test.js"'));
  assert.ok(CI.includes('pytest experiments/tests/ -q'));
  assert.ok(CI.includes('pull_request:'));
});

test('workflows are indented with spaces only', () => {
  assert.ok(!CI.includes('\t'));
});

test('the weekly refresh is gated and only commits real changes', () => {
  assert.ok(DATA_JOB.includes('schedule:'));
  assert.ok(DATA_JOB.includes('workflow_dispatch:'));
  assert.ok(DATA_JOB.includes('node tools/refresh-data.mjs'));
  assert.ok(DATA_JOB.includes('node tools/verify-data.mjs'));
  assert.ok(DATA_JOB.includes('contents: write'));
  // The verify step must come before the commit step, or the gate is decorative.
  assert.ok(DATA_JOB.indexOf('verify-data') < DATA_JOB.indexOf('git commit'));
});

test('Pages is gone, and the web suite is not gated twice', () => {
  // ci.yml was always the test gate; pages.yml's test step only guarded its own
  // publish. Adding a second workflow would run the web suite twice per push.
  assert.throws(() => root('.github/workflows/pages.yml'), /ENOENT/);
  assert.throws(() => root('.github/workflows/test.yml'), /ENOENT/);
});
