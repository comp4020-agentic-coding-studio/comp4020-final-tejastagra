// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
// Property tests P1 to P13 from spec/CHECKS.md, using random games played through the engine.
import fc from "fast-check";
import { describe, it } from "vitest";
import {
  COLUMNS,
  MIN_ROWS,
  ROWS,
  isEarthquake,
  newGame,
  resolveRound,
  rowsAt,
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

// Most random games end in a win before the board starts to shrink (R61, R62), so these games
// are mostly crashes in the same column: rubble breaks every line, and the game runs on past round 28
// (the ceiling drops after rounds 12 and 20). They are what makes the ceiling properties see drops at all.
const crashIntent = fc.record({ a: fc.nat({ max: COLUMNS - 1 }), b: fc.option(fc.nat({ max: COLUMNS - 1 }), { nil: null }) });
const longIntents = fc.array(crashIntent, { minLength: 35, maxLength: 80 }).map((rounds) =>
  rounds.map(({ a, b }) => ({ a: { column: a, shield: false }, b: { column: b ?? a, shield: false } })),
);

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

// Whether the ceiling dropped in a round, worked out from the two states alone (so it also checks the engine's own flag).
const droppedIn = (before: GameState, after: GameState) => after.rows < before.rows;
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
          if (quaked(choices) || droppedIn(before, after)) return; // an earthquake or a ceiling drop also removes pieces
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
            // Without a ceiling drop nothing changes at all. A drop removes pieces (R61) but never
            // moves one: what stays is where it was.
            const kept = droppedIn(before, after) ? Math.min(column.length, after.board[c].length) : column.length;
            if (!droppedIn(before, after) && after.board[c].length < column.length) throw new Error("a piece vanished without a ceiling drop");
            if (!column.slice(0, kept).every((cell, row) => after.board[c][row] === cell)) throw new Error("a piece moved");
          });
        });
      }),
    );
  });

  it("P8 (R56, R57) an earthquake round leaves the piece count at: before, minus the bottom row, plus the discs dropped", () => {
    fc.assert(
      fc.property(intents, (rounds) => {
        play(rounds, (before, choices, after) => {
          if (!quaked(choices) || droppedIn(before, after)) return; // a ceiling drop also removes pieces: P11 covers it
          // R67: the bottom row is removed, one piece from every column that has any.
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
            // A ceiling drop only ever removes pieces from the top of a column, so what is left must still
            // be where an earthquake alone would have put it.
            const left = after.board[c];
            const expected = column.slice(shift);
            const kept = droppedIn(before, after) ? Math.min(expected.length, left.length) : expected.length;
            expected.slice(0, kept).forEach((cell, row) => {
              if (left[row] !== cell) throw new Error("a piece moved by the wrong amount");
            });
          });
        });
      }),
    );
  });

  it("P11 (R61, R64) no piece ever sits above the current rows, and a column never holds more than the current rows", () => {
    const check = (_before: GameState, _choices: unknown, after: GameState) => {
      after.board.forEach((column, c) => {
        if (column.length > after.rows) throw new Error(`column ${c} holds more than ${after.rows}`);
      });
      if (after.board.length !== COLUMNS) throw new Error("the number of columns changed");
    };
    fc.assert(fc.property(longIntents, (rounds) => void play(rounds, check)));
    fc.assert(fc.property(intents, (rounds) => void play(rounds, check)));
  });

  it("P12 (R61, R64, R69) the rows never grow, never go below 4 and always equal the schedule, and no column ever closes", () => {
    let sawFirstDrop = false;
    let sawSecondDrop = false;
    const check = (before: GameState, _choices: unknown, after: GameState) => {
      if (after.rows > before.rows) throw new Error("the rows grew");
      if (after.rows < MIN_ROWS) throw new Error("fewer than 4 rows");
      if (after.status === "playing" && after.rows !== rowsAt(after.round)) throw new Error("the rows do not match the schedule");
      if ("firstColumn" in after || "lastColumn" in after) throw new Error("a column range exists: the walls are gone");
      if (after.rows === 5 && before.rows === 6) sawFirstDrop = true;
      if (after.rows === 4 && before.rows === 5) sawSecondDrop = true;
    };
    fc.assert(fc.property(longIntents, (rounds) => void play(rounds, check)));
    fc.assert(fc.property(intents, (rounds) => void play(rounds, check)));
    // The generator must really reach both drops, or this property proves nothing.
    if (!sawFirstDrop || !sawSecondDrop) throw new Error("the generated games never reached both ceiling drops");
  });

  it("P12 (R61, R65) the engine's ceilingDropped flag agrees with what changed, and a drop never ends a game in a win", () => {
    fc.assert(
      fc.property(longIntents, (rounds) => {
        let state = newGame();
        for (const round of rounds) {
          if (state.status !== "playing") break;
          const result = resolveRound(state, { A: legal(state, "A", round.a), B: legal(state, "B", round.b) });
          const dropped = result.state.rows < state.rows;
          if (result.ceilingDropped !== dropped) throw new Error("ceilingDropped disagrees");
          if (dropped && result.state.status === "won") throw new Error("a drop round ended in a win"); // R65
          state = result.state;
        }
      }),
    );
  });

  it("P13 (R61) a win stays possible for the whole game: a vertical four fits at the floor", () => {
    fc.assert(
      fc.property(fc.integer({ min: 12, max: 120 }), fc.integer({ min: 0, max: COLUMNS - 1 }), (round, column) => {
        const state = { ...newGame(), round, rows: rowsAt(round) };
        state.board[column] = ["A", "A", "A"];
        const other = (column + 1) % COLUMNS;
        const result = resolveRound(state, { A: { column, shield: false }, B: { column: other, shield: false } });
        if (result.state.winner !== "A") throw new Error("a vertical four did not win at the floor");
      }),
    );
  });
});
