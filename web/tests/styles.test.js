import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the stock is pure white', () => {
  assert.match(CSS, /--stock:\s*#ffffff\s*;/i);
});

test('no cream, sand, or parchment tokens', () => {
  assert.doesNotMatch(CSS, /--(cream|sand|parchment|beige|ivory|linen|bone|paper)\b/i);
});

test('none of the banned treatments appear', () => {
  assert.doesNotMatch(CSS, /box-shadow/, 'drop shadows');
  assert.doesNotMatch(CSS, /background-clip:\s*text/, 'gradient text');
  // The lookahead sits directly after the colon: a leading \s* would backtrack to
  // zero spaces and let the legitimate `border-radius: 0;` through as a match.
  assert.doesNotMatch(CSS, /border-radius:(?!\s*0\s*;)[^;]*;/, 'rounded corners');
  assert.doesNotMatch(
    CSS,
    /border-(left|right|inline-start|inline-end)\s*:\s*(var\(--rule-(heavy|mid)\)|[2-9]px|\d{2,}px)/,
    'side-stripe borders',
  );
});

test('the team name never drops below large-text size', () => {
  const rule = CSS.match(/\.team-name\s*\{[^}]*\}/);
  assert.ok(rule, '.team-name rule present');
  assert.match(rule[0], /font-size:\s*clamp\(1\.75rem,/);
});

test('display type uses the condensed width of the one family', () => {
  assert.match(CSS, /--display-stretch:\s*62%/);
  assert.match(CSS, /--font:\s*'Archivo'/);
});

test('the ledger collapses to stacked cards below 640px', () => {
  assert.ok(CSS.includes('@media (max-width: 639.98px)'));
  assert.match(CSS, /grid-template-areas/);
});

test('animations have a reduced-motion alternative', () => {
  assert.ok(CSS.includes('animation:'));
  assert.ok(CSS.includes('@media (prefers-reduced-motion: reduce)'));
});

test('the halftone is never animated', () => {
  const rule = CSS.match(/\.team-block::before\s*\{[^}]*\}/);
  assert.ok(rule, 'halftone rule present');
  assert.doesNotMatch(rule[0], /animation|transition/);
});

test('the document loads Archivo with its width axis and the app as a module', () => {
  assert.ok(HTML.includes('family=Archivo:wdth,wght@62..125,100..900'));
  assert.ok(HTML.includes('<script type="module" src="src/main.js"></script>'));
  assert.ok(HTML.includes('<main id="app" class="app">'));
});

test('local assets use relative paths so the site works under /scramble/', () => {
  const local = [...HTML.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((url) => !url.startsWith('https://'));
  assert.ok(local.length >= 2);
  for (const url of local) assert.ok(!url.startsWith('/'), url);
});

test('the team name clamp has a ceiling that does not shout', () => {
  const rule = CSS.match(/\.team-name\s*\{[^}]*\}/);
  assert.ok(rule, '.team-name rule present');
  const clamp = rule[0].match(/font-size:\s*clamp\(([^)]+)\)/);
  assert.ok(clamp, 'the team name sizes with clamp()');
  const ceiling = clamp[1].split(',')[2].trim();
  assert.match(ceiling, /rem$/, `ceiling ${ceiling} should be expressed in rem`);
  assert.ok(Number.parseFloat(ceiling) <= 6, `display ceiling ${ceiling} must be at most 6rem`);
});

test('every animated selector has a reduced-motion alternative', () => {
  const start = CSS.indexOf('@media (prefers-reduced-motion: reduce)');
  assert.ok(start > -1, 'reduced-motion block present');

  // Excise the block by brace-matching, so animations are found wherever they sit --
  // including after it, which is where a new section would naturally be appended.
  let depth = 0;
  let end = CSS.length;
  for (let i = CSS.indexOf('{', start); i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    else if (CSS[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  const reduced = CSS.slice(start, end);
  const rest = CSS.slice(0, start) + CSS.slice(end);

  const animated = [...rest.matchAll(/([.#][\w.-]+)\s*\{[^}]*animation:/g)].map((m) => m[1]);
  assert.ok(animated.length > 0, 'the stylesheet animates something');
  for (const selector of animated) {
    assert.ok(reduced.includes(selector), `${selector} is animated but has no reduced-motion alternative`);
  }
  assert.match(reduced, /animation:\s*none/);
});
