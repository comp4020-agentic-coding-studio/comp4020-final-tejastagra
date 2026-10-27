// Unit check: needs no running app. Runs with pnpm check and with pnpm check:fast (vitest.unit.config.ts).
// Property tests P1 to P12 from spec/CHECKS.md, using random games played through the engine.
import fc from "fast-check";
import { describe, it } from "vitest";
import {
  COLUMNS,
  MIN_COLUMNS,
  MIN_ROWS,
  ROWS,
  isEarthquake,
  newGame,
  resolveRound,
  shapeAt,
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
// are mostly crashes in the same column: rubble breaks every line, and the game runs on to round 18
// and beyond. They are what makes the collapse properties see collapses at all.
const crashIntent = fc.record({ a: fc.nat({ max: COLUMNS - 1 }), b: fc.option(fc.nat({ max: COLUMNS - 1 }), { nil: null }) });
const longIntents = fc.array(crashIntent, { minLength: 25, maxLength: 70 }).map((rounds) =>
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

// What a round closed, worked out from the two states alone (so it also checks the engine's own flag).
const collapsedIn = (before: GameState, after: GameState) => after.rows < before.rows || after.firstColumn > before.firstColumn;
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
          if (quaked(choices) || collapsedIn(before, after)) return; // an earthquake or a collapse also removes pieces
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
            // Without a collapse nothing changes at all. A collapse removes pieces (R61, R62) but never
            // moves one: what stays is where it was.
            const kept = collapsedIn(before, after) ? Math.min(column.length, after.board[c].length) : column.length;
            if (!collapsedIn(before, after) && after.board[c].length < column.length) throw new Error("a piece vanished without a collapse");
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
          if (!quaked(choices) || collapsedIn(before, after)) return; // a collapse also removes pieces: P11 covers it
          // R67: only the open area's bottom row is removed (closed columns hold nothing).
          const bottom = before.board.filter((column, c) => c >= before.firstColumn && c <= before.lastColumn && column.length > 0).length;
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
            // A collapse only ever removes a piece from the top of a column or a whole closed column,
            // so what is left must still be where an earthquake alone would have put it.
            const left = after.board[c];
            const expected = column.slice(shift);
            const kept = collapsedIn(before, after) ? Math.min(expected.length, left.length) : expected.length;
            expected.slice(0, kept).forEach((cell, row) => {
              if (left[row] !== cell) throw new Error("a piece moved by the wrong amount");
            });
          });
        });
      }),
    );
  });

  it("P11 (R61 to R64) no piece ever sits outside the open area, and a column never holds more than the current rows", () => {
    const check = (_before: GameState, _choices: unknown, after: GameState) => {
      after.board.forEach((column, c) => {
        const open = c >= after.firstColumn && c <= after.lastColumn;
        if (!open && column.length > 0) throw new Error(`a piece in closed column ${c}`);
        if (column.length > after.rows) throw new Error(`column ${c} holds more than ${after.rows}`);
      });
    };
    fc.assert(fc.property(longIntents, (rounds) => void play(rounds, check)));
    fc.assert(fc.property(intents, (rounds) => void play(rounds, check)));
  });

  it("P12 (R61, R62, R69) the open area never grows, never shrinks below 3 rows or 3 columns and always equals the schedule", () => {
    let sawCeiling = false;
    let sawWalls = false;
    const check = (before: GameState, _choices: unknown, after: GameState) => {
      if (after.rows > before.rows || after.firstColumn < before.firstColumn || after.lastColumn > before.lastColumn) throw new Error("the open area grew");
      if (after.rows < MIN_ROWS) throw new Error("fewer than 3 rows");
      if (after.lastColumn - after.firstColumn + 1 < MIN_COLUMNS) throw new Error("fewer than 3 columns");
      const due = shapeAt(after.round);
      if (after.status === "playing" && (after.rows !== due.rows || after.firstColumn !== due.firstColumn || after.lastColumn !== due.lastColumn)) {
        throw new Error("the open area does not match the schedule");
      }
      if (after.rows < before.rows) sawCeiling = true;
      if (after.firstColumn > before.firstColumn) sawWalls = true;
    };
    fc.assert(fc.property(longIntents, (rounds) => void play(rounds, check)));
    fc.assert(fc.property(intents, (rounds) => void play(rounds, check)));
    // The generator must really reach collapses, or this property proves nothing.
    if (!sawCeiling || !sawWalls) throw new Error("the generated games never reached a ceiling drop and a wall collapse");
  });

  it("P12 (R65) the engine's collapsed flag agrees with what changed, and a collapse never ends a game by itself except as a draw", () => {
    fc.assert(
      fc.property(longIntents, (rounds) => {
        let state = newGame();
        for (const round of rounds) {
          if (state.status !== "playing") break;
          const result = resolveRound(state, { A: legal(state, "A", round.a), B: legal(state, "B", round.b) });
          const closedCeiling = result.state.rows < state.rows;
          const closedWalls = result.state.firstColumn > state.firstColumn;
          if (result.collapsed.ceiling !== closedCeiling || result.collapsed.walls !== closedWalls) throw new Error("collapsed flag disagrees");
          if ((closedCeiling || closedWalls) && result.state.status === "won") {
            // R65: a win in a collapse round came from a dropped disc, so the shape did not change in that round.
            throw new Error("a collapse round ended in a win");
          }
          state = result.state;
        }
      }),
    );
  });
});
