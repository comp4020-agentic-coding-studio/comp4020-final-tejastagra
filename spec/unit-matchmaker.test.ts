import { describe, expect, it } from "vitest";
import { createMatchmaker } from "../src/server/matchmaker.ts";

function make(now = () => 0) {
  let n = 0;
  return createMatchmaker({ makeGame: () => `G${++n}`, now, staleMs: 1000 });
}

describe("L4 (R35) quick match pairing", () => {
  it("L4 (R35) pairs the next arrival with the waiting player", () => {
    const m = make();
    expect(m.join("a")).toEqual({ state: "waiting" });
    expect(m.join("b")).toEqual({ state: "matched", code: "G1" });
    expect(m.status("a")).toEqual({ state: "matched", code: "G1" });
    expect(m.status("a")).toEqual({ state: "matched", code: "G1" }); // a lost response can be re-read
  });

  it("R35 matched results expire, so the map does not grow for ever", () => {
    let t = 0;
    const m = createMatchmaker({ makeGame: () => "G", now: () => t, staleMs: 1000, resultMs: 5000 });
    m.join("a");
    m.join("b");
    t = 6000;
    expect(m.status("a")).toEqual({ state: "unknown" });
    expect(m.status("b")).toEqual({ state: "unknown" });
  });

  it("L4 (R35) 20 arrivals make exactly 10 games and each ticket is in exactly one", () => {
    const m = make();
    const tickets = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const codes = new Map<string, string>();
    for (const t of tickets) {
      const r = m.join(t);
      if (r.state === "matched") codes.set(t, r.code);
    }
    for (const t of tickets) {
      const r = m.status(t);
      if (r.state === "matched") codes.set(t, r.code);
    }
    expect(codes.size).toBe(20);
    const perGame = new Map<string, number>();
    for (const code of codes.values()) perGame.set(code, (perGame.get(code) ?? 0) + 1);
    expect(perGame.size).toBe(10);
    for (const count of perGame.values()) expect(count).toBe(2);
  });

  it("R35 the same ticket joining twice is never paired with itself", () => {
    const m = make();
    m.join("a");
    expect(m.join("a")).toEqual({ state: "waiting" });
  });

  it("R35 a waiting player who stopped polling is not paired with a new arrival", () => {
    let t = 0;
    const m = make(() => t);
    m.join("a");
    t = 5000;
    expect(m.join("b")).toEqual({ state: "waiting" });
    expect(m.status("a")).toEqual({ state: "unknown" });
  });

  it("R35 leaving removes the ticket from the queue", () => {
    const m = make();
    m.join("a");
    m.leave("a");
    expect(m.join("b")).toEqual({ state: "waiting" });
  });
});

describe("R35 a player who leaves the Quick match screen is never paired afterwards", () => {
  it("R35 a ticket that left is not paired with the next arrival, which waits instead", () => {
    const m = make();
    m.join("a");
    m.leave("a"); // Home, the back button or a closed tab tells the server
    expect(m.join("b")).toEqual({ state: "waiting" });
    expect(m.status("a")).toEqual({ state: "unknown" });
    expect(m.status("b")).toEqual({ state: "waiting" });
  });

  it("R35 a ticket that left cannot be matched later by polling or by a repeated join of another", () => {
    const m = make();
    m.join("a");
    m.leave("a");
    m.leave("a"); // leaving twice changes nothing
    expect(m.join("b")).toEqual({ state: "waiting" });
    expect(m.join("c")).toEqual({ state: "matched", code: "G1" }); // b and c meet; a never did
    expect(m.status("a")).toEqual({ state: "unknown" });
  });

  it("R35 a ticket whose page was closed without telling the server is forgotten after the stale time", () => {
    let t = 0;
    const m = make(() => t);
    m.join("a");
    t = 1500; // staleMs is 1000 here; the real one is 10 seconds
    expect(m.join("b")).toEqual({ state: "waiting" });
  });
});
