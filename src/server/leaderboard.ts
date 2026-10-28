// The leaderboard rules (R37 to R39), as a pure function over finished games
// so they can be tested without a server. Games against the computer never
// count (R37). Most wins counts wins against another person, forfeits
// included (R38). Fewest rounds to win counts only wins by four in a row
// against a person who made a choice in every round (R39), at the round count
// at the moment of the win (R17). A draw or an abandoned game counts for
// neither list (R19).
import type { Player } from "../engine/index.ts";
import type { Db, SavedGame } from "./db.ts";
import { publicPlayer } from "./identity.ts";

export interface FinishedGame {
  playerA: string | null; // player ids; null when the seat had no identity
  playerB: string | null;
  vsComputer: boolean;
  status: "playing" | "won" | "draw";
  winner: Player | null;
  round: number; // rounds resolved so far, so the round count at a win (R17)
  ended: { result: "forfeit"; winner: Player } | { result: "abandoned" } | null;
  missedA: number; // rounds in which that seat made no choice
  missedB: number;
}

export interface Tally {
  wins: number;
  bestRounds: number | null;
}

export function tally(games: FinishedGame[]): Map<string, Tally> {
  const out = new Map<string, Tally>();
  const entry = (id: string): Tally => {
    let t = out.get(id);
    if (!t) {
      t = { wins: 0, bestRounds: null };
      out.set(id, t);
    }
    return t;
  };
  for (const g of games) {
    if (g.vsComputer) continue; // R37
    if (!g.playerA || !g.playerB || g.playerA === g.playerB) continue; // needs two different people
    if (g.ended?.result === "abandoned") continue; // R19
    if (g.round === 0) continue; // R98: a game that never started is never recorded, so a forfeit before round 1 is no win
    let winner: Player | null = null;
    let byLine = false;
    if (g.ended?.result === "forfeit") {
      winner = g.ended.winner; // R38: forfeits count for most wins
    } else if (g.status === "won" && g.winner) {
      winner = g.winner;
      byLine = true;
    }
    if (!winner) continue; // draws and unfinished games
    const winnerId = winner === "A" ? g.playerA : g.playerB;
    const loserMissed = winner === "A" ? g.missedB : g.missedA;
    entry(winnerId).wins++; // R38
    if (byLine && loserMissed === 0) {
      const t = entry(winnerId); // R39
      t.bestRounds = t.bestRounds === null ? g.round : Math.min(t.bestRounds, g.round);
    }
  }
  return out;
}

export interface BoardRow {
  name: string;
  value: number;
}

export function topWins(tallies: Map<string, Tally>, name: (id: string) => string | null, limit: number): BoardRow[] {
  return [...tallies]
    .filter(([, t]) => t.wins > 0)
    .map(([id, t]) => ({ id, name: name(id), value: t.wins }))
    .filter((r): r is { id: string; name: string; value: number } => r.name !== null)
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(({ name, value }) => ({ name, value }));
}

export function topRounds(tallies: Map<string, Tally>, name: (id: string) => string | null, limit: number): BoardRow[] {
  return [...tallies]
    .filter(([, t]) => t.bestRounds !== null)
    .map(([id, t]) => ({ id, name: name(id), value: t.bestRounds as number }))
    .filter((r): r is { id: string; name: string; value: number } => r.name !== null)
    .sort((a, b) => a.value - b.value || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(({ name, value }) => ({ name, value }));
}

export function finishedFrom(g: SavedGame): FinishedGame {
  return {
    playerA: g.playerA,
    playerB: g.playerB,
    vsComputer: g.vsComputer,
    status: g.state.status,
    winner: g.state.winner,
    round: g.state.round,
    ended: g.ended,
    missedA: g.missedA,
    missedB: g.missedB,
  };
}

// Both lists, read from the saved games so they survive restarts (promise 5).
// Names are the public display names (R31): a guest's short tag, never a full id.
export function leaderboardFrom(db: Db, limit: number, viewerId: string | null = null): { wins: BoardRow[]; rounds: BoardRow[]; you: ViewerRecord | null } {
  const tallies = tally(db.loadGames().map(finishedFrom));
  const name = (id: string) => {
    const row = db.playerById(id);
    return row ? publicPlayer(row).displayName : null;
  };
  return { wins: topWins(tallies, name, limit), rounds: topRounds(tallies, name, limit), you: viewerRecord(tallies, viewerId, name) };
}

// R92: the asking player's own line, from the same tallies as the lists. Their public name (R31), their wins (0 if none) and
// their fewest rounds to win (null if none): no id, and nothing about anyone else.
export interface ViewerRecord {
  name: string;
  wins: number;
  bestRounds: number | null;
}

export function viewerRecord(tallies: Map<string, Tally>, playerId: string | null, name: (id: string) => string | null): ViewerRecord | null {
  if (!playerId) return null;
  const shown = name(playerId);
  if (shown === null) return null;
  const mine = tallies.get(playerId);
  return { name: shown, wins: mine?.wins ?? 0, bestRounds: mine?.bestRounds ?? null };
}
