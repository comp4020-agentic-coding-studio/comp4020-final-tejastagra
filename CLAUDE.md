# Your harness

Rules for how the agent works in this repo, written from how this week's
build actually went (and edited by me — see the file's own note below).

- **Never report something as working without having run it.** This
  session's real bugs (a TypeScript constructor shorthand Node's type
  stripping doesn't support, a test that raced its own WebSocket listener,
  a deploy warning that looked alarming but wasn't) were all caught by
  actually running the thing, not by reading the code and judging it correct.
  Keep doing that: start the app, hit the real endpoints, open a real socket.
- **Don't trust a tool's first-pass warning or success message as the final
  word.** `flyctl deploy` printed a scary "not listening on 0.0.0.0:8080"
  warning for an app that was, a few seconds later, actually fine — the only
  way to know which was true was to curl the live URL ourselves. The
  opposite failure mode is just as real: don't call something shipped because
  a command exited 0.
- **Test the exact artifact that will be judged**, not a convenient proxy.
  `pnpm check` ran three ways before being trusted: directly against
  `node src/server.ts`, against the built Docker image run the way CI runs it
  (`docker run --tmpfs /data`), and against the live Fly deployment. A green
  local run that was never checked against the deployed app isn't evidence.
- **Don't fabricate reflective or personal content.** `reflections/*.md`
  and anything claiming "what I read/tested/compared" has to be genuinely
  mine. When that kind of input is needed, ask me for it rather than writing
  something plausible-sounding in my voice.
- **Commit as the work happens, in units that tell the story**, not as one
  squash at the end — small enough that `PROCESS.md`'s commit links actually
  mean something.
- **Keep the repo private until I say to ship it.** Flipping visibility or
  touching deploy secrets is a deliberate, asked-first action, not a default.
