// Quick match pairing (R35). A player joins with a ticket and polls it. The
// next ticket to arrive is paired with the longest-waiting one, and each
// ticket is paired at most once. Node runs this synchronously, so two
// arrivals "at the same moment" are still handled one after the other.
// A waiting ticket that stops polling (a closed tab) expires, so nobody is
// paired with someone who has gone.
export type TicketStatus = { state: "waiting" } | { state: "matched"; code: string } | { state: "unknown" };

export function createMatchmaker(options: {
  makeGame: () => string;
  staleMs?: number;
  resultMs?: number;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const staleMs = options.staleMs ?? 10_000;
  const resultMs = options.resultMs ?? 120_000;
  const waiting = new Map<string, number>(); // ticket -> last seen
  // ticket -> code and expiry. Kept (not deleted on first read) so a player
  // whose response was lost can still reach their game; it expires so the map
  // cannot grow for ever.
  const matched = new Map<string, { code: string; expires: number }>();

  function dropStale(): void {
    const t = now();
    for (const [ticket, seen] of waiting) if (t - seen > staleMs) waiting.delete(ticket);
    for (const [ticket, m] of matched) if (t > m.expires) matched.delete(ticket);
  }

  return {
    join(ticket: string): TicketStatus {
      dropStale();
      const existing = matched.get(ticket);
      if (existing) return { state: "matched", code: existing.code };
      waiting.delete(ticket);
      const other = waiting.keys().next();
      if (!other.done) {
        waiting.delete(other.value);
        const code = options.makeGame();
        // Only the waiting player needs the result stored: this caller gets
        // it in the response (and can call join again for the same code).
        matched.set(other.value, { code, expires: now() + resultMs });
        matched.set(ticket, { code, expires: now() + resultMs });
        return { state: "matched", code };
      }
      waiting.set(ticket, now());
      return { state: "waiting" };
    },
    status(ticket: string): TicketStatus {
      dropStale();
      const m = matched.get(ticket);
      if (m) return { state: "matched", code: m.code };
      if (waiting.has(ticket)) {
        waiting.set(ticket, now());
        return { state: "waiting" };
      }
      return { state: "unknown" };
    },
    leave(ticket: string): void {
      waiting.delete(ticket);
    },
  };
}
