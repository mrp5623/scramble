import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WORKFLOW = readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');

test('publishes from main when the site or its data changes', () => {
  assert.ok(WORKFLOW.includes('branches: [main]'));
  assert.ok(WORKFLOW.includes('"web/**"'));
  assert.ok(WORKFLOW.includes('"data/nfl_qbs.json"'));
  assert.ok(WORKFLOW.includes('workflow_dispatch:'));
});

test('runs the web tests before anything is published', () => {
  const testAt = WORKFLOW.indexOf('node --test "web/tests/**/*.test.js"');
  const uploadAt = WORKFLOW.indexOf('actions/upload-pages-artifact');
  assert.ok(testAt > -1, 'test step present');
  assert.ok(testAt < uploadAt, 'tests run before upload');
});

test('ships only what the browser loads', () => {
  // Scoped to the assembly step: the test step legitimately names web/tests.
  const assemble = WORKFLOW.match(/name: Assemble the site[\s\S]*?(?=\n\s*- uses:)/);
  assert.ok(assemble, 'assembly step present');
  const step = assemble[0];
  assert.ok(step.includes('cp web/index.html web/styles.css _site/'));
  assert.ok(step.includes('cp -r web/src web/weights _site/'));
  assert.ok(step.includes('cp data/nfl_qbs.json _site/data/'));
  assert.doesNotMatch(step, /web\/tests|web\/tools|web\/package\.json|cp -r web\s/);
});

test('has the permissions a Pages deploy needs', () => {
  assert.ok(WORKFLOW.includes('pages: write'));
  assert.ok(WORKFLOW.includes('id-token: write'));
  assert.ok(WORKFLOW.includes('actions/deploy-pages@v4'));
});

test('is indented with spaces only', () => {
  assert.ok(!WORKFLOW.includes('\t'));
});
