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
import { todayKey, seedForDay, readDaily, writeDaily } from './daily.js';
import { isBlockedName } from './denylist.js';
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
  renderScoreboardScreen,
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
// The daily's date, captured when the game starts. Never re-read mid-game: a player
// crossing Eastern midnight must keep the puzzle they began.
let dailyDay = null;
// Today's leading score, shown on the masthead scoreboard. Null until it arrives.
let topScore = null;
const failedIds = [];

const $ = (id) => document.getElementById(id);

function opponentView(s) {
  return s.opponent ? { name: s.opponent.name, score: s.botScore, margin: s.margin } : null;
}

function modeLabel(s) {
  if (dailyDay) return 'Daily Special';
  return s.opponent ? `vs ${s.opponent.name}` : 'Classic';
}

function teamShort(code) {
  return shortTeamName(roster.teamNames[code]);
}

/* ---------- Mode select ---------- */

function dailyState() {
  const record = readDaily();
  return record && record.day === todayKey()
    ? { played: true, score: record.score }
    : { played: false, score: null };
}

function showModeSelect({ keepFocus = false } = {}) {
  const focusedMode = keepFocus ? document.activeElement?.dataset?.mode : null;
  screen = 'select';
  session = null;
  app.innerHTML = renderModeSelect(modeOptions(POLICIES, { failedIds, daily: dailyState() }), {
    topScore,
  });

  for (const button of app.querySelectorAll('button[data-mode]')) {
    button.addEventListener('click', () => {
      // A daily already played opens the board instead of starting a second run.
      if (button.dataset.mode === 'daily' && dailyState().played) {
        showScoreboard();
        return;
      }
      startGame(button.dataset.mode);
    });
  }
  $('scoreboard')?.addEventListener('click', () => showScoreboard());
  const target =
    (focusedMode && app.querySelector(`button[data-mode="${focusedMode}"]:not(:disabled)`)) ||
    app.querySelector('button[data-mode]:not(:disabled)');
  target?.focus();
}

/* ---------- Game ---------- */

function startGame(id) {
  modeId = id;
  const daily = id === 'daily';
  dailyDay = daily ? todayKey() : null;
  const opponent = daily || id === 'classic' ? null : getPolicy(id);
  session = createSession({ roster, opponent, seed: daily ? seedForDay(dailyDay) : randomSeed() });
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

  const day = dailyDay;
  refreshLeaderboard({ day }, null);

  let saved = false;
  $('save-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saved) return;

    // Checked before the form is disabled, so a rejected name can be corrected.
    const name = cleanName($('player-name').value);
    if (isBlockedName(name)) {
      $('save-error').textContent = 'Pick a different name.';
      return;
    }
    $('save-error').textContent = '';

    saved = true;
    for (const control of $('save-form').elements) control.disabled = true;

    const row = await saveScore({ name, score: finished.youScore, seed: finished.seed, day });
    if (day) writeDaily({ day, score: finished.youScore, name, id: row?.id ?? null });
    await refreshLeaderboard({ day }, row?.id ?? null);
    $('play-again')?.focus();
  });
  $('play-again').addEventListener('click', () => startGame(mode));
  $('change-mode').addEventListener('click', () => showModeSelect());
  $('player-name').focus();
}

async function refreshLeaderboard({ day = null } = {}, highlightId) {
  const scores = await topScores({ day, limit: 10 });
  const board = $('leaderboard');
  // The player may have already left for another screen.
  if (board) board.innerHTML = renderLeaderboard(scores, { highlightId });
}

async function showScoreboard() {
  const day = todayKey();
  const record = readDaily();
  screen = 'scoreboard';
  const [today, allTime] = await Promise.all([
    topScores({ day, limit: 10 }),
    topScores({ limit: 10 }),
  ]);
  const highlightId = record?.id ?? null;
  app.innerHTML = renderScoreboardScreen({
    dayKey: day,
    yourScore: record?.day === day ? record.score : null,
    todayHtml: renderLeaderboard(today, { highlightId, title: 'Today' }),
    allTimeHtml: renderLeaderboard(allTime, { highlightId, title: 'All time' }),
  });
  $('back-to-modes').addEventListener('click', () => showModeSelect());
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

  // Today's leader feeds the masthead scoreboard. Deliberately not awaited -- the menu
  // must render without waiting on the network, and topScores already degrades to [].
  topScores({ day: todayKey(), limit: 1 })
    .then((rows) => {
      topScore = rows[0]?.score ?? null;
      if (screen === 'select') showModeSelect({ keepFocus: true });
    })
    .catch(() => {});

  try {
    roster = await fetchRoster('data/nfl_qbs.json');
  } catch {
    app.innerHTML = '<p class="boot is-error">Could not load the rosters. Refresh to try again.</p>';
    return;
  }
  showModeSelect();
}

if (typeof document !== 'undefined') boot();
