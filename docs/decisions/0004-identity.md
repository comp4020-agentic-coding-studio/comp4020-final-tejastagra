# 0004. How players are told apart

- **Status:** Proposed
- **Decided by:** Tejas

## Context

The brief needs the app to tell people apart. The leaderboard needs identities that last. Markers arrive with only the URL, so starting must take seconds.

## Options

1. **Guests only:** a nickname and a long-lived cookie. Fastest. Cost: clearing cookies loses your history.
2. **Accounts only:** username and password. Lasting identity. Cost: a sign-up wall before anyone can play.
3. **Guests by default with optional accounts.** Anyone plays in seconds; anyone who cares can keep their record.

## Decision

Proposed: option 3 (rules R28 to R31). A marker in two incognito windows is two different guests, which is exactly what the multi-user test needs.

## What it costs

Two identity paths to build and test, password storage to get right (R30) and an upgrade path from guest to account (R29).

## Evidence

To be added.
