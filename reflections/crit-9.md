# Crit 9 reflection

I started this later than I should have. Crit 9's cutoff was 12pm today, and
I hadn't touched this repo before this morning. I'd rather say that plainly
than write around it.

The real breakthrough wasn't a design idea — it was realising how much
"looks done" isn't actually done. The server failed on its first run because
of a TypeScript constructor shorthand that Node doesn't support when you run
`.ts` files directly without a build step. Then one of my own tests started
timing out, not because the realtime sync was broken, but because I'd
attached the test's listener a moment too late and it missed the message. And
when I deployed, Fly printed a warning that the app wasn't listening on the
right port — for a minute I thought something had actually broken, until
checking the live URL directly showed it was fine; the warning had just fired
before the app finished starting. None of these would have surfaced if I'd
stopped at "it compiled" or "the command exited 0."

What that changed for me is how I define "done." I used to treat it as the
code looking right and running once. Now I think it means actually checking
the deployed version — not localhost, not my assumption of what it does —
and confirming it behaves the way I claim it does. That's a habit I should
have had from week one, not one I was forced into an hour before a cutoff.

The honest cost of starting this late is that it left no room for error, and
I know that's on me going into the next crit.
