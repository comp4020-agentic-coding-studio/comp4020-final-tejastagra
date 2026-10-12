# Crit 9 reflection

**The breakthrough.** The moment that actually moved things forward wasn't a
design idea, it was watching the agent refuse to treat "I wrote the code" as
the same thing as "it works." Three times this session a claim that looked
fine on paper turned out to be wrong the moment it was actually run: a
constructor shorthand that Node's type stripping doesn't support, a test that
raced its own WebSocket listener and would have quietly stayed broken if I'd
trusted the first failure message instead of digging in, and a deploy warning
that turned out to be a false alarm only because we checked the live endpoint
ourselves instead of taking the CLI's word for it. None of those would have
surfaced if "looks right" had been the bar. Seeing each one caught — by
actually running the app, hitting the real API, opening a real WebSocket
against the real deployed URL — was the breakthrough: not a feature, a
standard.

**What it changed.** I came into this session later than I should have —
crit 8's work never happened in this repo, and crit 9 got built in the hours
before its own cutoff. That's on me, not the tooling. But it reframed what I
want "shipped" to mean going forward: not "the agent said it's done," but "I
watched it prove that, against the real thing, including the real deployment,
not a mock of it." Going forward I want to build that verification step into
how I work by default, early in a project rather than as a scramble before a
deadline — check the claim against reality before believing it, and leave
enough time that checking is still possible.
