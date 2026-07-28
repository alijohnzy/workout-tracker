# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A 4-day upper/lower workout tracker, built as an installable PWA. It is deployed to GitHub Pages
(`https://gageracer.github.io/workout-tracker/`) and used on a phone, in a gym, usually with no signal.

There is **no build system, no package manager, no dependencies, and no test suite**. The entire app is
`index.html` — markup, CSS, and JavaScript inlined in one file. Everything else exists only to make it
installable and offline-capable.

## Commands

```bash
# Preview — file:// works for everything except the service worker
xdg-open index.html

# Preview with the service worker + manifest active (they need http://)
python3 -m http.server 8000    # then open http://localhost:8000

# Deploy to GitHub Pages (also auto-bumps the sw.js cache version, commits, pushes)
./deploy.sh "commit message"

# Regenerate PNG icons after editing icon.svg / icon-maskable.svg
rsvg-convert -w 192 -h 192 icon.svg          -o icon-192.png
rsvg-convert -w 512 -h 512 icon.svg          -o icon-512.png
rsvg-convert -w 192 -h 192 icon-maskable.svg -o icon-maskable-192.png
rsvg-convert -w 512 -h 512 icon-maskable.svg -o icon-maskable-512.png
rsvg-convert -w 180 -h 180 icon-maskable.svg -o apple-touch-icon.png
```

## Architecture

`index.html` is organised into labelled banner-comment sections. Read them in this order:

**PROGRAM DATA** (`WARMUP`, `SESSIONS`, `ORDER`, `LINKS`) — the built-in program as a literal object.
`SESSIONS` is keyed by `upperA | lowerA | upperB | lowerB`; each exercise carries `sets`, `reps`, `lo`
(the default rep count for a fresh set), `rest` (seconds), and the coaching strings `ok` / `no` / `cue` /
`warn`. `LINKS` maps exercise names to YouTube IDs — these were transcribed from the source Built With
Science PDF. **Never invent a YouTube ID.** `linkFor()` deliberately degrades to a YouTube *search* URL
for anything unlisted, and the UI marks the difference (`vetted`).

**PLANS** — `BUILTIN` wraps the consts above as the read-only "Recommended" plan. A plan is
`{id, name, order:[…], sessions:{ id:{name, kind, ex:[…]} }}` — deliberately the same shape `SESSIONS`
already had, so every exercise renderer works unchanged. Reach the active plan through the accessors
`plan()`, `sess(id)`, `order()`, `allPlans()`; **never touch `SESSIONS`/`ORDER` directly** outside
`BUILTIN`. `BUILTIN` is never written to storage, so a deploy can improve the recommended program
without migrating anyone's data. `state.plans` holds only user-authored plans.

**STORAGE** — a three-tier fallback resolved once at boot by `initStore()`: IndexedDB → `window.storage`
(the Claude preview sandbox) → in-memory. The whole `state` object is serialised to a single key
(`wk-v2`). IndexedDB open is wrapped in `withTimeout()` because it hangs indefinitely in private browsing.
Writes go through `writeChain`, a serialised promise chain, so rapid taps can't land out of order — always
call `save()`, never `storeSet()` directly.

**STATE** — one module-global `state = { v, view, session, idx, units, live, log, plans, planId, draft }`,
persisted whole to the single `wk-v2` key.
- `state.live` is a scratchpad of in-progress sets keyed `"planId:sessionId:exerciseIndex"` (`lk()`), so a
  half-finished workout survives a reload. **The plan segment is load-bearing** — without it, duplicating
  a plan makes both copies share one scratchpad.
- `state.log` is the committed history. `saveWorkout()` moves `live` → `log` and clears the scratchpad.
  Each record stores its own `kind` and `planId`, because the plan it came from can be deleted later and
  the calendar still has to paint — read it via `recKind()`, never by looking the session up in a plan.
- `state.idx` is the session step cursor: `0` is the warm-up page, `1..n` are exercises, `n+1` is the save page.
- `state.draft` is the plan being edited, persisted so a half-written plan survives a reload the same way
  `state.live` protects a half-finished workout.
- `state.rest` is the running rest timer, stored as a **deadline** (`endsAt`) plus `note`/`logged`/`buzzed`.
  It is persisted; `timer.id` is only the repaint handle and stays a transient global, as does `sheet`.
- `migrate()` runs on every load and is idempotent. v1 data (one hardcoded program, 2-part live keys, no
  `kind` on records) is upgraded in place; the storage key is unchanged so no history is lost.

**TIME LAYER** (`T`) — uses `Temporal` where available and falls back to `Date`, with no polyfill (the file
must work offline). Three traps this exists to avoid, so don't "simplify" it away:
1. `new Date("2026-07-27")` parses as UTC midnight and renders as the previous day in western time zones —
   use `T.fmtDay()` for `YYYY-MM-DD` strings and `fmtDate()` only for full ISO instants.
2. Subtracting milliseconds to count days is wrong across DST — use `T.daysBetween()`.
3. Log records store both `day` (local calendar date) and `zone` at save time, so history stays correct if
   the user travels. Read a record's day via `recDay()`, never off `date`.

**SHARE** — a plan travels as a URL hash: `#p=<flag><base64url>`. `packPlan()` maps to short keys, then
`deflate-raw` via `CompressionStream` (flag `z`), falling back to uncompressed bytes (flag `j`). A
20-exercise plan with every coaching field filled lands in ~560 characters. Three things not to undo:
- **The hash, not a query string.** GitHub Pages never receives it, so there's no 404 and no plan data in
  server logs, and the SW's cache-first match ignores the hash so shared links open offline.
- **Always encode through `TextEncoder`.** Bare `btoa()` throws on the first non-Latin-1 plan name.
- **`unpackPlan()` treats its input as hostile** — types checked, `kind` whitelisted, numbers clamped,
  strings truncated, counts capped, and fresh plan *and session* ids minted so an import can neither
  overwrite a local plan nor inject an id into a `data-*` attribute. The same function validates
  file imports; a `.json` file is no more trustworthy than a link.

**RENDER** — no framework. `render()` blows away `#app` with `innerHTML` from a `viewX()` string builder,
then `wire()` re-attaches every handler by id/`data-*` attribute. Consequences to respect:
- Any new interactive element needs a matching line in `wire()`, or it will be dead.
- All user-supplied and program text must go through `esc()` — and **`escA()` inside an attribute**, since
  `esc()` leaves quotes intact and plan text is now user-authored and arrives from other people's phones.
- An active rest timer short-circuits `render()` and takes over the whole screen (`viewRest()`), which is
  why `render()` restarts the repaint interval itself when `state.rest` outlives a reload.
- `paintRest()` mutates the countdown text directly each second instead of re-rendering — a full re-render
  every second would drop taps mid-set.
- **The rest countdown is a deadline, never a tick count.** A hidden page has its timers throttled to
  roughly once a minute or frozen outright, so `timer.left--` per tick drifted long — lock the phone
  mid-rest and you'd unlock to a timer still claiming a minute left. `restLeft()` derives the number from
  the clock, `visibilitychange` repaints immediately on return rather than waiting for a throttled tick,
  and the buzz only fires on a *visible* crossing of zero (vibration is ignored while hidden, and buzzing
  late on return is just noise). Waking the user through a locked screen would need the Notifications API
  and a SW `showNotification()` — not built.
- Editor text fields (`[data-fld]`) update `state.draft` on `oninput` and deliberately **do not** render;
  replacing `#app` mid-word drops the caret. Only structural edits re-render. Writes there go through
  `saveSoon()` so typing doesn't serialise the whole state per keystroke.

**Views**: `viewHome` (session picker) → `viewSession` (warm-up → exercises → save) → `viewHistory`
(calendar / list tabs, plus JSON import/export and `.ics` export), plus `viewPlans` (switch / create /
share / duplicate / delete), `viewEditor` (edit `state.draft`) and `viewImport` (preview a shared link).
`buildICS()` is the only way a web page can push into a real calendar app; it hand-rolls RFC 5545 line
folding (`fold()`) and escaping (`icsEsc()`).

## PWA files — the three-way coupling

`manifest.webmanifest`, `sw.js`, and the icon files must be kept in sync:

- **`sw.js` precaches via `cache.addAll(ASSETS)`, which fails atomically.** If any file in `ASSETS` 404s,
  the service worker never installs and the app silently loses offline support. Adding a new asset means
  adding it to `ASSETS` *and* shipping the file.
- **Bump `CACHE` in `sw.js` on every content change** or phones keep serving the old cached copy and your
  edits look ignored. `deploy.sh` does this automatically by regexing `4day-v<N>`; if you rename that
  constant, fix the `sed` in `deploy.sh` too.
- The fetch handler is cache-first and skips cross-origin requests entirely, so YouTube links fail normally
  offline rather than serving something stale.
- **Icons**: iOS ignores manifest icons for "Add to Home Screen" and uses `<link rel="apple-touch-icon">`,
  so that tag in `index.html` must stay. Android uses the `maskable` icons, which are cropped to a circle
  of 80% diameter — `icon-maskable.svg` scales the barbell to 0.72 to stay inside that safe zone.
  `icon.svg` is the full-bleed version for everything else. Editing either SVG means re-running the
  `rsvg-convert` commands above.
- Manifest `id` is pinned to `./index.html` (the value Chrome previously derived implicitly from
  `start_url`). Changing it makes Chrome treat the app as a brand-new install and orphan the one already on
  the user's home screen.

## Conventions

- Keep everything inlined in `index.html`. No bundler, no CDN `<script>`, no external CSS — the app has to
  open instantly from cache in a basement gym.
- Palette lives in `:root` custom properties (`--ink`, `--blue`, `--gold`, …) and is mirrored by hand in
  `icon.svg`, `manifest.webmanifest` (`theme_color`/`background_color`), and the `theme-color` meta tag.
  Changing a brand colour means changing all four.
- Dense, comment-light code with banner sections; comments are reserved for explaining *why* a non-obvious
  workaround exists. Match that.
- The history view's action is `histView()`, not `history()`. A top-level `function history(){}` in a
  classic script shadows the browser `History` object, which silently broke `clearHash()` — the `#p=`
  fragment was never cleared, so reloading re-triggered a shared-plan import forever. Don't rename it back.

## Testing

There's no test runner, but the script can be lifted out of `index.html` and exercised in Node with
stubbed DOM globals — `vm.runInContext(js + tests)` in one script so the tests see the top-level
`const`/`let` bindings. Worth doing for the codec, the validators, and `migrate()`. A real-engine check
needs no dependencies either:

```bash
python3 -m http.server 8000 &
CHROME=~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome
$CHROME --headless --disable-gpu --virtual-time-budget=4000 \
        --dump-dom 'http://127.0.0.1:8000/index.html#p=<code>'   # renders + runs JS
$CHROME --headless --disable-gpu --window-size=390,1200 \
        --screenshot=out.png http://127.0.0.1:8000/index.html
```
