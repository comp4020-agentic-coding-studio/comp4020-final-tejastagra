# Your harness

Rules for how the agent works in this repo, chosen from how this session's
build actually went.

- **Never report something as working without having run it.** Every real
  bug this session hit (a TypeScript constructor shorthand Node's type
  stripping doesn't support, a global primary key that broke forking, a
  test that raced the server's own snapshot message) was caught by actually
  running the server and the test suite, not by reading the code and
  judging it correct. Keep doing that — start the app, curl the real
  endpoints, open a real WebSocket, before writing a result down anywhere.
- **Test the exact artifact that will be judged.** `pnpm check` should be
  run against a locally running `node src/server.ts` first, and again
  against the built Docker image the way CI builds it, and again against
  the live Fly deployment once one exists. A green local run that was never
  checked against the deployed app isn't evidence of a working deploy.
- **Don't trust a tool's first success message as the final word.** A
  `flyctl deploy` exiting 0, or a background process starting without an
  immediate error, isn't the same as the thing actually serving traffic —
  confirm with a real HTTP request to the live URL.
- **Don't fabricate reflective or personal content.** `reflections/*.md`
  and anything describing what was tested, read, or observed has to
  describe something that actually happened in this session. Where genuine
  human input is needed (what a crit felt like, tutor feedback, peer
  observations that didn't happen in an agent session), say plainly that it
  isn't available rather than writing something plausible-sounding.
- **Commit in units that tell the story**, as the work happens, not as one
  squash at the end — small enough that `PROCESS.md`'s commit links mean
  something, and `docs/agent-progress.md` stays an accurate resume point if
  the session is interrupted.
- **Keep the repo private until told to ship it.** Flipping GitHub
  visibility or touching deploy secrets is a deliberate, asked-first action.
- **Never log cookies, session tokens, or raw high-frequency pointer
  movement.** Structured logs carry a pseudonymous user id, a branch id,
  and an outcome — not the identity cookie's value itself, and not every
  cursor position (see `docs/adr/0002-identity-and-permissions.md`).
