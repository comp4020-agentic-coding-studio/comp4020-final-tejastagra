# 0013. Password reset by the admin

- **Status:** Accepted (28 October 2026)
- **Decided by:** Tejas (request of 28 October 2026); the details below were chosen from `docs/rules.md` and `docs/design/`

## Context

Accounts are a username and a password (R29, ADR 0004). There is no email address anywhere: a sign-up asks for a username and a password and nothing else. A player who forgets their password therefore has no way back to their record, their name on the leaderboard and their history (promise 5: what happens is kept). Something has to give them a way back without turning Rubble into a service that stores personal details.

## Options

1. **Reset by email.** The usual answer: store an email address, send a link. It needs an email service (a sender, a domain with the right records, a provider account and key), it needs every account to hold an email address that has to be asked for at sign-up, and it makes Rubble a store of personal data it has no other use for. A forgotten password then depends on an email provider being reachable.
2. **Save codes.** Give each account a long recovery code at sign-up that the player keeps. This needs no email, but a code that was not saved cannot be recovered, and people do not save codes. It would fail exactly the person it is for.
3. **The admin resets it, by hand.** The player emails the admin with their username. The admin checks it is really them and runs one command on the server, which sets a random temporary password and shows it once. The player signs in with it and must choose a new one straight away. No email is stored, no extra service is needed, and the cost is that a human has to do it.

## Decision

Option 3, under these rules (R86 to R89 in `docs/rules.md`, the popups in `docs/design/popups.md`, the procedure in `docs/admin.md`):

- **The sign-in popup has a "Forgot your password?" link** that opens a popup saying "Email game@tejastagra.com with your username and we'll reset it for you." Nothing is sent from the app: it only tells the player what to do.
- **The reset is a server command, not an admin web page:** `scripts/admin-reset-password.ts <username>`, run on the machine with `flyctl ssh console`. It sets a random 12-character temporary password from an alphabet with no look-alike characters, stores only its hash, marks the account "must change password", prints the temporary password once on the admin's terminal and logs only that a reset happened and for which username (`admin_reset`). It never logs the password or its hash.
- **A temporary password works once.** Signing in with it opens a popup that cannot be closed or skipped until the player chooses a new password. Until they do, the session can do nothing else with the account, and the temporary password stops working the moment the new one is set (it is simply replaced).
- **An admin web page was considered and rejected.** It would need its own login, its own session handling and a public URL, which is an extra attack surface on the one thing that can take over any account. A command on the server needs no new surface: only someone who can already open a shell on the machine with Fly access can run it.
- **Checking it is the right person is a human step,** written down in `docs/admin.md`. The admin asks for the player's nickname and tag and for the name of an opponent from a recent game, which only the real player is likely to know, and does not reset on a username alone.

## What it costs

- **A person is in the loop.** A reset takes as long as the admin takes to answer, which is fine for a course project and would not scale. If Rubble grew, an email reset would be the right next step, and this decision would be revisited then.
- **The identity check is judgement, not proof.** Someone who knows a username, a nickname and an opponent's name could be reset into an account that is not theirs. The cost of that is one record on a game leaderboard, which is small; the check is a reasonable guard against a casual attempt, not against a determined one.
- **The temporary password is shown on a terminal and sent by the admin to the player** (by reply to their email). It is good for one sign-in and is replaced at once, so a leaked reply is useful to an attacker only if they use it before the player does.
- **Sign-in attempts are limited** (R88) so the temporary password and ordinary passwords cannot be guessed: 5 failed attempts per username in 15 minutes.

## Evidence

Tests in `spec/unit-admin-reset.test.ts` and `spec/app-account.test.ts` for the script, the forced change, the old password stopping, the limit on sign-in attempts and the absence of any password or hash from responses and logs; browser checks in `e2e/account.spec.ts`; the procedure in `docs/admin.md`.
