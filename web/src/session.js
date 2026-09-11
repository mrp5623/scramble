/**
 * One game in progress: the player's engine, the opponent's engine, and the ledger.
 *
 * Owns the round rules from spec section 6 so they can be tested without a browser.
 * Attempts are unlimited; only a matched quarterback or an explicit skip ends a turn;
 * the opponent answers only after the player's turn ends. The player and opponent each
 * get their own engine over the SAME team sequence, with independent `used` sets.
 */
import { createGame } from './engine.js';
import { createRng } from './rng.js';
import { resolveAnswer } from './match.js';

// Mixed into the game seed to derive the opponent's random stream, so replaying a
// seed also replays Carl's sampled futures.
const OPPONENT_STREAM = 0x9e3779b9;

export function createSession({ roster, opponent = null, seed = null, teamSequence = null }) {
  if (opponent && !opponent.ready) {
    throw new Error(`${opponent.name} is not ready to play yet`);
  }

  const you = createGame({ roster, seed, teamSequence });
  const bot = opponent ? createGame({ roster, teamSequence: you.teamSequence }) : null;
  const rng = createRng(((seed ?? 0) ^ OPPONENT_STREAM) >>> 0);
  const ledger = [];

  function endTurn(pick) {
    const round = you.turn + 1;
    const team = you.currentTeam;
    const youYards = you.step(pick).reward;

    let botPick = null;
    let botYards = null;
    if (bot) {
      botPick = opponent.pick(bot, rng);
      botYards = bot.step(botPick).reward;
    }

    const row = Object.freeze({
      round,
      team,
      youPick: pick,
      youYards,
      botPick,
      botYards,
      delta: bot ? youYards - botYards : null,
    });
    ledger.unshift(row);
    return row;
  }

  return {
    seed,
    rounds: you.rounds,
    opponent,
    /** Completed rounds, newest first. A copy: the session's own history cannot be edited from outside. */
    get ledger() {
      return ledger.slice();
    },

    get done() {
      return you.done;
    },
    get currentTeam() {
      return you.currentTeam;
    },
    get round() {
      return Math.min(you.turn + 1, you.rounds);
    },
    get youScore() {
      return you.totalScore;
    },
    get botScore() {
      return bot ? bot.totalScore : null;
    },
    get margin() {
      return bot ? you.totalScore - bot.totalScore : null;
    },
    /** True while the current team has no quarterbacks left to name. */
    get stuck() {
      return !you.done && you.available().length === 0;
    },

    submit(input) {
      if (you.done) return { kind: 'ignored' };
      const result = resolveAnswer(you, input);
      if (result.status !== 'ok') {
        return { kind: 'rejected', status: result.status, qb: result.qb ?? null };
      }
      return { kind: 'accepted', qb: result.qb, yards: result.yards, row: endTurn(result.qb) };
    },

    skip() {
      if (you.done) return { kind: 'ignored' };
      return { kind: 'skipped', row: endTurn(null) };
    },
  };
}
