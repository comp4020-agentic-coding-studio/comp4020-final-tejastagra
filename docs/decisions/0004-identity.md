# 0004. How players are told apart

- **Status:** Accepted (default, pending Tejas's review)
- **Decided by:** Tejas

## Context

The brief needs the app to tell people apart. The leaderboard needs identities that last. Markers arrive with only the URL, so starting must take seconds.

## Options

1. **Guests only:** a nickname and a long-lived cookie. Fastest. Cost: clearing cookies loses your history.
2. **Accounts only:** username and password. Lasting identity. Cost: a sign-up wall before anyone can play.
3. **Guests by default with optional accounts.** Anyone plays in seconds; anyone who cares can keep their record.

## Decision

Option 3 (rules R28 to R31). A marker in two incognito windows is two different guests, which is exactly what the multi-user test needs.

## What it costs

Two identity paths to build and test, password storage to get right (R30) and an upgrade path from guest to account (R29).

## Implementation notes

- A taken username is reported as taken at sign-up (R29 requires uniqueness, so this is visible by design). Sign-in gives one message for a wrong username or a wrong password and does the same work for both.
- Signing up upgrades the guest in place, keeping the player id. Another browser holding the same guest cookie keeps that player, now an account, with no password of its own, so it is signed in as that account until its session expires or the owner signs out there. Accepted for now: a guest cookie is the guest's identity (R28), and an account created from it is the same person.
- Sessions expire after one year on the server as well as in the cookie, and are purged every six hours. Sign-in and sign-up are limited to 60 a minute per address, guest creation to 30.
- Identity requests must send `application/json`, which a cross-site form cannot, on top of `SameSite=Lax`.

## Evidence

To be added.
