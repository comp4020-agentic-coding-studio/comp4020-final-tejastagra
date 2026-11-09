# Crit 10 reflection

This week's build happened mostly inside a conversation with my agent rather
than me writing code line by line, so the honest account of my role is
different from crit 8 and 9: I set the goal and the constraints — don't
touch the "no accounts" decision already in the README, use a real
server-side check rather than a client-side one, and log who did what in a
way that outlives the crit — and then checked what came back rather than
writing it from scratch myself.

The part I actually had to think about was the permission decision itself:
what counts as a person, and what one person may do to another's data. That
had already been half-decided by the app's own premise (one shared board,
no accounts), so the real decision was narrower than it first looked —
identity by browser, ownership by creation, enforced server-side. I agreed
with that shape rather than inventing it blind; it's consistent with the
restraint the README already commits to.

The real catch this week was a deploy bug, not a design one: the first
version of the ownership change crashed the live app, because the already-
deployed database didn't have the new columns and `CREATE TABLE IF NOT
EXISTS` doesn't add columns to a table that already exists. That only
showed up because I insisted on running the checks against the actual
deployed URL rather than trusting a green run on a fresh local database —
which is the exact habit crit 9's reflection said I should have had from
week one, and this time I did have it, and it caught a real bug before the
crit rather than during it.

Where I was mostly a check, not a director: the specific shape of the audit
log (one line to stdout, one row in SQLite) and the cookie mechanics were
the agent's implementation choices more than mine. I read and understood
why before accepting them — an `HttpOnly` cookie can't be forged by page
script the way a `localStorage` value could, and that's the property that
actually matters for "checked on the server" — but I didn't independently
derive that from nothing.

What I'd still flag honestly: I haven't yet watched two real Chrome
profiles hit the live app side by side and tried to break the permission
check myself before the crit. The automated test does exercise it with two
independent identities, and the live deploy answers correctly to a manual
curl with two separate cookie jars, but "I ran a test" and "I watched it
happen with my own eyes across two browser windows" are different levels of
confidence, and the crit itself is where the second one gets tested for
real.
