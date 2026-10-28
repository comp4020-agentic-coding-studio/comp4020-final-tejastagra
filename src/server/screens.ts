// The pages players see, in the navy toy look (ADR 0006, docs/design/). Each
// screen is a function that returns HTML; the styles live in public/theme.css
// and public/components.css, so nothing here defines a colour, font or duration
// (CLAUDE.md). Every visible word is real product copy for players: notes about
// how the page is built belong in docs/, not on screen (docs/design/look-and-feel.md U49).
import { arcadePage, button, icon, roundButton, title } from "./arcade-html.ts";

export interface ScreenContext {
  version: string; // a hash of the stylesheets, so a deploy never mixes old and new styles
  reload: string; // the live-reload snippet in development, empty in production
}

function shell(ctx: ScreenContext, pageTitle: string, body: string, script: string): string {
  return arcadePage({ title: pageTitle, body, script, reload: ctx.reload, version: ctx.version });
}

// ---- Home (docs/design/home.md U31 to U40) ----

export function homeScreen(ctx: ScreenContext): string {
  const body = `
    <main class="arena home" data-testid="home-screen">
      <div class="home-left">
        ${title()}
        <p class="tagline" data-testid="tagline">Four in a row, with a twist.</p>
        <div class="demo" data-testid="demo-board" aria-label="A demonstration round: both players choose, then both discs drop at once">
          <div class="board-wrap" data-testid="demo-board-wrap">
          </div>
          <p class="result" data-testid="demo-caption" role="status"></p>
        </div>
      </div>
      <div class="home-right">
        <div class="player-card panel" data-testid="player-card">
          <span class="avatar" data-testid="player-avatar"></span>
          <span class="player-text">
            <span class="player-name" data-testid="player-name">Choosing a name...</span>
            <span class="player-tag" data-testid="player-kind"></span>
          </span>
          <button type="button" class="icon-only" data-testid="rename" aria-label="Change nickname">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M3 17.3V21h3.7L18 9.7 14.3 6zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7z"/></svg>
          </button>
          <p id="home-message" class="message card-message" role="status" data-testid="home-message"></p>
        </div>
        <div class="stack menu" data-testid="menu">
          <div class="menu-item">
            ${button({ label: "Play the computer", iconName: "computer", kind: "red", block: true, testid: "play-computer" })}
            <p class="menu-hint" data-testid="hint-play-computer">Practise against the computer</p>
          </div>
          <div class="menu-item">
            ${button({ label: "Play a friend", iconName: "friends", kind: "blue", block: true, testid: "play-friend" })}
            <p class="menu-hint" data-testid="hint-play-friend">Send a link to someone you know</p>
          </div>
          <div class="menu-item">
            ${button({ label: "Quick match", iconName: "bolt", kind: "blue", block: true, testid: "quick-match", href: "/play/quick" })}
            <p class="menu-hint" data-testid="hint-quick-match">Play a random person online</p>
          </div>
          <div class="menu-item">
            ${button({ label: "Join with a code", iconName: "key", kind: "yellow", block: true, testid: "join-toggle" })}
            <p class="menu-hint" data-testid="hint-join">Enter a friend's 6-letter code</p>
          </div>
        </div>
        <div class="round-row" data-testid="icon-row">
          <a class="round-item watch-live" href="/watch" data-testid="watch-live"><span class="round">${icon("eye")}</span><span>Watch live</span><span class="live-count" data-testid="live-count" data-live="0" role="status" aria-live="polite">No games live</span></a>
          ${roundButton({ label: "Leaderboard", iconName: "podium", href: "/leaderboard", testid: "open-leaderboard" })}
          ${roundButton({ label: "How to play", iconName: "question", testid: "how-to-play" })}
          ${roundButton({ label: "Account", iconName: "user", href: "/account", testid: "open-account" })}
          ${roundButton({ label: "About", iconName: "book", href: "/readme/", testid: "open-about" })}
        </div>
        <section class="top" data-testid="top-players">
          <h2>Top players</h2>
          <ol class="rows" data-testid="leaderboard-wins"><li class="row"><span class="row-name">Loading...</span></li></ol>
        </section>
      </div>
    </main>
    <div class="tutorial" data-testid="tutorial" hidden role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <div class="panel tutorial-card">
        <h2 id="tutorial-title" data-testid="tutorial-title"></h2>
        <p class="tutorial-caption" data-testid="tutorial-caption" aria-live="polite"></p>
        <div class="tutorial-board" data-testid="tutorial-board"></div>
        <div class="tutorial-actions">
          <button type="button" class="btn btn-red" data-testid="tutorial-next">Next</button>
          <button type="button" class="link-button" data-testid="tutorial-skip">Skip</button>
        </div>
      </div>
    </div>
  `;
  return shell(ctx, "Rubble", body, "/static/home.js");
}

// ---- Quick match (docs/design.md: waiting state, then an offer of the computer after 20 seconds) ----

export function quickScreen(ctx: ScreenContext): string {
  const body = `
    <main class="arena narrow quick" data-testid="quick-screen">
      ${title()}
      <h2 class="subtitle">Quick match</h2>
      <section class="panel quick-card" data-testid="quick-panel" aria-live="polite">
        <div class="quick-discs" data-testid="quick-discs" aria-hidden="true"><span class="quick-disc quick-disc-you"></span><span class="quick-disc quick-disc-opponent"></span></div>
        <h3 class="quick-status" data-testid="quick-status" role="status">Finding you a random opponent</h3>
        <p class="quick-hint" data-testid="quick-hint">Quick match pairs you with another person who is looking for a game right now</p>
        <p class="quick-live" data-testid="quick-live" role="status"></p>
        <div class="quick-offer" data-testid="computer-offer" hidden>
          <p>Nobody has arrived yet. Play the computer while you wait?</p>
          ${button({ label: "Play the computer", iconName: "computer", kind: "red", block: true, testid: "computer-offer-play" })}
        </div>
      </section>
      <div class="quick-actions">
        ${button({ label: "Cancel", iconName: "join", kind: "blue", block: true, testid: "quick-cancel" })}
      </div>
    </main>
  `;
  return shell(ctx, "Rubble: Quick match", body, "/static/quick.js");
}

// ---- Leaderboard ----

export function leaderboardScreen(ctx: ScreenContext): string {
  const body = `
    <main class="arena narrow" data-testid="leaderboard-screen">
      ${title()}
      <h2>Most wins</h2>
      <ol class="rows" data-testid="leaderboard-wins"><li class="row"><span class="row-name">Loading...</span></li></ol>
      <h2>Fewest rounds to win</h2>
      <ol class="rows" data-testid="leaderboard-rounds"><li class="row"><span class="row-name">Loading...</span></li></ol>
      <p id="board-message" class="message" role="status"></p>
      <div class="stack">${button({ label: "Home", iconName: "join", kind: "blue", block: true, testid: "go-home", href: "/" })}</div>
    </main>
  `;
  return shell(ctx, "Rubble: Leaderboard", body, "/static/leaderboard.js");
}

// ---- Account ----

export function accountScreen(ctx: ScreenContext): string {
  const body = `
    <main class="arena narrow" data-testid="account-screen">
      ${title()}
      <h2>Your name</h2>
      <p id="account-who" class="message" role="status"></p>
      <p id="account-message" class="message" role="status"></p>
      <form id="guest-form" data-testid="guest-form" class="panel form" novalidate>
        <label for="nickname">Nickname (2 to 16 letters, numbers, spaces, hyphens or underscores)</label>
        <input id="nickname" name="nickname" data-testid="nickname-input" autocomplete="nickname" maxlength="16" />
        <button type="submit" class="btn btn-red">Save nickname</button>
      </form>
      <h2 id="keep-heading" hidden>Keep your record</h2>
      <form id="signup-form" data-testid="signup-form" class="panel form" novalidate hidden>
        <label for="su-username">Username</label>
        <input id="su-username" name="username" data-testid="signup-username" autocomplete="username" maxlength="20" />
        <label for="su-password">Password (at least 8 characters)</label>
        <input id="su-password" name="password" data-testid="signup-password" type="password" autocomplete="new-password" />
        <button type="submit" class="btn btn-blue">Sign up</button>
      </form>
      <h2>Sign in</h2>
      <form id="signin-form" data-testid="signin-form" class="panel form" novalidate>
        <label for="si-username">Username</label>
        <input id="si-username" name="username" data-testid="signin-username" autocomplete="username" />
        <label for="si-password">Password</label>
        <input id="si-password" name="password" data-testid="signin-password" type="password" autocomplete="current-password" />
        <button type="submit" class="btn btn-blue">Sign in</button>
      </form>
      <div class="stack">
        <button type="button" class="btn btn-yellow btn-block" data-testid="signout" hidden>Sign out</button>
        ${button({ label: "Home", iconName: "join", kind: "blue", block: true, testid: "go-home", href: "/" })}
      </div>
    </main>
  `;
  return shell(ctx, "Rubble: Your name", body, "/static/account.js");
}

// ---- About (/readme/) ----

export function readmeScreen(ctx: ScreenContext, renderedReadme: string): string {
  const body = `
    <main class="arena readme" data-testid="readme-screen">
      <div class="panel prose">${renderedReadme}</div>
      <div class="stack">${button({ label: "Home", iconName: "join", kind: "blue", block: true, testid: "go-home", href: "/" })}</div>
    </main>
  `;
  return shell(ctx, "Rubble: About", body, "");
}

// ---- Game (docs/design/board-interaction.md U10 to U18, motion-and-endings.md U19 to U30) ----

const EYE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5C6.5 5 2.7 9.2 1.5 12c1.2 2.8 5 7 10.5 7s9.3-4.2 10.5-7C21.3 9.2 17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>';
const QUAKE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 3h5.5v7H2zM9.2 3h5.6v7H9.2zM16.5 3H22v7h-5.5zM2 12.5h4.6l2.2 3.4 3.2-3.4 3.2 4.6 2.6-3.6 4.2.2v3.2l-2.6.1-3.6 4.9-3.2-4.5-3.2 3.6-2.6-3.7H2z"/></svg>';

// ---- The watching screen (/watch): the game screen with nothing to act on (docs/design/spectating.md U78 to U83) ----

export function watchScreen(ctx: ScreenContext): string {
  const body = `
    <main class="arena game watching" data-testid="watch-screen">
      <div class="stage" data-testid="game-group">
        <div class="status-row">
          <p class="round-line" data-testid="round-line">Round <span data-testid="round-number">1</span></p>
          <p class="watching-banner" data-testid="watching-banner" role="status">Watching live</p>
          <p class="watching-banner spectator-notice" data-testid="spectator-notice" role="status" hidden>This game already has two players, so you're watching.</p>
          <p class="watcher-count" data-testid="watching-count" aria-live="off">${EYE_ICON}<span data-testid="watching-count-text">1 watching</span></p>
          <p class="shrink-warning" data-testid="shrink-warning" role="status" hidden><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13 1 5 13h5l-3 10 12-14h-6z"/></svg><span data-testid="shrink-warning-text"></span></p>
        </div>

        <section class="panel no-live" data-testid="no-live-games" hidden>
          <span class="no-live-icon" aria-hidden="true">${EYE_ICON}</span>
          <h2>No live games right now</h2>
          <p>Start a Quick match and other people can watch you play.</p>
          <div class="no-live-actions">
            ${button({ label: "Quick match", iconName: "bolt", kind: "red", testid: "quick-match", href: "/play/quick" })}
            ${button({ label: "Home", iconName: "join", kind: "blue", testid: "go-home", href: "/" })}
          </div>
        </section>

        <div class="players" data-testid="players">
          <div class="player player-you" data-testid="panel-a">
            <span data-testid="avatar-a"></span>
            <span class="player-text">
              <span class="player-name" data-testid="name-a">Player</span>
              <span class="player-meta"><span class="mini-disc" data-piece="you"></span><span class="shield-state" data-shield="ready" data-testid="shield-a"></span><span class="quake-state" data-quake="ready" data-testid="quake-a">${QUAKE_ICON}</span></span>
            </span>
          </div>
          <span class="vs" aria-hidden="true">VS</span>
          <div class="player player-opponent" data-testid="panel-b">
            <span data-testid="avatar-b"></span>
            <span class="player-text">
              <span class="player-name" data-testid="name-b">Player</span>
              <span class="player-meta"><span class="mini-disc" data-piece="opponent"></span><span class="shield-state" data-shield="ready" data-testid="shield-b"></span><span class="quake-state" data-quake="ready" data-testid="quake-b">${QUAKE_ICON}</span></span>
            </span>
          </div>
        </div>

        <div class="play-area">
          <div class="board-wrap" data-testid="board-wrap">
            <div class="watch-result panel" data-testid="watch-result" role="status" hidden>
              <h2 data-testid="watch-result-title"></h2>
              <p data-testid="watch-result-next"></p>
            </div>
          </div>
          <p class="result" data-testid="result-line" role="status" aria-live="polite"></p>
          <p class="message" data-testid="watch-message" role="status"></p>
          <div class="watch-actions" data-testid="watch-actions">
            ${button({ label: "Watch another game", iconName: "join", kind: "red", testid: "watch-another" })}
            ${button({ label: "Home", iconName: "join", kind: "blue", testid: "go-home", href: "/" })}
          </div>
        </div>
      </div>
    </main>
  `;
  return shell(ctx, "Rubble: Watch live", body, "/static/watch.js");
}

export function gameScreen(ctx: ScreenContext, code: string): string {
  let hits = "";
  let glows = "";
  for (let column = 0; column < 7; column++) {
    hits += `<button type="button" class="column-hit" data-testid="column-${column}" data-column="${column}" aria-label="Column ${column + 1}" aria-pressed="false"></button>`;
    glows += `<span class="column-glow" data-testid="column-glow-${column}" aria-hidden="true"></span>`;
  }
  const body = `
    <main class="arena game" data-testid="game-screen" data-waiting="true">
      <div class="stage" data-testid="game-group">
        <div class="status-row">
        <p class="round-line" data-testid="round-line">Round <span data-testid="round-number">1</span></p>
        <p class="shrink-warning" data-testid="shrink-warning" role="status" hidden><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13 1 5 13h5l-3 10 12-14h-6z"/></svg><span data-testid="shrink-warning-text"></span></p>
        <p class="watcher-count" data-testid="watcher-count" aria-live="off" hidden><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5C6.5 5 2.7 9.2 1.5 12c1.2 2.8 5 7 10.5 7s9.3-4.2 10.5-7C21.3 9.2 17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg><span data-testid="watcher-count-text"></span><span class="visually-hidden"> watching</span></p>
        </div>

        <div class="players" data-testid="players">
          <div class="player player-you" data-testid="panel-you">
            <span data-testid="avatar-you"></span>
            <span class="player-text">
              <span class="player-name" data-testid="name-you">Player</span>
              <span class="player-meta"><span class="mini-disc" data-piece="you"></span><span data-testid="chosen-label" role="status"></span></span>
              <span class="visually-hidden" data-testid="my-shield">available</span>
            </span>
          </div>
          <span class="vs" aria-hidden="true">VS</span>
          <div class="player player-opponent" data-testid="panel-opponent">
            <span data-testid="avatar-opponent"></span>
            <span class="player-text">
              <span class="player-name" data-testid="name-opponent">Opponent</span>
              <span class="player-meta" data-testid="opponent-status-row"><span class="mini-disc" data-piece="opponent"></span><span data-testid="opponent-status">Choosing</span></span>
              <span class="player-meta"><span class="shield-state" data-shield="ready" data-testid="opponent-shield-state"></span><span class="visually-hidden" data-testid="opponent-shield">available</span><span class="quake-state" data-quake="ready" data-testid="opponent-earthquake-state"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 3h5.5v7H2zM9.2 3h5.6v7H9.2zM16.5 3H22v7h-5.5zM2 12.5h4.6l2.2 3.4 3.2-3.4 3.2 4.6 2.6-3.6 4.2.2v3.2l-2.6.1-3.6 4.9-3.2-4.5-3.2 3.6-2.6-3.7H2z"/></svg></span><span class="visually-hidden" data-testid="opponent-earthquake">Earthquake available</span></span>
            </span>
          </div>
          <div class="shield-row" data-testid="shield-row">
            <button type="button" class="shield-badge" data-testid="shield-badge" aria-pressed="false" aria-label="Shield, ready">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z"/></svg>
              <span data-testid="shield-label">Tap to arm shield</span>
            </button>
            <button type="button" class="icon-only shield-info" data-testid="shield-info" aria-label="What does the shield do?" aria-expanded="false" aria-controls="shield-help">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M11 10h2v7h-2zM11 7h2v2h-2z"/><path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16z"/></svg>
            </button>
            <button type="button" class="shield-badge earthquake-badge" data-testid="earthquake-badge" aria-pressed="false" aria-label="Earthquake, ready. Tap to use it" disabled>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 3h5.5v7H2zM9.2 3h5.6v7H9.2zM16.5 3H22v7h-5.5zM2 12.5h4.6l2.2 3.4 3.2-3.4 3.2 4.6 2.6-3.6 4.2.2v3.2l-2.6.1-3.6 4.9-3.2-4.5-3.2 3.6-2.6-3.7H2z"/></svg>
              <span data-testid="earthquake-label">Tap to use Earthquake</span>
            </button>
            <button type="button" class="icon-only shield-info" data-testid="earthquake-info" aria-label="What does Earthquake do?" aria-expanded="false" aria-controls="earthquake-help">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M11 10h2v7h-2zM11 7h2v2h-2z"/><path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16z"/></svg>
            </button>
          </div>
          <p class="panel shield-help" id="shield-help" data-testid="shield-help" hidden>Your shield wins one crash per game. If you and your opponent pick the same column, your disc lands and theirs is lost. Use it when you both need the same column, for example to block their winning move or to take yours.</p>
          <p class="panel earthquake-help" id="earthquake-help" data-testid="earthquake-help" hidden>Earthquake uses your turn: the bottom row crumbles away and everything drops down one. Lines it creates by itself do not win.</p>
        </div>

        <div class="play-area">
          <div class="board-wrap" data-testid="board-wrap">
            <div class="columns-glow" aria-hidden="true">${glows}</div>
            <span class="quake-marker" data-testid="quake-marker" aria-hidden="true" hidden><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 3h5.5v7H2zM9.2 3h5.6v7H9.2zM16.5 3H22v7h-5.5zM2 12.5h4.6l2.2 3.4 3.2-3.4 3.2 4.6 2.6-3.6 4.2.2v3.2l-2.6.1-3.6 4.9-3.2-4.5-3.2 3.6-2.6-3.7H2z"/></svg></span>
            <div class="columns-hit" data-testid="columns" role="group" aria-label="Choose a column">${hits}</div>
            <div class="get-ready" data-testid="get-ready" aria-hidden="true" hidden>Get ready</div>
            <section class="panel share" data-testid="waiting-panel">
              <h2>Waiting for your opponent</h2>
              <p class="share-text" data-testid="share-text">Send this link. The first person to open it plays you, and anyone after that watches.</p>
              <p class="code" data-testid="game-code" aria-label="Game code">${code}</p>
              <div class="share-actions">
                <button type="button" class="btn btn-blue" data-testid="copy-link">Copy link</button>
                <button type="button" class="btn btn-yellow" data-testid="share">Share</button>
              </div>
            </section>
            <div class="popup" data-testid="end-popup" hidden role="dialog" aria-modal="true" aria-labelledby="end-title">
              <div class="panel popup-card">
                <h2 class="popup-title" id="end-title" data-testid="end-title"></h2>
                <p data-testid="end-detail"></p>
                <div class="popup-actions">
                  ${button({ label: "Play again", iconName: "computer", kind: "red", testid: "play-again" })}
                  ${button({ label: "Home", iconName: "join", kind: "blue", testid: "go-home", href: "/" })}
                </div>
              </div>
            </div>
          </div>
          <div class="timer-track" data-testid="timer" role="progressbar" aria-label="Time left in this round" aria-valuemin="0" aria-valuemax="10" aria-valuenow="10"><span class="timer-fill"></span></div>
          <p class="result" data-testid="result-line" role="status" aria-live="polite"></p>
          <p class="message" data-testid="game-message" role="status"></p>
        </div>
      </div>
    </main>
  `;
  return shell(ctx, "Rubble: game", body, "/static/game.js");
}
