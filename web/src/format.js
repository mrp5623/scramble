/**
 * Number formatting, name casing, and every sentence the player reads.
 *
 * Voice (PRODUCT.md): dry, closer to a stat-sheet caption than a play-by-play call.
 * It states the number and moves on.
 */
import { normalize } from './match.js';

const GROUPED = new Intl.NumberFormat('en-US');
const EM_DASH = '—';
const MINUS = '−';
const MIDDLE_DOT = '·';
const ARROW = '→';
const ELLIPSIS = '…';
const ROMAN_SUFFIXES = new Set(['ii', 'iii', 'iv']);
const NAME_LIMIT = 20;

export function formatYards(yards) {
  return GROUPED.format(yards);
}

function signed(n) {
  return (n > 0 ? '+' : MINUS) + GROUPED.format(Math.abs(n));
}

/** One round's difference, shown in the ledger. */
export function formatDelta(delta) {
  return delta === 0 ? EM_DASH : signed(delta);
}

/** The running margin, shown in the score row. */
export function formatMargin(margin) {
  return margin === 0 ? 'Even' : signed(margin);
}

/**
 * Dataset names are lowercase. Capitalize each word and every letter that follows a
 * hyphen, apostrophe, or period; uppercase roman numerals; capitalize after `Mc`.
 * `Mac` is deliberately left alone -- the dataset holds names like Mackrides.
 */
export function displayName(qb) {
  return qb
    .split(' ')
    .map((word) => {
      if (ROMAN_SUFFIXES.has(word)) return word.toUpperCase();
      return word
        .replace(/(^|[-'.])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase())
        .replace(/^Mc([a-z])/, (_, ch) => `Mc${ch.toUpperCase()}`);
    })
    .join(' ');
}

/** "Denver Broncos" -> "Broncos". */
export function shortTeamName(teamName) {
  const words = teamName.split(' ');
  return words[words.length - 1];
}

function article(word) {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/** Why a guess didn't count. Leads with who the input resolved to (spec section 6.3). */
export function guessMessage(result, teamShort) {
  switch (result.status) {
    case 'wrong-team':
      return `${displayName(result.qb)}. Not ${article(teamShort)} ${teamShort} quarterback.`;
    case 'used':
      return `${displayName(result.qb)}. Already used.`;
    default:
      return 'No one by that name.';
  }
}

/** Confirms who a guess resolved to, echoing the typed text only when it differs. */
export function pickConfirmation(typed, qb, yards) {
  const shown = typed.trim().replace(/\s+/g, ' ');
  const tail = `${displayName(qb)} ${MIDDLE_DOT} +${formatYards(yards)}`;
  return normalize(shown) === normalize(qb) ? tail : `${shown} ${ARROW} ${tail}`;
}

export const SKIPPED_MESSAGE = 'Skipped.';

export function autoSkipMessage(teamShort) {
  return `No ${teamShort} quarterbacks left.`;
}

export function answeringMessage(opponentName) {
  return `${opponentName} is answering${ELLIPSIS}`;
}

/** The head-to-head verdict on the game-over screen, or null in Classic. */
export function resultLine(youScore, botScore, opponentName) {
  if (botScore === null) return null;
  const diff = formatYards(Math.abs(youScore - botScore));
  if (youScore > botScore) return `You beat ${opponentName} by ${diff}.`;
  if (botScore > youScore) return `${opponentName} beat you by ${diff}.`;
  return `Dead even with ${opponentName}.`;
}

export function cleanName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, NAME_LIMIT).trim();
  return name || 'Anonymous';
}
