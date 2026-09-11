/**
 * The pinned top of the game screen: ink top bar, team block, score row.
 *
 * The team block holds ONLY the team name, always white. Five primaries pass contrast
 * only as large text, so nothing small may sit on the block. The accent is never
 * text -- it reaches the page solely through --accent, printed as a halftone by CSS.
 */
import { escapeHtml } from './html.js';
import { formatYards, formatMargin } from '../format.js';

function marginState(margin) {
  if (margin > 0) return 'is-ahead';
  if (margin < 0) return 'is-behind';
  return 'is-even';
}

function scoreCell(label, value, extraClass = '') {
  return `<div class="score${extraClass}"><dt>${escapeHtml(label)}</dt><dd class="num">${escapeHtml(value)}</dd></div>`;
}

/** The ruled You / Opponent / Margin row. Shared by the game and game-over screens. */
export function renderScores({ youScore, opponent }) {
  const cells = [scoreCell('You', formatYards(youScore))];
  if (opponent) {
    cells.push(scoreCell(opponent.name, formatYards(opponent.score)));
    cells.push(
      scoreCell('Margin', formatMargin(opponent.margin), ` score-margin ${marginState(opponent.margin)}`),
    );
  }
  return `<dl class="scores">${cells.join('')}</dl>`;
}

export function renderScoreboard({ round, rounds, modeLabel, teamName, colors, youScore, opponent }) {
  return `
    <div class="topbar">
      <span class="topbar-round num">Round ${escapeHtml(round)} / ${escapeHtml(rounds)}</span>
      <span class="topbar-mode">${escapeHtml(modeLabel)}</span>
    </div>
    <div class="team-block" style="--team: ${escapeHtml(colors.primary)}; --accent: ${escapeHtml(colors.accent)}">
      <h1 class="team-name">${escapeHtml(teamName)}</h1>
    </div>
    ${renderScores({ youScore, opponent })}`;
}
