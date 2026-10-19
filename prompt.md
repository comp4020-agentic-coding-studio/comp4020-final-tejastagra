# PROMPT.md --- The Wall: One-Day Autonomous Build Plan

## How to use this prompt

This file is the main working prompt for Claude Code. Read it in full
before making changes. The goal is to make as much verified progress as
possible on The Wall in one focused day, with small tasks, frequent
checkpoints and recovery from timeouts.

**Do not treat this as a request to write a plan and stop.** Inspect the
repository, implement the work, run checks, fix problems, document real
outcomes and deploy when access permits.

The user works through a proxy that sometimes times out. Keep each unit
of work small enough to complete in a short session. Never rely on one
giant uninterrupted agent run. Save progress to the repository so a
fresh Claude session can resume without losing context.

### Critical operating constraints

-   Work in short, independently verifiable tasks. Aim for tasks that
    can usually finish in 5--20 minutes.
-   After every task, update `docs/agent-progress.md` with the current
    phase, completed work, files changed, commands run, results,
    blockers and the exact next task.
-   Commit meaningful, working increments when appropriate. Never
    fabricate or backdate commits.
-   If the session is about to time out, stop starting new work. Finish
    or revert the current incomplete change, write a clear checkpoint
    and leave the repository in a recoverable state.
-   Do not assume you can literally run indefinitely in the background.
    Use supported subagents, parallel tasks or background commands only
    when the current Claude Code environment supports them. Never depend
    on unsupported proxy behaviour.
-   If a background command is started, record how to inspect its status
    and output. Do not leave unknown processes running.
-   Do not claim work continued after a session ended unless the
    environment actually supports that.
-   If a fresh session starts, read this prompt and
    `docs/agent-progress.md` first, inspect `git status` and resume from
    the last verified checkpoint. Do not repeat completed work
    unnecessarily.
-   Do not ask the user to supervise every small decision. Make
    reasonable, reversible choices and record assumptions. Ask only when
    a decision requires user credentials, has significant irreversible
    consequences or cannot safely be inferred.
-   Do not print, commit or ask the user to paste secrets into chat.
-   Do not fabricate test results, deployment success, user feedback,
    source research, past tutorial work or reflections.
-   Prefer a working, assessed core product over optional polish. If
    time is running out, cut stretch features rather than core
    assessment requirements.

------------------------------------------------------------------------

# Part A --- Product brief

## 1. The product

Build **The Wall**, a real-time collaborative creative canvas for the
ANU community.

The product takes the spirit of a student graffiti wall and turns it
into a digital-native space where people can leave creative traces,
draw, write, add images and music links, see other people's cursors,
create things together and fork the canvas into independent creative
branches.

The physical graffiti tunnel is inspiration for the culture of
spontaneous, layered self-expression, **not** the literal interface. The
canvas must be white or warm-white and open-ended. Users' creations
supply the colour and visual density.

### Product in one sentence

A living, open canvas where ANU students can leave creative traces, make
things together in real time and fork the canvas into independent
worlds.

## 2. Design principles

1.  **The canvas is the world.** The main experience is an expansive
    canvas, not a feed, dashboard or set of cards.
2.  **Clean canvas.** Use white or warm-white. No concrete texture,
    brick wall, photorealistic tunnel or pre-made mural background.
3.  **Distinct art direction.** The interface should feel carefully
    art-directed by a strong digital product designer: modular,
    expressive, editorial, playful and considered.
4.  **No generic SaaS template.** Avoid a dashboard sidebar, metric
    cards, excessive rounded cards, generic gradients, glassmorphism
    without purpose and repetitive component-library styling.
5.  **Do not clone Figma.** Learn from spatial collaboration, live
    cursors and direct manipulation, but create a distinct identity.
6.  **Restrained interface chrome.** The artwork is the focus. Tool
    palettes and controls should be compact, contextual and intentional.
7.  **Real presence.** Show real connected users and real cursors. Never
    present fake users or simulated activity as real.
8.  **Forks are independent.** A fork starts from a consistent snapshot.
    Changes never flow to or from its parent, siblings or descendants.
9.  **No engagement competition.** No likes, follower counts,
    leaderboards or popularity rankings.
10. **Privacy by default.** Use anonymous or pseudonymous visitors. Do
    not require student numbers or real names. Do not imply official ANU
    endorsement.
11. **Accessible and robust.** Keyboard access, visible focus, readable
    contrast, reduced-motion consideration and clear loading, empty,
    error and offline states.
12. **Honest evidence.** Implement and test the feature before calling
    it complete.

## 3. Core functionality

Prioritise in this order:

1.  A visitor can open the app and add a text or drawing object.
2.  The object persists after refresh and can be found on a later visit.
3.  Two independent browser sessions receive live updates within about
    one second without reloading.
4.  The server distinguishes users and logs what they do.
5.  Server-side permissions and branch isolation work.
6.  A user can fork a canvas and make independent changes.
7.  Image and supported music/link cards work safely.
8.  Visual polish, branch exploration and optional tools.

### Canvas objects

-   Freehand drawing with a small considered colour and stroke-width
    palette.
-   Editable text.
-   A few simple shapes or stamps.
-   Select, move and delete objects.
-   Image upload with validation and size limits, if feasible within the
    stack.
-   Link or music cards for a small number of supported URL patterns.
    Safe link-out is acceptable. Do not claim universal embed support.

### Real-time behaviour

-   Changes to persistent objects are broadcast to sessions on the same
    branch.
-   Updates normally arrive within about one second without reload.
-   A new user receives the latest persisted snapshot.
-   Presence and cursors are ephemeral, separate from durable canvas
    content and scoped to the current branch.
-   Disconnects clean up stale presence. Reconnecting clients recover
    the latest state.
-   Concurrent edits to different objects must both survive.
-   Choose and document a deterministic same-object conflict policy,
    such as server-accepted last-write-wins. Do not claim stronger
    guarantees than implemented.

### Fork behaviour

-   A fork is a consistent snapshot of the parent's persistent content.
-   Store branch ID, parent branch ID and fork timestamp.
-   Parent edits after the fork do not appear in it.
-   Fork edits do not affect parent, siblings or descendants.
-   Presence and cursors do not cross branch boundaries.
-   Do not implement merging, merge-back or automatic propagation.

------------------------------------------------------------------------

# Part B --- Assessment and retrospective requirements

The student changed direction during the project and is completing
earlier course requirements retrospectively. Complete missing work
honestly in the current repository. Do not backdate commits or pretend
that earlier tasks were completed at the time.

## 4. C8 / Week 9: "It's alive!"

The target was a first deployed version that lets a stranger perform the
core interaction and find their trace when they return.

Required outcomes:

-   The app is deployed at the repository's `*.fly.dev` URL, if
    credentials and account access permit.
-   A stranger can use the core interaction without the developer
    operating the UI for them.
-   A created object persists after refresh and a later visit.
-   `README.md` defines what "good" means for The Wall, with a clear
    audience, principles, limitations and the sources actually
    consulted.
-   `/readme/` publishes the full current README. Verify this over HTTP.
-   `PROCESS.md` explains the stack and the trade-offs.
-   `reflections/crit-8.md` describes what was actually achieved and
    what remains.
-   The repo is public when required and remains public, if the student
    has the required permissions.
-   Commits reflect real work and are not fabricated or backdated.

## 5. C9 / Week 10: "All at once"

Required outcomes:

-   A change in one session reaches all other open sessions on the same
    branch within about one second, without reload under normal
    conditions.
-   The behaviour when several users act at once is documented as an
    architecture decision.
-   The decision considers what is broadcast, presence, simultaneous
    edits, reconnects and returning later.
-   `reflections/crit-9.md` records actual implementation, tests,
    failures and learning.
-   Real-time propagation and concurrency have automated or repeatable
    tests.

Recommended starting approach: server-authoritative persistence,
operation-level updates with stable IDs, same-branch broadcasts, a
documented same-object conflict policy and state restoration on
reconnect.

## 6. C10 / Week 11: "Fly by instruments"

Required outcomes:

-   Two or more users can act on shared state from separate browser
    profiles.
-   The app distinguishes users, for example with stable pseudonymous
    visitor IDs.
-   Server-side permission checks decide what each user may see or
    change.
-   The permission model is documented.
-   Persistent server-side logs show who performed which action and on
    which branch.
-   The logs can be inspected using the course workflow, such as
    `mise exec -- flyctl logs -a <repo>`, where available.
-   At the crit, two users can use the deployed URL in separate Chrome
    profiles while the student narrates from logs without operating the
    app.
-   `reflections/crit-10.md` records real outcomes.

Do not log cookies, session secrets, access tokens or unnecessary
private content.

## 7. Lecture whiteboard task: multi-user testing with Fly logs

Implement the task described by the supplied lecture whiteboard photo.
The key log events are:

-   user connects or joins a room/branch
-   user disconnects or leaves a room/branch
-   server receives an action from a user
-   server broadcasts an update
-   server rejects an action
-   server sends a system-state snapshot to one user

Use structured logs with timestamp, event name, pseudonymous user ID,
branch/room ID, action/object ID where relevant and outcome. Include an
operation or request ID where useful. Avoid logging every pointer
movement if it makes logs unusable.

Create `docs/testing/multi-user-test.md` with the deployment URL,
build/commit tested, test date, browser/profile setup, log commands, a
scenario matrix, actual observations, evidence and pass/fail/blocked
status.

Test these scenarios:

1.  Two users join the same branch.
2.  One user's action appears for the other within about one second.
3.  Simultaneous edits to different objects and conflicts on the same
    object.
4.  A late user joins and receives a state snapshot.
5.  A user leaves and returns.
6.  Closing a tab clears stale presence.
7.  Users on separate branches do not receive each other's updates or
    presence.
8.  An invalid or unauthorised action is rejected and logged.
9.  Multiple Fly machines, if relevant and safe for the current
    persistence design.
10. A controlled restart preserves content and clients recover.
11. Parent and fork remain isolated.
12. A later visit can recover a persistent trace.

Use `Not run`, `Blocked` or `Failed` when appropriate. Never mark a
scenario as passed without actually running it. Do not scale production
machines or restart a live service without considering the impact and
persistence design.

------------------------------------------------------------------------

# Part C --- Repository rules and agent coordination

## 8. Start with a repository audit

Inspect:

-   repository tree and `git status`
-   recent commit history
-   `README.md`, `PROCESS.md`, `spec/README.md`
-   `package.json` and package manager lockfile
-   application entry points, routes and existing data model
-   existing tests and scripts
-   `fly.toml`, `Dockerfile` and deployment instructions
-   environment variable names, but never print their secret values
-   any existing `docs/`, `reflections/` or decision records

Do not replace the stack before understanding it. Preserve the starter
template's required routes and scripts. Do not delete working tests to
make a build pass.

## 9. Subagent deployment plan: exactly where to delegate

If Claude Code supports subagents in the current environment, use them
for bounded tasks that do not edit the same files at the same time. Good
independent assignments include:

-   **Repository auditor:** report existing routes, stack, tests,
    deployment setup and missing requirements. Read-only.
-   **Assessment evidence reviewer:** compare README, PROCESS,
    reflections and tests with the course requirements. Read-only
    initially.
-   **Test reviewer:** identify test gaps and propose repeatable
    multi-user checks. Read-only initially.
-   **Visual design reviewer:** inspect the UI and report specific
    design improvements without editing files concurrently with the main
    implementation.
-   **Security reviewer:** inspect identity, input validation, branch
    isolation and server-side permission checks. Read-only initially.

The main agent remains responsible for integration and correctness. Give
every subagent a specific question, expected output and file boundary.
Avoid having multiple agents modify the same files or architecture
simultaneously. If subagents are unavailable, perform these reviews
sequentially in small tasks.

Do not delegate essential work and then assume it succeeded. Inspect
every result, run the checks and integrate it.

## 10. Checkpoint file

Create `docs/agent-progress.md` at the start. Keep it concise and update
it after each task.

Use this template:

``` markdown
# Agent progress

## Current status
- Phase:
- Last updated:
- Current git commit:
- Deployment status:

## Completed and verified
- [x] Task — evidence or command result

## Completed but not yet verified
- [ ] Task — verification still needed

## Current task
- Goal:
- Files being changed:
- Last known state:

## Checks run
- Command:
- Result:

## Blockers
- Blocker:
- Safe next action:

## Exact next task
1. ...
2. ...
3. ...

## Resume instructions
Read this file, inspect `git status`, inspect the last commit and continue from the exact next task. Do not repeat completed work.
```

Update the file before risky changes, after each completed task and
before ending a session.

## 11. Task execution protocol

For every task:

1.  State a one-sentence goal in the progress file.
2.  Inspect only the files and dependencies needed for that task.
3.  Make the smallest coherent change.
4.  Run the narrowest relevant test or check.
5.  Inspect the diff for accidental changes, secrets or unrelated
    rewrites.
6.  Record the actual outcome and any failure.
7.  Commit a stable increment if it is a meaningful milestone and the
    repository's workflow permits it.
8.  Record the exact next task.
9.  Stop and checkpoint if the proxy/session may time out.

If a check fails, do not repeatedly run the same command without
changing anything. Read the error, identify a small hypothesis, make one
targeted fix and rerun the narrowest check. After two unsuccessful
attempts, checkpoint the failure, gather diagnostics and consider a
simpler approach.

If a command might take a long time, run it in a supported way that
allows its output and exit status to be recovered. Do not use an
unsupported background process and then assume it completed. Avoid
commands that can erase user work.

------------------------------------------------------------------------

# Part D --- Six-hour execution plan

## 11. Six-hour operating strategy

This is a strict six-hour prioritisation plan, not a guarantee that every feature can be completed regardless of repository state, proxy limits, credentials or existing bugs. Aim to finish with a working, deployed core and honest evidence. Do not spend the session planning. Start implementation immediately after a short audit.

**Order of priority**
- **P0:** app starts, core canvas interaction works, data persists, deployed proof of life.
- **P1:** two users, real-time updates, server-side identity/permissions and structured logs.
- **P2:** fork snapshot and branch isolation.
- **P3:** optional media cards and extra tools.
- **P4:** visual polish beyond the core art direction.

If the core is not working, defer P3 and P4. Keep tasks small, aim for 5–15 minutes per unit and update `docs/agent-progress.md` after each task. Checkpoint at the end of every hour and before risky operations.

## Hour 1 — Audit, choose the path and start the core

**Main agent owns:** repository inspection, prioritisation, architecture decisions and progress tracking.

Tasks:
1. Inspect `git status --short`, recent commits, file tree, package scripts, routes, tests, persistence, Fly configuration and environment variable names only.
2. Run the existing app and current checks where quick.
3. Create `docs/agent-progress.md` and `docs/implementation-audit.md`.
4. Make a gap list for C8, C9, C10 and the lecture multi-user test.
5. Choose the smallest compatible implementation path. Do not rewrite the stack without a strong reason.
6. Start fixing the highest-priority gap before the hour ends.

**Deploy subagents here, if supported:**
- **Agent A: repository/deployment audit, read-only.** Report stack, start/build/test commands, Fly configuration, likely blockers and files that must not be overwritten.
- **Agent B: assessment/evidence audit, read-only.** Compare the repo with README, `/readme/`, `PROCESS.md`, three reflections, ADRs and the multi-user test document.
- **Agent C: security/test gap review, read-only.** Identify missing identity, server-side permissions, branch isolation and the smallest useful multi-user tests.

Give each agent a bounded question and request a short report. Do not wait indefinitely for subagents.

**Deliverable:** repository audit, checkpoint file and selected implementation path.

## Hour 2 — Core canvas, persistence and proof of life

**Main agent owns:** core interaction, persistence and integration.

Tasks:
1. Ensure the main route displays a white or warm-white open canvas, not a literal graffiti-wall background or generic SaaS dashboard.
2. Implement or repair one contribution type first: text or freehand drawing.
3. Give each object a stable ID and minimum required data such as type, position, content and timestamps.
4. Persist objects in a durable server-side store compatible with the existing stack and Fly. Do not rely on ephemeral machine disk for durable production data.
5. Verify create, refresh and read-back.
6. Ensure a stranger can perform the core action without the developer operating the UI.
7. Write/update `README.md` with the initial definition of good and verify `/readme/` serves it.
8. Write the basic stack decision in `PROCESS.md`.

**Subagent deployment:**
- **Agent D: visual design/accessibility review, read-only.** Review the UI and suggest the three highest-impact improvements without editing core files.
- **Agent E: persistence test planning, read-only.** Propose repeatable persistence and reconnect tests.
- Do not let subagents edit the same core components or persistence files as the main agent.

**Deliverable:** one meaningful contribution persists after reload and the README route works locally.

**Hard fallback:** if persistence is still broken, stop optional work and fix it before moving on.

## Hour 3 — Real-time collaboration, identity and logs

**Main agent owns:** real-time architecture, server integration and conflict behaviour.

Tasks:
1. Use the simplest real-time transport that fits the existing stack.
2. Broadcast persisted object changes to other sessions on the same branch.
3. Make updates visible without reload, targeting delivery within about one second under normal conditions.
4. Add stable pseudonymous visitor identity.
5. Add real presence if feasible; cursors are secondary to correct object synchronisation.
6. Define same-object conflict behaviour and reconnect/snapshot behaviour.
7. Add structured server logs for `user_join`, `user_leave`, `action_received`, `update_broadcast`, `action_rejected` and `state_snapshot_sent`.
8. Include timestamp, pseudonymous user ID, branch ID and action/object ID where relevant. Never log secrets.
9. Enforce basic server-side authorization and validate input.
10. Test two independent sessions with an automated test or repeatable local procedure.

**Subagent deployment:**
- **Agent F: real-time/conflict review, read-only.** Review the proposed event model before implementation and inspect the resulting behaviour afterwards.
- **Agent C: security review, read-only.** Review identity, input validation, authorization and logging after implementation.
- Do not parallelise edits to the event handler or shared data model.

**Deliverable:** a change from one session appears in another without reload, and logs identify who performed the action.

**Hard fallback:** defer live cursors if needed. Correct persisted live updates and user identification come first.

## Hour 4 — Forks, branch isolation and architecture records

**Main agent owns:** branch schema, fork semantics and server-side isolation.

Tasks:
1. Implement fork as a snapshot of persistent canvas objects, with a new branch ID, parent branch ID and fork timestamp.
2. Scope reads, writes, broadcasts and presence to the current branch.
3. Verify parent edits after forking do not appear in the fork.
4. Verify fork edits do not affect the parent or sibling branches.
5. Do not implement merge-back or automatic propagation.
6. Add tests for branch isolation and unauthorized branch access.
7. Write concise ADRs for real-time/concurrency and identity/permissions. Add a persistence/deployment ADR if needed.
8. Add a visible fork action only when the underlying behaviour works.

**Subagent deployment:**
- **Agent G: fork isolation review, read-only.** Review branch boundaries and propose test cases.
- **Agent F or Agent C: ADR consistency review, read-only.** Check that decisions match the actual code.
- Main agent integrates and runs the tests. Reviewers must not independently rewrite branch logic.

**Deliverable:** a fork is independent, or a clear blocker and exact remaining steps are recorded.

## Hour 5 — Course documentation, lecture test and deployment

**Main agent owns:** documentation accuracy, deployment and verification.

Tasks:
1. Update `PROCESS.md` with actual stack decisions, trade-offs, agent use, debugging and changes of direction.
2. Create/update `reflections/crit-8.md`, `reflections/crit-9.md` and `reflections/crit-10.md`. Mark retrospective work honestly and include only real observations.
3. Create `docs/testing/multi-user-test.md` from the lecture whiteboard task. Include log events and scenarios for two users, simultaneous edits, late join, reconnect, branch isolation, rejected actions, restart recovery and later return.
4. Mark manual scenarios `Not run` until actually tested.
5. Run existing project checks, including `pnpm check` and `pnpm check:evidence` only if those scripts exist.
6. Inspect Fly configuration and deploy through the established workflow if credentials and access permit.
7. Verify the deployed URL and `/readme/` with actual HTTP requests.
8. Inspect server logs using the supported Fly workflow.
9. Test two independent browser profiles if available. Otherwise run the strongest available automated two-session test and label the browser test outstanding.

**Subagent deployment:**
- **Agent B: documentation/evidence consistency review, read-only.**
- **Agent E: test matrix review, read-only.**
- **Agent A: deployment configuration review, read-only.**
- Main agent alone performs deployment. Do not run simultaneous deployments or database migrations.

**Deliverable:** documentation files exist, checks have been run and deployment has been attempted safely.

## Hour 6 — Fix critical failures, verify and hand over

**Main agent owns:** integration, release decisions and truthful reporting.

Tasks:
1. Fix the highest-impact test failures in small increments.
2. Run the available build, test suite and evidence checks.
3. Verify the core flow: open app, add contribution, refresh and find it again later.
4. Verify two users receive live updates and have distinct IDs, using separate profiles or a test harness.
5. Verify required server log events.
6. Verify parent/fork isolation if implemented.
7. Verify `/readme/`, inspect `git diff` and `git status --short`, and check for accidental secrets.
8. Update `docs/agent-progress.md` with actual outcomes, current commit, deployment status, blockers and the exact next task.
9. Commit a stable checkpoint if appropriate. Never fabricate or backdate commits.
10. Produce the final report using the format in Part G.

**Subagent deployment:**
- **Agent C: final security review, read-only.**
- **Agent D: visual review, read-only.** Implement at most one high-impact visual fix and only if P0/P1 requirements are stable.
- **Agent B: final evidence consistency review, read-only.**
- Do not start optional refactors or broad redesigns in the final hour.

**Deliverable:** stable repository, honest test/deployment report and resumable progress file.

## 12. Hourly checkpoints and stop rules

At the end of every hour, record:
- completed tasks and evidence
- current commit and `git status`
- checks run and exact results
- failures and blockers
- next task in priority order

If the proxy starts timing out, save a checkpoint immediately. If a task takes more than 15 minutes without progress, narrow it to one failing command or one small code path. After two failed attempts at the same fix, record diagnostics and try a simpler approach.

This plan does not guarantee the agent can persist beyond the current session. The checkpoint system makes resumption easier; actual background execution depends on the environment.

# Part E --- Test and verification checklist

## 12. Required checks

Use the existing test harness. Do not replace it without a strong
reason.

At minimum, verify or add tests for:

1.  `/` responds successfully.
2.  `/readme/` serves the full current README.
3.  A visitor can add a core canvas object.
4.  The object survives refresh and a server restart or equivalent
    integration-test restart.
5.  Two independent sessions have distinct identities.
6.  An edit from one session reaches another without reload, within
    about one second under normal test conditions.
7.  A late session receives the current state snapshot.
8.  Server logs include join, leave, action received, broadcast,
    rejection and snapshot events.
9.  Logs identify users and branches without exposing secrets.
10. Server-side permissions are enforced.
11. Concurrent edits to different objects are both retained.
12. The same-object conflict policy matches its documentation.
13. A fork begins from a consistent snapshot and records its parent.
14. Parent, fork and sibling branches remain isolated.
15. Presence and cursors are branch-scoped.
16. Invalid or oversized input is rejected safely.
17. Canvas interactions work at different zoom levels.
18. Important controls can be used with a keyboard and show focus.
19. Uploaded images and external links are validated.

Run `pnpm check` and `pnpm check:evidence` if those scripts are present.
Run the project's actual test and build scripts as discovered in Hour 1.
Record command, exit status and meaningful output. Do not report only
"tests passed" without saying which checks were run.

## 13. Definition of done for each feature

A feature is not complete just because it appears on screen. It must:

-   behave as described
-   use the correct persisted or ephemeral state
-   enforce relevant rules on the server
-   handle errors and reconnects appropriately
-   have a test or repeatable verification procedure
-   fit the product's visual principles
-   be documented accurately
-   have no known critical regression from the change

------------------------------------------------------------------------

# Part F --- Documentation requirements

## 14. README.md

The README should define "good" for The Wall rather than read like
marketing copy.

Include: - audience and problem - why a shared creative canvas is worth
making - definition of good - principles: expression, low-friction
participation, presence, persistence, fork independence and visual
craft - deliberate non-goals, including likes, follower counts, ranked
feeds and merge-back - sources actually consulted and how they informed
decisions - evidence for the principles - known limitations and current
status - run and test instructions

Only say a source informed the work if it was actually consulted. Verify
the `/readme/` route serves the full README.

## 15. PROCESS.md

Explain the actual process: - initial direction and subsequent change of
direction - stack choice and trade-offs - important architecture
decisions - how the agent was directed, grounded and corrected - tests
and logs used to investigate failures - significant changes of
approach - current limitations and next steps

Do not backdate or invent history.

## 16. Reflections

Create or update: - `reflections/crit-8.md` - `reflections/crit-9.md` -
`reflections/crit-10.md`

Each reflection should include what was attempted, what actually
happened, evidence, what changed as a result and what remains
unresolved. Do not invent tutorial attendance, tutor feedback or peer
observations. State clearly where a milestone was completed
retrospectively.

## 17. Decision records

Create or update concise ADRs for: - real-time transport and
concurrency - identity and permissions - persistence and deployment

Each should include context, options considered, decision, reasons,
trade-offs and status. Keep decisions consistent with the code.

------------------------------------------------------------------------

# Part G --- Recovery and continuation protocol

## 18. If the proxy times out

When a timeout is imminent or the current session is interrupted:

1.  Do not start a new large task.
2.  Stop background processes you own if it is safe and necessary, or
    record how to inspect them.
3.  Save all working files.
4.  Run `git status --short`.
5.  If a file is half-edited, either finish the small change or restore
    it safely. Never discard pre-existing user changes.
6.  Update `docs/agent-progress.md`.
7.  Record:
    -   last fully completed task
    -   current partial task
    -   files touched
    -   commands run and their results
    -   errors and the current hypothesis
    -   exact next command or action
8.  Commit a stable checkpoint if appropriate.
9.  Leave the repository in a state a new session can understand.

### Resume prompt

When a new session is needed, use this short prompt:

> Read `PROMPT.md` and `docs/agent-progress.md` first. Inspect
> `git status` and the latest commit. Resume from the exact next task in
> the progress file. Do not redo completed work or assume unfinished
> tasks passed. Continue in small, independently tested increments,
> update the progress file after each task and prioritise the course's
> proof-of-life, real-time, multi-user logging and persistence
> requirements. Never fabricate results or history.

## 19. Parallelism and background work

-   Use subagents only if the current Claude Code setup supports them.
-   Parallelise read-only audits and independent reviews first.
-   Avoid parallel edits to the same source files.
-   Keep the main agent responsible for integration, tests and
    decisions.
-   If long-running build/test/deploy commands are supported, capture
    their output and exit status and document how to retrieve them.
-   Never claim an operation is complete just because a background
    process was started.
-   Do not run multiple deployments or migrations concurrently.
-   Never run a destructive database reset against real or deployed
    data.
-   Do not rely on an agent remaining alive for a full day. Design the
    work so it can be resumed after any interruption.

## 20. Final report format

At the end of the work, provide a concise, factual report with these
headings:

### Implemented

List features that exist in the code.

### Verified

List the exact commands, tests, URLs and manual scenarios actually
checked and their outcomes.

### Deployed

Give the verified deployment URL and say how it was checked, or explain
why deployment remains blocked.

### Documentation

List the files created or updated.

### Still outstanding

List incomplete or unverified requirements in priority order.

### Student actions needed

List actions that require the student's own login, live browser
profiles, class participation, repository permissions or judgement.

### Resume instructions

Give the exact next task and point to `docs/agent-progress.md`.

Be direct and accurate. The goal is a working, thoughtfully designed
project and credible evidence, not a checklist that only looks complete.
