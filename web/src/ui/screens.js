/**
 * Whole-screen markup: mode select, the game shell, game over, and the leaderboard.
 *
 * Mode select renders from the policy registry, so a new opponent appears here with
 * no change to this file. The game shell is static: main.js refills its #scoreboard
 * and #ledger regions each round but never re-renders the input, so a rejected guess
 * keeps what the player typed.
 */
import { escapeHtml } from './html.js';
import { formatYards } from '../format.js';

const STATUS_TEXT = {
  loading: 'Loading\u2026',
  failed: 'Unavailable right now.',
};

const DAILY_BLURB = 'One game a day, same teams for everyone';

export function modeOptions(policies, { failedIds = [], daily = null } = {}) {
  const options = [];
  if (daily) {
    options.push({
      id: 'daily',
      label: 'Daily Special',
      // The one row that needs explaining, now that the muted blurbs are gone. Once
      // played it reports the score instead, and stays clickable: a player who has
      // already played still needs to see whether they have been passed.
      fullName: daily.played ? `Today: ${formatYards(daily.score ?? 0)}` : DAILY_BLURB,
      status: 'ready',
    });
  }
  options.push({ id: 'classic', label: 'Classic', fullName: null, status: 'ready' });
  for (const policy of Object.values(policies)) {
    let status = 'ready';
    if (!policy.ready) status = failedIds.includes(policy.id) ? 'failed' : 'loading';
    options.push({
      id: policy.id,
      label: `vs ${policy.name}`,
      fullName: policy.fullName,
      status,
    });
  }
  return options;
}

function modeButton(option) {
  const ready = option.status === 'ready';
  const statusId = `mode-${option.id}-status`;
  const fullName = option.fullName
    ? `<span class="mode-full">${escapeHtml(option.fullName)}</span>`
    : '';
  const status = ready
    ? ''
    : `<span id="${escapeHtml(statusId)}" class="mode-status">${escapeHtml(STATUS_TEXT[option.status])}</span>`;
  const disabled = ready ? '' : ` disabled aria-describedby="${escapeHtml(statusId)}"`;

  return `
    <li class="mode-item">
      <button type="button" class="mode" data-mode="${escapeHtml(option.id)}"${disabled}>
        <span class="mode-name">${escapeHtml(option.label)}</span>${fullName}${status}
      </button>
    </li>`;
}

// Three en dashes: an unlit board. Doubles as a nudge that today is still open.
const NO_SCORE = '–––';

/**
 * The masthead scoreboard. Digits only, with the meaning carried by aria-label --
 * the number alone does not say what it counts.
 */
export function renderScoreboardButton({ topScore = null } = {}) {
  const has = typeof topScore === 'number';
  const digits = has ? formatYards(topScore) : NO_SCORE;
  const label = has
    ? `Scoreboard, today's best ${formatYards(topScore)}`
    : 'Scoreboard, no scores yet today';
  return `<button type="button" id="scoreboard" class="scoreboard-btn" aria-label="${escapeHtml(label)}"><span class="scoreboard-digits num" aria-hidden="true">${escapeHtml(digits)}</span></button>`;
}

export function renderModeSelect(options, { topScore = null } = {}) {
  return `
    <section class="card screen-select" aria-labelledby="wordmark">
      <header class="masthead">
        <h1 id="wordmark" class="wordmark">Scramble</h1>
        ${renderScoreboardButton({ topScore })}
        <p class="lede">Name a quarterback for each team. Twenty-five rounds. No repeats.</p>
      </header>
      <ol class="modes">${options.map(modeButton).join('')}</ol>
    </section>`;
}

export function renderGameShell() {
  return `
    <section class="card screen-game">
      <div id="scoreboard" class="scoreboard"></div>
      <form id="answer-form" class="answer" autocomplete="off" novalidate>
        <label class="visually-hidden" for="answer">Quarterback name</label>
        <input id="answer" class="answer-input" type="text" maxlength="40" autocomplete="off"
          autocapitalize="words" spellcheck="false" enterkeyhint="go" placeholder="Name a quarterback">
        <button type="submit" class="btn btn-primary">Submit</button>
        <button type="button" id="skip" class="btn btn-secondary">Skip <kbd class="hint">Shift+Enter</kbd></button>
      </form>
      <p id="message" class="message" role="status" aria-live="polite"></p>
      <div id="ledger" class="ledger-wrap"></div>
    </section>`;
}

/** `scoresHtml` and `ledgerHtml` are already-escaped markup from renderScores/renderLedger. */
export function renderGameOver({ modeLabel, resultText, scoresHtml, ledgerHtml, seed }) {
  return `
    <section class="card screen-over">
      <div class="topbar">
        <span class="topbar-round">Final</span>
        <span class="topbar-mode">${escapeHtml(modeLabel)}</span>
      </div>
      <h1 class="final-result">${escapeHtml(resultText ?? 'Game over.')}</h1>
      ${scoresHtml}
      <form id="save-form" class="save" novalidate>
        <label class="save-label" for="player-name">Name for the scoreboard</label>
        <div class="save-row">
          <input id="player-name" class="answer-input name-input" type="text" maxlength="12"
            autocomplete="nickname" autocapitalize="characters" spellcheck="false"
            placeholder="ANONYMOUS">
          <button type="submit" class="btn btn-primary">Save score</button>
        </div>
        <p id="save-error" class="save-error" role="alert"></p>
      </form>
      <div id="leaderboard" class="leaderboard"></div>
      <div class="actions">
        <button type="button" id="play-again" class="btn btn-primary">Play again</button>
        <button type="button" id="change-mode" class="btn btn-secondary">Change mode</button>
      </div>
      ${ledgerHtml}
      <p class="seed num">Seed ${escapeHtml(seed ?? '')}</p>
    </section>`;
}

export function renderLeaderboard(scores, { highlightId = null } = {}) {
  const title = '<h2 class="board-title">Top scores</h2>';
  if (scores.length === 0) return `${title}<p class="board-empty">No scores saved yet.</p>`;

  const rows = scores.map((s, i) => {
    const you = highlightId !== null && s.id === highlightId ? ' is-you' : '';
    return `<li class="board-row${you}"><span class="board-rank num" aria-hidden="true">${i + 1}</span><span class="board-name">${escapeHtml(s.name)}</span><span class="board-score num">${escapeHtml(formatYards(s.score))}</span></li>`;
  });
  return `${title}<ol class="board">${rows.join('')}</ol>`;
}

/**
 * Today's daily board, read-only. Reached from an already-played Daily Special row --
 * without it a player cannot check whether they have been passed until tomorrow.
 *
 * `boardHtml` is already-escaped markup from renderLeaderboard.
 */
export function renderDailyBoard({ dayKey, yourScore, boardHtml }) {
  const yours =
    yourScore === null || yourScore === undefined
      ? ''
      : `<p class="daily-yours">You scored <span class="num">${escapeHtml(formatYards(yourScore))}</span></p>`;
  return `
    <section class="card screen-daily">
      <div class="topbar">
        <span class="topbar-round">Daily</span>
        <span class="topbar-mode">${escapeHtml(dayKey)}</span>
      </div>
      <h1 class="final-result">Today's board</h1>
      ${yours}
      <div class="leaderboard">${boardHtml}</div>
      <div class="actions">
        <button type="button" id="back-to-modes" class="btn btn-primary">Back</button>
      </div>
      <p class="daily-note">One game a day. The next puzzle lands at midnight Eastern.</p>
    </section>`;
}
