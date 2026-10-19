# Taskflow

A small, shared task tracker for a group that wants one honest list of
what's left to do — a household, a small team, a group project — rather than
a message thread where "did you do the thing" gets asked three times. Anyone
with the link sees the same board, live, whether they're the one who added a
task or the one who's about to finish it.

## The problem it solves

Shared task lists fail in one of two ways: either everyone keeps their own
copy and they drift apart, or there's one shared doc and it's stale the
moment you look away from it. Taskflow's whole premise is that "shared" and
"live" have to be the same thing — the board you're looking at right now is
the board everyone else is looking at right now, not a snapshot from whenever
you last reloaded.

## What "good" means here

Good, for this app, means:

- **Nothing a person does gets lost without them knowing.** If two people act
  on the same task at once, the loser of that race sees that it happened,
  rather than clicking "complete" and having it silently reopen later. This
  is the decision in [`docs/adr/0001-concurrent-task-updates.md`](docs/adr/0001-concurrent-task-updates.md).
- **The interface never lies about its own state.** A real connection
  indicator, a real loading state, a real error state — not three different
  flavours of "looks fine" when something isn't.
- **It's usable with a keyboard and a screen reader, not just a mouse.**
  Every control has a label; the task list and error banner are
  live-announced regions.
- **Small is a feature.** No accounts, no notifications, no room directory
  or room management — the brief explicitly asks for this restraint, and a
  smaller surface is also less that can silently break under the one-second
  realtime target. A board does live at a specific URL (`?room=<id>`, see
  [`docs/adr/0003-rooms.md`](docs/adr/0003-rooms.md)) rather than there being
  exactly one global board, but the restraint is the same: no creation step,
  no list to browse, nothing to manage — a room exists the moment someone
  links it, same as the whole app already worked by link alone.

## What actually went into deciding that

This was built under this week's crit deadline, so the research behind it is
honest but modest: it's grounded in the course's own brief and spec for crit
9 (the realtime requirement, the concurrency-decision requirement), in
reading the trade-offs of optimistic-concurrency vs. last-write-wins
(summarised with sources in the ADR), and in manually driving the app myself
across two browser tabs to see what actually happens when a task is created,
completed, reopened and deleted by one tab while the other is open — not a
formal user study, just the smallest test that tells you whether "real-time"
is actually true. I did not run external user research or usability testing;
if you want that honestly reflected as a limitation, it is one.

## Core experience

- Add a task (title, optional description).
- Mark it complete or reopen it.
- Delete it, with a confirmation first.
- Filter by All / Active / Completed.
- See when it was created, and whether it's done.
- Every one of the above, on every open session, within about a second — no
  reload, anywhere.
- Close your laptop, come back tomorrow: the board is exactly as you left it.
