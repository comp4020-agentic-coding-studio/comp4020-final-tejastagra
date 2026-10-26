# Week 12 — OP3

## 3. Justify your chosen design against alternatives

**Design decision:** when two people edit the same object at close to the same
time, the server uses last-write-wins. A `PATCH` always succeeds, overwrites
`x`/`y`/`data`, and bumps `version`. It never rejects a stale write. This is
the decision that felt most arbitrary: a one-line policy that silently throws
away someone's edit.

**Alternatives** (from `docs/adr/0001-realtime-and-conflicts.md`):

| Option | What it would do | Why I didn't choose it |
| --- | --- | --- |
| Optimistic concurrency (version check, 409 + retry) | Rejects a write based on stale data and makes the client retry | Needs client retry and merge UI for a collision the product rarely produces. A person who drags a sticky note gets an error for something they can't act on. |
| CRDT / merge | Merges concurrent edits to the same object | The most machinery, for objects that are strokes and short notes. Two people merging into one stroke isn't a meaningful result. |
| Last-write-wins (chosen) | Whichever write the server processes last stands | Cheapest option, and the failure is visible. The other person's change shows up on screen within about a second. |

**Why last-write-wins holds up against them:**

- The cost of a lost edit is low. It's a shared canvas, not a form with
  financial consequences, and a lost move or text change is easy to redo.
- Collisions are rare. Edits to *different* objects never conflict, because
  each row is independent (the "concurrent edits to different objects" case
  in `spec/realtime.test.ts`). Only the same object edited in the same
  instant is affected.
- It matches the product's values. ADR 0002 makes every mark public with no
  per-object ownership, like a physical wall. A conflict system that
  arbitrates who "owns" an object would work against that.
- The trade-off is stated, not accidental. The ADR lists "can lose one
  person's intermediate state, with no warning" as a consequence.

**What would change my mind:** if the wall gained long-form text editing, or
if two people editing the same note turned out to be common, last-write-wins
would be wrong and I'd move that object type to versioned writes.

**What this doesn't cover:** steps 1 and 2 of OP3 call for exploring
alternatives with a partner and an agent. The comparison above comes from
the ADR written during the agent build sessions. I don't have a record of a
partner discussion, so none is described here. Add it yourself if it
happened.
