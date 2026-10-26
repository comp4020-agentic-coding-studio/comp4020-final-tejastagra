// A small fixed-window limiter per key (an address), so a public endpoint
// cannot be used to fill memory and disk (docs/rules.md R34 note).
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const windows = new Map<string, { start: number; count: number }>();
  return function allow(key: string): boolean {
    const t = now();
    for (const [k, w] of windows) if (t - w.start >= windowMs) windows.delete(k);
    const w = windows.get(key);
    if (!w) {
      windows.set(key, { start: t, count: 1 });
      return true;
    }
    if (w.count >= limit) return false;
    w.count++;
    return true;
  };
}
