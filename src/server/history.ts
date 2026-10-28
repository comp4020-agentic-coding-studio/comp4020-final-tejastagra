// Per-player stats and match history (R90, R91), read from the saved games, so they survive sessions, restarts and redeploys.
// Nothing here returns another player's id, a seat token or anything about a choice (R22).
import type { Db } from "./db.ts";
import { publicPlayer } from "./identity.ts";

export interface Record {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number | null; // a whole percentage of wins over finished games, or null when there are none (R90)
}

export interface HistoryRow {
  code: string;
  opponent: string; // a name and tag, or "Computer"
  result: "Won" | "Lost" | "Draw" | "Forfeit won" | "Forfeit lost" | "Abandoned";
  rounds: number;
  endedAt: number; // milliseconds since 1970
}

export interface History {
  stats: { people: Record; computer: Record };
  history: HistoryRow[];
}

const empty = (): Record => ({ played: 0, wins: 0, losses: 0, draws: 0, winRate: null });

export const HISTORY_LENGTH = 20; // R91

export function historyFor(db: Db, playerId: string, _now: number): History {
  const people = empty();
  const computer = empty();
  const rows: HistoryRow[] = [];
  const nameOf = (id: string | null): string => {
    const row = id ? db.playerById(id) : undefined;
    return row ? publicPlayer(row).displayName : "Another player";
  };
  for (const g of db.loadGamesOf(playerId)) {
    const seat = g.playerA === playerId ? "A" : g.playerB === playerId ? "B" : null;
    if (!seat) continue;
    const finishedByLine = g.state.status !== "playing";
    const ended = g.ended;
    if (!finishedByLine && !ended) continue; // still being played: not shown (R91)
    const abandoned = ended?.result === "abandoned";
    const winner = ended?.result === "forfeit" ? ended.winner : g.state.winner;
    let result: HistoryRow["result"];
    if (abandoned) result = "Abandoned";
    else if (ended?.result === "forfeit") result = winner === seat ? "Forfeit won" : "Forfeit lost";
    else if (g.state.status === "draw") result = "Draw";
    else result = winner === seat ? "Won" : "Lost";
    if (!abandoned) {
      const record = g.vsComputer ? computer : people;
      record.played++;
      if (result === "Won" || result === "Forfeit won") record.wins++;
      else if (result === "Draw") record.draws++;
      else record.losses++;
    }
    rows.push({
      code: g.code,
      opponent: g.vsComputer ? "Computer" : nameOf(seat === "A" ? g.playerB : g.playerA),
      result,
      rounds: g.state.round,
      endedAt: g.updatedAt,
    });
  }
  for (const record of [people, computer]) record.winRate = record.played === 0 ? null : Math.round((record.wins / record.played) * 100);
  rows.sort((a, b) => b.endedAt - a.endedAt || (a.code < b.code ? 1 : -1));
  return { stats: { people, computer }, history: rows.slice(0, HISTORY_LENGTH) };
}
