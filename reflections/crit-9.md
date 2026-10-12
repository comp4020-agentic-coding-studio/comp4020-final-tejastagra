# Crit 9 reflection

Okay, honestly — I started this way too late. Crit 9's cutoff was 12pm today
and I hadn't touched this repo before this morning. That's just true, and I'm
not going to pretend otherwise in the next file either.

The breakthrough wasn't some clever idea, it was getting smacked in the face
by how much stuff "looks done" but isn't. The server crashed on first run
because of a TypeScript thing Node doesn't actually support when you run it
without a build step. Then my own tests were lying to me — they timed out not
because the realtime sync was broken, but because I'd written the test wrong
and it missed the message by a fraction of a second. Then I deployed and Fly
threw a scary warning that the app wasn't listening on the right port, and for
a second I thought I'd broken it — turned out it just checked too early and
the app was actually fine a few seconds later. None of that would've surfaced
if I'd just trusted "it compiled" or "the command exited 0."

What that actually changed for me: I used to think "done" meant the code
looks right and runs once. Now I think done means you've actually gone and
poked the real thing — the deployed thing, not localhost, not your head — and
watched it do what you said it does. That's a cheap habit and I should've
been doing it from week 1, not discovering it an hour before a deadline.

Also, not going to lie, cutting it this close sucked. I don't want to do this
again next week.
