// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
// Property tests P1 to P7 from spec/CHECKS.md, using random games played through the engine.
import fc from "fast-check";
import { describe, it } from "vitest";
import {
  COLUMNS,
  ROWS,
  isEarthquake,
  newGame,
  resolveRound,
  validateChoice,
  type Choice,
  type GameState,
  type Player,
} from "../src/engine/index.ts";

const choiceIntent = fc.oneof(
  { weight: 5, arbitrary: fc.record({ column: fc.integer({ min: 0, max: COLUMNS - 1 }), shield: fc.boolean() }) },
  { weight: 2, arbitrary: fc.constant({ earthquake: true as const }) },
);
const intent = fc.record({
  a: fc.option(choiceIntent, { nil: null }),
  b: fc.option(choiceIntent, { nil: null }),
});
const intents = fc.array(intent, { minLength: 0, maxLength: 60 });

// Turn a random intent into choices the engine accepts, so every round can be played.
function legal(state: GameState, player: Player, choice: Choice | null): Choice | null {
  if (!choice) return null;
  if (isEarthquake(choice)) return validateChoice(state, player, choice).ok ? choice : null;
  const withShield = validateChoice(state, player, choice);
  if (withShield.ok) return choice;
  const noShield = { ...choice, shield: false };
  return validateChoice(state, player, noShield).ok ? noShield : null;
}

// Plays the intents until the game ends, calling check for every resolved round.
function play(
  rounds: Array<{ a: Choice | null; b: Choice | null }>,
  check: (before: GameState, choices: { A: Choice | null; B: Choice | null }, after: GameState, outcome: string) => void,
): GameState {
  let state = newGame();
  for (const round of rounds) {
    if (state.status !== "playing") break;
    const choices = { A: legal(state, "A", round.a), B: legal(state, "B", round.b) };
    const result = resolveRound(state, choices);
    check(state, choices, result.state, result.outcome);
    state = result.state;
  }
  return state;
}

const quaked = (choices: { A: Choice | null; B: Choice | null }) =>
  (choices.A !== null && isEarthquake(choices.A)) || (choices.B !== null && isEarthquake(choices.B));
const discsIn = (choices: { A: Choice | null; B: Choice | null }) =>
  [choices.A, choices.B].filter((choice) => choice !== null && !isEarthquake(choice)) as Array<{ column: number; shield: boolean }>;

const pieces = (state: GameState) => state.board.reduce((sum, column) => sum + column.length, 0);

describe("engine properties", () => {
  it("P1 (R5 to R10) a round without an earthquake adds exactly 2, 1 or 0 pieces, as the choices dictate", () => {
    fc.assert(
      fc.property(intents, (rounds) => {
        play(rounds, (before, choices, after) => {
          if (quaked(choices)) return;
          const discs = discsIn(choices);
          const expected = discs.length === 2 ? (discs[0].column === discs[1].column ? 1 : 2) : discs.length;
          if (pieces(after) - pieces(before) !== expected) throw new Error("wrong number of pieces added");
        });
      }),
    );
  });

  it("P2 (R1) no column holds more than 6 pieces", () => {
    fc.assert(
      fc.property(intents, (rounds) => {
        play(rounds, (_before, _choices, after) => {
          if (after.board.some((column) => column.length > ROWS)) throw new Error("column overfull");
        });
      }),
    );
  });

  it("P3 (R8, R9) a shield is spent exactly when used and never comes back", () => {
    fc.assert(
      fc.property(intents, (rounds) => {
        play(rounds, (before, choices, after) => {
          for (const player of ["A", "B"] as const) {
            const choice = choices[player];
            const used = choice !== null && !isEarthquake(choice) && choice.shield;
            if (after.shieldsLeft[player] !== (before.shieldsLeft[player] && !used)) {
              throw new Error(`shield for ${player} wrong`);
            }
          }
        });
      }),
    );
  });

  it("P4 (R11) the round count goes up by exactly 1", () => {
    fc.assert(
      fc.property(intents, (rounds) => {
        play(rounds, (before, _choices, after) => {
          if (after.round !== before.round + 1) throw new Error("round count wrong");
        });
      }),
    );
  });

  it("P5 (R13 to R16) a game is won exactly when it has a winner", () => {
    fc.assert(
      fc.property(intents, (rounds) => {
        play(rounds, (_before, _choices, after) => {
          if ((after.status === "won") !== (after.winner !== null)) throw new Error("status and winner disagree");
          if (after.status === "draw" && after.winner !== null) throw new Error("a draw has a winner");
        });
      }),
    );
  });

  it("P6 (R16) nothing is accepted after the game ends", () => {
    fc.assert(
      fc.property(intents, fc.integer({ min: 0, max: COLUMNS - 1 }), (rounds, column) => {
        const end = play(rounds, () => {});
        if (end.status === "playing") return;
        for (const player of ["A", "B"] as const) {
          const result = validateChoice(end, player, { column, shield: false });
          if (result.ok || result.reason !== "game_over") throw new Error("choice accepted after the end");
        }
        let threw = false;
        try {
          resolveRound(end, { A: { column, shield: false }, B: null });
        } catch {
          threw = true;
        }
        if (!threw) throw new Error("resolveRound accepted a choice after the end");
      }),
    );
  });

  it("P7 (R12) without an earthquake, pieces never move or change", () => {
    fc.assert(
      fc.property(intents, (rounds) => {
        play(rounds, (before, choices, after) => {
          if (quaked(choices)) return;
          before.board.forEach((column, c) => {
            if (!column.every((cell, row) => after.board[c][row] === cell)) throw new Error("a piece moved");
          });
        });
      }),
    );
  });

  it("P8 (R56, R57) an earthquake round leaves the piece count at: before, minus the bottom row, plus the discs dropped", () => {
    fc.assert(
      fc.property(intents, (rounds) => {
        play(rounds, (before, choices, after) => {
          if (!quaked(choices)) return;
          const bottom = before.board.filter((column) => column.length > 0).length;
          if (pieces(after) !== pieces(before) - bottom + discsIn(choices).length) throw new Error("wrong piece count after an earthquake");
          if (after.board.some((column) => column.length > ROWS)) throw new Error("column overfull");
        });
      }),
    );
  });

  it("P9 (R53) each player uses Earthquake at most once, it is spent exactly when used and it is never accepted again", () => {
    fc.assert(
      fc.property(intents, (rounds) => {
        const used = { A: 0, B: 0 };
        const end = play(rounds, (before, choices, after) => {
          for (const player of ["A", "B"] as const) {
            const choice = choices[player];
            const usedNow = choice !== null && isEarthquake(choice);
            if (usedNow) used[player]++;
            if (after.earthquakesLeft[player] !== (before.earthquakesLeft[player] && !usedNow)) throw new Error(`earthquake for ${player} wrong`);
            if (!before.earthquakesLeft[player]) {
              const again = validateChoice(before, player, { earthquake: true });
              if (again.ok || again.reason !== "no_earthquake") throw new Error("a spent earthquake was accepted");
            }
          }
        });
        if (used.A > 1 || used.B > 1) throw new Error("an earthquake was used twice");
        if (end.status === "playing") {
          for (const player of ["A", "B"] as const) if (end.earthquakesLeft[player] !== (used[player] === 0)) throw new Error("earthquakesLeft disagrees with use");
        }
      }),
    );
  });

  it("P10 (R12, R56) existing pieces only ever move down by exactly one row, and only in an earthquake round", () => {
    fc.assert(
      fc.property(intents, (rounds) => {
        play(rounds, (before, choices, after) => {
          const shift = quaked(choices) ? 1 : 0;
          before.board.forEach((column, c) => {
            column.slice(shift).forEach((cell, row) => {
              if (after.board[c][row] !== cell) throw new Error("a piece moved by the wrong amount");
            });
          });
        });
      }),
    );
  });
});
