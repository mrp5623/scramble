/**
 * Headless Scramble game. A direct port of experiments/sim/scramble_sim.py.
 *
 * Knows nothing about the DOM. In vs-bot modes the player and the bot each get
 * their own instance over the SAME teamSequence, with independent `used` sets.
 */
import { createRng } from './rng.js';

export const NUM_ROUNDS = 25;

export function createGame({ roster, rounds = NUM_ROUNDS, seed = null, teamSequence = null }) {
  let sequence = teamSequence;
  if (!sequence) {
    const rng = createRng(seed ?? 0);
    sequence = Array.from({ length: rounds }, () => rng.choice(roster.teamCodes));
  }

  return {
    roster,
    seed,
    rounds: sequence.length,
    teamSequence: sequence,
    turn: 0,
    used: new Set(),
    totalScore: 0,

    get done() {
      return this.turn >= this.rounds;
    },

    get currentTeam() {
      return this.done ? null : this.teamSequence[this.turn];
    },

    turnsRemaining() {
      return this.rounds - this.turn;
    },

    availableFor(code) {
      return roster.teamQbs[code].filter((q) => !this.used.has(q));
    },

    available() {
      return this.currentTeam === null ? [] : this.availableFor(this.currentTeam);
    },

    step(pick) {
      let reward = 0;
      const team = this.currentTeam;
      const eligible =
        pick != null && !this.used.has(pick) && roster.qbTeams.get(pick)?.has(team);
      if (eligible) {
        reward = roster.qbYards[pick];
        this.used.add(pick);
        this.totalScore += reward;
      }
      this.turn += 1;
      return { reward, done: this.done };
    },
  };
}
