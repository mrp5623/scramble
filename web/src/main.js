/**
 * The only module that touches the DOM: boots the app, routes between the three
 * screens, and wires input events to the session. Every decision is delegated to a
 * tested module; this file is glue, verified by playing the game.
 */
import { fetchRoster } from './roster.js';
import { randomSeed } from './rng.js';
import { POLICIES, getPolicy, registerSal } from './policies/index.js';
import { loadAgent } from './policies/agent.js';
import { createSession } from './session.js';
import { saveScore, topScores } from './storage.js';
import { teamStyle } from './teams.js';
import {
  shortTeamName,
  guessMessage,
  pickConfirmation,
  SKIPPED_MESSAGE,
  autoSkipMessage,
  answeringMessage,
  resultLine,
  cleanName,
} from './format.js';
import { renderScoreboard, renderScores } from './ui/scoreboard.js';
import { renderLedger } from './ui/ledger.js';
import {
  modeOptions,
  renderModeSelect,
  renderGameShell,
  renderGameOver,
  renderLeaderboard,
} from './ui/screens.js';

// Long enough to read as the opponent taking a turn, short enough that 25 of them
// don't drag. Classic has no opponent and skips it.
const OPPONENT_BEAT_MS = 450;
const MIDDLE_DOT = '\u00b7';

let app = null;
let roster = null;
let screen = 'boot';
let modeId = null;
let session = null;
let busy = false;
const failedIds = [];

const $ = (id) => document.getElementById(id);

function opponentView(s) {
  return s.opponent ? { name: s.opponent.name, score: s.botScore, margin: s.margin } : null;
}

function modeLabel(s) {
  return s.opponent ? `vs ${s.opponent.name}` : 'Classic';
}

function teamShort(code) {
  return shortTeamName(roster.teamNames[code]);
}

/* ---------- Mode select ---------- */

function showModeSelect({ keepFocus = false } = {}) {
  const focusedMode = keepFocus ? document.activeElement?.dataset?.mode : null;
  screen = 'select';
  session = null;
  app.innerHTML = renderModeSelect(modeOptions(POLICIES, { failedIds }));

  for (const button of app.querySelectorAll('button[data-mode]')) {
    button.addEventListener('click', () => startGame(button.dataset.mode));
  }
  const target =
    (focusedMode && app.querySelector(`button[data-mode="${focusedMode}"]:not(:disabled)`)) ||
    app.querySelector('button[data-mode]:not(:disabled)');
  target?.focus();
}

/* ---------- Game ---------- */

function startGame(id) {
  modeId = id;
  const opponent = id === 'classic' ? null : getPolicy(id);
  session = createSession({ roster, opponent, seed: randomSeed() });
  screen = 'game';
  busy = false;
  app.innerHTML = renderGameShell();

  $('answer-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submitAnswer();
  });
  $('answer').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      skipRound();
    }
  });
  $('skip').addEventListener('click', skipRound);

  renderRound(null);
  if (!settleStuckRounds()) $('answer').focus();
}

function submitAnswer() {
  if (busy) return;
  const typed = $('answer').value;
  handleResult(session.submit(typed), typed);
}

function skipRound() {
  if (busy) return;
  handleResult(session.skip(), '');
}

function renderRound(newestRound) {
  const code = session.currentTeam;
  $('scoreboard').innerHTML = renderScoreboard({
    round: session.round,
    rounds: session.rounds,
    modeLabel: modeLabel(session),
    teamName: roster.teamNames[code],
    colors: teamStyle(code),
    youScore: session.youScore,
    opponent: opponentView(session),
  });
  $('ledger').innerHTML = renderLedger({
    rows: session.ledger,
    opponentName: session.opponent?.name ?? null,
    newestRound,
  });
  $('answer').placeholder = `${teamShort(code)} quarterback`;
}

function setMessage(text) {
  $('message').textContent = text;
}

// The text input is deliberately left enabled: disabling the focused element blurs
// it, which dismisses the soft keyboard on iOS, and the refocus after the beat runs
// outside a user gesture so mobile browsers will not raise it again. The busy guard
// in submitAnswer/skipRound already rejects anything typed during the beat.
function setBusy(value) {
  busy = value;
  const input = $('answer');
  for (const control of $('answer-form').elements) {
    if (control !== input) control.disabled = value;
  }
}

function handleResult(result, typed) {
  if (result.kind === 'ignored') return;

  if (result.kind === 'rejected') {
    // The input is left exactly as typed so the player can correct it.
    setMessage(guessMessage(result, teamShort(session.currentTeam)));
    return;
  }

  const confirmation =
    result.kind === 'accepted' ? pickConfirmation(typed, result.qb, result.yards) : SKIPPED_MESSAGE;

  const finishRound = () => {
    setBusy(false);
    $('answer').value = '';
    if (session.done) {
      showGameOver();
      return;
    }
    renderRound(result.row.round);
    // Name the new team in the live region. The scoreboard is replaced without one,
    // so otherwise the only thing announced is the pick that just ended.
    setMessage(`${confirmation} ${MIDDLE_DOT} ${teamShort(session.currentTeam)}`);
    if (!settleStuckRounds()) $('answer').focus();
  };

  if (!session.opponent) {
    finishRound();
    return;
  }
  setBusy(true);
  setMessage(`${confirmation} ${MIDDLE_DOT} ${answeringMessage(session.opponent.name)}`);
  window.setTimeout(finishRound, OPPONENT_BEAT_MS);
}

/** Auto-skips any round whose team has no quarterbacks left. Returns true if that ended the game. */
function settleStuckRounds() {
  while (session.stuck) {
    const team = teamShort(session.currentTeam);
    const { row } = session.skip();
    if (session.done) {
      showGameOver();
      return true;
    }
    renderRound(row.round);
    setMessage(autoSkipMessage(team));
  }
  return false;
}

/* ---------- Game over ---------- */

function showGameOver() {
  const finished = session;
  const mode = modeId;
  const opponent = opponentView(finished);
  screen = 'over';

  app.innerHTML = renderGameOver({
    modeLabel: modeLabel(finished),
    resultText: resultLine(finished.youScore, finished.botScore, opponent?.name ?? null),
    scoresHtml: renderScores({ youScore: finished.youScore, opponent }),
    ledgerHtml: renderLedger({ rows: finished.ledger, opponentName: opponent?.name ?? null }),
    seed: finished.seed,
  });

  refreshLeaderboard(mode, null);

  let saved = false;
  $('save-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saved) return;
    saved = true;
    for (const control of $('save-form').elements) control.disabled = true;

    const date = new Date().toISOString();
    await saveScore({
      name: cleanName($('player-name').value),
      score: finished.youScore,
      mode,
      seed: finished.seed,
      date,
    });
    await refreshLeaderboard(mode, date);
    $('play-again')?.focus();
  });
  $('play-again').addEventListener('click', () => startGame(mode));
  $('change-mode').addEventListener('click', () => showModeSelect());
  $('player-name').focus();
}

async function refreshLeaderboard(mode, highlightDate) {
  const scores = await topScores(mode, 10);
  const board = $('leaderboard');
  // The player may have already left for another screen.
  if (board) board.innerHTML = renderLeaderboard(scores, { highlightDate });
}

/* ---------- Boot ---------- */

async function boot() {
  app = document.getElementById('app');

  // Sal loads alongside the roster; mode select shows him as loading until he lands.
  loadAgent('weights/sal.json')
    .then((agent) => registerSal(agent))
    .catch(() => {
      failedIds.push('sal');
    })
    .finally(() => {
      if (screen === 'select') showModeSelect({ keepFocus: true });
    });

  try {
    roster = await fetchRoster('data/nfl_qbs.json');
  } catch {
    app.innerHTML = '<p class="boot is-error">Could not load the rosters. Refresh to try again.</p>';
    return;
  }
  showModeSelect();
}

if (typeof document !== 'undefined') boot();
