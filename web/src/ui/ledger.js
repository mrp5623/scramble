/**
 * The box-score ledger: one row per completed round, newest first.
 *
 * A single real table. Below 640px the stylesheet re-lays each row as a stacked card
 * instead of scrolling sideways -- the first column to slide off would be the margin,
 * the one that says who is winning (spec section 11.4). Changing a table's CSS display
 * strips its semantics in some browsers, so the ARIA table roles are set explicitly.
 */
import { escapeHtml } from './html.js';
import { displayName, formatYards, formatDelta } from '../format.js';
import { teamStyle } from '../teams.js';

const DELTA = '\u0394';

function deltaState(delta) {
  if (delta > 0) return 'is-win';
  if (delta < 0) return 'is-loss';
  return 'is-even';
}

function header(text, ariaLabel = null) {
  const label = ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : '';
  return `<th role="columnheader" scope="col"${label}>${escapeHtml(text)}</th>`;
}

function cell(className, label, content) {
  return `<td role="cell" class="${className}" data-label="${escapeHtml(label)}">${content}</td>`;
}

function pickContent(pick, yards) {
  if (pick === null) return '<span class="skipped">Skipped</span>';
  return `<span class="pick">${escapeHtml(displayName(pick))}</span> <span class="yds num">${escapeHtml(formatYards(yards))}</span>`;
}

function row(r, opponentName, newestRound) {
  const cells = [
    cell('c-round num', 'Round', escapeHtml(r.round)),
    cell('c-team', 'Team', escapeHtml(teamStyle(r.team).abbr)),
    cell('c-you', 'You', pickContent(r.youPick, r.youYards)),
  ];
  if (opponentName !== null) {
    cells.push(cell('c-bot', opponentName, pickContent(r.botPick, r.botYards)));
    cells.push(cell(`c-delta num ${deltaState(r.delta)}`, 'Margin', escapeHtml(formatDelta(r.delta))));
  }
  const fresh = r.round === newestRound ? ' is-new' : '';
  return `<tr role="row" class="ledger-row${fresh}">${cells.join('')}</tr>`;
}

export function renderLedger({ rows, opponentName = null, newestRound = null }) {
  if (rows.length === 0) return '<p class="ledger-empty">No rounds yet.</p>';

  const hasOpponent = opponentName !== null;
  const headers = [header('#', 'Round'), header('Team'), header('You')];
  if (hasOpponent) headers.push(header(opponentName), header(DELTA, 'Margin'));

  return `
    <table class="ledger${hasOpponent ? ' has-opponent' : ''}" role="table" aria-label="Rounds so far">
      <thead role="rowgroup"><tr role="row">${headers.join('')}</tr></thead>
      <tbody role="rowgroup">${rows.map((r) => row(r, opponentName, newestRound)).join('')}</tbody>
    </table>`;
}
