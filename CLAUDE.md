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

**PROGRAM DATA** (`WARMUP`, `SESSIONS`, `ORDER`, `LINKS`) — the workout program as a literal object.
`SESSIONS` is keyed by `upperA | lowerA | upperB | lowerB`; each exercise carries `sets`, `reps`, `lo`
(the default rep count for a fresh set), `rest` (seconds), and the coaching strings `ok` / `no` / `cue` /
`warn`. `LINKS` maps exercise names to YouTube IDs — these were transcribed from the source Built With
Science PDF. **Never invent a YouTube ID.** `linkFor()` deliberately degrades to a YouTube *search* URL
for anything unlisted, and the UI marks the difference (`vetted`).

**STORAGE** — a three-tier fallback resolved once at boot by `initStore()`: IndexedDB → `window.storage`
(the Claude preview sandbox) → in-memory. The whole `state` object is serialised to a single key
(`wk-v2`). IndexedDB open is wrapped in `withTimeout()` because it hangs indefinitely in private browsing.
Writes go through `writeChain`, a serialised promise chain, so rapid taps can't land out of order — always
call `save()`, never `storeSet()` directly.

**STATE** — one module-global `state = { view, session, idx, units, live, log }`, persisted whole.
- `state.live` is a scratchpad of in-progress sets keyed `"sessionId:exerciseIndex"` (`lk()`), so a
  half-finished workout survives a reload.
- `state.log` is the committed history. `saveWorkout()` moves `live` → `log` and clears the scratchpad.
- `state.idx` is the session step cursor: `0` is the warm-up page, `1..n` are exercises, `n+1` is the save page.
- `sheet` and `timer` are separate globals — deliberately *not* persisted, since they're transient UI.

**TIME LAYER** (`T`) — uses `Temporal` where available and falls back to `Date`, with no polyfill (the file
must work offline). Three traps this exists to avoid, so don't "simplify" it away:
1. `new Date("2026-07-27")` parses as UTC midnight and renders as the previous day in western time zones —
   use `T.fmtDay()` for `YYYY-MM-DD` strings and `fmtDate()` only for full ISO instants.
2. Subtracting milliseconds to count days is wrong across DST — use `T.daysBetween()`.
3. Log records store both `day` (local calendar date) and `zone` at save time, so history stays correct if
   the user travels. Read a record's day via `recDay()`, never off `date`.

**RENDER** — no framework. `render()` blows away `#app` with `innerHTML` from a `viewX()` string builder,
then `wire()` re-attaches every handler by id/`data-*` attribute. Consequences to respect:
- Any new interactive element needs a matching line in `wire()`, or it will be dead.
- All user-supplied and program text must go through `esc()`.
- An active rest timer short-circuits `render()` and takes over the whole screen (`viewRest()`).
- `paintRest()` mutates the countdown text directly each second instead of re-rendering — a full re-render
  every second would drop taps mid-set.

**Views**: `viewHome` (session picker) → `viewSession` (warm-up → exercises → save) → `viewHistory`
(calendar / list tabs, plus JSON import/export and `.ics` export). `buildICS()` is the only way a web page
can push into a real calendar app; it hand-rolls RFC 5545 line folding (`fold()`) and escaping (`icsEsc()`).

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
