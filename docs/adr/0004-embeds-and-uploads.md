# ADR 0004: image uploads and embed cards

Status: accepted

## Context

The Wall's second build phase added three new object types at the user's
explicit request: music cards (Spotify/YouTube/SoundCloud), generic iframe
embeds, and image uploads. Each introduces a real attack surface that
wasn't present when the only content types were server-validated strokes
and short text strings.

## Image storage: database blob vs. volume file

**Options considered:** store image bytes as a column in the SQLite
database, or write them to a file under the Fly volume and store only the
path.

**Decision:** write to `/data/uploads/<branchId>/<uuid>.<ext>` on the same
Fly volume the SQLite file already lives on (`src/uploads.ts`), storing
only `{ path, width, height }` in the object's `data` column.

**Reasons:** SQLite performs poorly with large blob columns mixed into a
table that's read on every page load (`listObjects` would have to skip
past megabytes of image data to read object metadata); serving a file
directly lets the OS/HTTP stack handle it efficiently, and the Fly volume
already provides exactly the persistence guarantee images need (survives a
restart/redeploy, same as the SQLite file) without adding a second storage
system.

**Consequences:** uploads count against the same 1GB volume as the
database; there's no CDN or image resizing, so a large embedded image is
served at its uploaded resolution (mitigated by the 2MB upload cap).

## Validating uploads: declared MIME type vs. magic bytes

**Decision:** `saveImage` never trusts the client's declared MIME type or
file extension — it reads the first bytes of the decoded buffer and checks
them against the real PNG/JPEG/GIF/WebP signatures (`src/uploads.ts`'s
`detectSignature`). The stored filename's extension comes from the
*detected* signature, not anything the client sent.

**Reasons:** a client claiming `image/png` while uploading an HTML file
with embedded `<script>` is a textbook stored-XSS/MIME-confusion attack if
the server ever serves that file back with a browser-sniffable content
type. Checking real bytes closes that off at the point of upload, not as
an afterthought at serve time.

**Consequences:** a few legitimate-but-obscure image formats (AVIF,
animated-only extensions of the checked formats, HEIC) are rejected as
"unsupported" even though a browser might render them — an explicit,
small, auditable allow-list was chosen over trying to recognise every
format a browser might accept.

## Generic embeds: arbitrary URL vs. a fixed allow-list

**Options considered:** let a user embed any URL as an iframe ("true"
generic embedding), or restrict `type: "embed"` to a small, fixed set of
hostnames.

**Decision:** a fixed hostname allow-list (`src/links.ts`'s
`isAllowedEmbedUrl` — Google Maps/Docs, Figma, CodePen, CodeSandbox,
Giphy). Anything else is rejected server-side with 400, not silently
narrowed or best-effort-rendered.

**Reasons:** arbitrary iframe embedding on a shared, anonymous, no-
ownership canvas is a real attack surface: clickjacking (overlaying a
transparent iframe of a sensitive site over fake UI), `postMessage` abuse
between an embedded page and this app's own window, and simply embedding
content the app can't vouch for safety-wise. A fixed allow-list keeps the
promise the README already makes ("safe link-out for a small, known set of
URL patterns... not universal embed support") consistent across music and
generic embeds alike, rather than treating embeds as a looser case.

**Consequences:** "embed anything" is explicitly out of scope; a user who
wants to share an arbitrary link uses the music card's own link-out
affordance or simply types the URL into a sticky note — a real limitation,
stated here rather than hidden.

## Iframe sandboxing

**Decision:** every embed iframe (`public/app.js`'s `renderEmbed`) sets
`sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"` and
`referrerpolicy="no-referrer"`, and deliberately **omits**
`allow-same-origin`.

**Reasons:** without `allow-same-origin`, the sandboxed document is treated
as being from a unique, opaque origin — even if an embedded page were
compromised, it cannot read this origin's cookies, `localStorage`, or DOM,
because the browser enforces same-origin policy against an origin that
doesn't match anything. `allow-scripts` and the popup flags are kept
because the allow-listed services (Figma, CodeSandbox, Google Docs) need
them to function at all. This is the standard "sandboxed but functional"
configuration for embedding content you don't fully control.

## Status

All three decisions ship in this build and are covered by
`spec/objects.test.ts` (allow-list acceptance/rejection, upload magic-byte
rejection, size-cap rejection) and a manual Playwright-driven visual check
(see `docs/agent-progress.md`'s Phase 2 entries) confirming the sandboxed
iframes actually render the allow-listed services correctly.
