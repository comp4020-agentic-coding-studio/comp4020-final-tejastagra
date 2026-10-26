// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
// Property tests P1 to P7 from spec/CHECKS.md, using random games played through the engine.
import fc from "fast-check";
import { describe, it } from "vitest";
import {
  COLUMNS,
  ROWS,
  newGame,
  resolveRound,
  validateChoice,
  type Choice,
  type GameState,
  type Player,
} from "../src/engine/index.ts";

const intent = fc.record({
  a: fc.option(fc.record({ column: fc.integer({ min: 0, max: COLUMNS - 1 }), shield: fc.boolean() }), {
    nil: null,
  }),
  b: fc.option(fc.record({ column: fc.integer({ min: 0, max: COLUMNS - 1 }), shield: fc.boolean() }), {
    nil: null,
  }),
});
const intents = fc.array(intent, { minLength: 0, maxLength: 60 });

// Turn a random intent into choices the engine accepts, so every round can be played.
function legal(state: GameState, player: Player, choice: Choice | null): Choice | null {
  if (!choice) return null;
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

const pieces = (state: GameState) => state.board.reduce((sum, column) => sum + column.length, 0);

describe("engine properties", () => {
  it("P1 (R5 to R10) each round adds exactly 2, 1 or 0 pieces, as the choices dictate", () => {
    fc.assert(
      fc.property(intents, (rounds) => {
        play(rounds, (before, choices, after) => {
          const { A, B } = choices;
          const expected = A && B ? (A.column === B.column ? 1 : 2) : A || B ? 1 : 0;
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
            const used = choices[player]?.shield === true;
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

  it("P7 (R12) pieces never move or change", () => {
    fc.assert(
      fc.property(intents, (rounds) => {
        play(rounds, (before, _choices, after) => {
          before.board.forEach((column, c) => {
            if (!column.every((cell, row) => after.board[c][row] === cell)) throw new Error("a piece moved");
          });
        });
      }),
    );
  });
});
