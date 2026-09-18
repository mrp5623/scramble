/**
 * Answer typeahead: the current team's unused quarterbacks matching what was typed.
 *
 * Two rules carry the design.
 *
 * MIN_CHARS is 2 because match.js already forgives spelling -- what a typeahead adds
 * is recall, which is the game. Two characters means the player produces a first
 * guess before the game helps.
 *
 * Ordering is alphabetical, never by yards. `available` arrives yards-descending from
 * the engine, and passing that order through would put the best pick at the top of
 * every list, handing over Bob's strategy for free. The sort below is what stops it.
 */
import { escapeHtml } from './html.js';
import { normalize } from '../match.js';
import { displayName } from '../format.js';

export const MIN_CHARS = 2;
export const MAX_SUGGESTIONS = 8;

export function suggestQbs(input, available, { limit = MAX_SUGGESTIONS } = {}) {
  const query = normalize(input);
  if (query.length < MIN_CHARS) return [];

  const matches = [];
  for (const qb of available) {
    const name = normalize(qb);
    let rank;
    if (name.startsWith(query)) rank = 0;
    else if (name.split(' ').some((word) => word.startsWith(query))) rank = 1;
    else continue;
    matches.push({ qb, rank, name });
  }

  matches.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return matches.slice(0, limit).map((m) => m.qb);
}

/** `''` when there is nothing to show, so the caller can assign it blindly. */
export function renderSuggestions(qbs, { activeIndex = -1 } = {}) {
  if (qbs.length === 0) return '';
  const rows = qbs.map((qb, i) => {
    const active = i === activeIndex;
    return `<li id="suggest-${i}" class="suggest-item${active ? ' is-active' : ''}" role="option" aria-selected="${active}" data-qb="${escapeHtml(qb)}">${escapeHtml(displayName(qb))}</li>`;
  });
  return `<ul id="suggest-list" class="suggest-list" role="listbox" aria-label="Matching quarterbacks">${rows.join('')}</ul>`;
}
