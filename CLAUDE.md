# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A 4-day upper/lower workout tracker, built as an installable PWA. It is deployed to GitHub Pages
(`https://gageracer.github.io/workout-tracker/`) and used on a phone, in a gym, usually with no signal.

There is **no build system, no package manager, and no dependencies**. The entire app is `index.html` —
markup, CSS, and JavaScript inlined in one file. Everything else exists only to make it installable and
offline-capable, except `test.mjs` / `test.cases.js`, which are dev-only and never shipped to the phone.

## Commands

```bash
# Preview — file:// works for everything except the service worker
xdg-open index.html

# Preview with the service worker + manifest active (they need http://)
python3 -m http.server 8000    # then open http://localhost:8000

# Run the test suite (no dependencies; non-zero exit on failure)
node test.mjs

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

Warm-ups and cool-downs hang off the **session**, not the kind: `session.warmup` / `session.cooldown` are
optional arrays of steps and `warmupFor()` / `cooldownFor()` fall back to `WARMUP[kind]` / `COOLDOWN[kind]`
when absent. **`COOLDOWN` is not from the Built With Science PDF** — that document has a warm-up routine
and no cool-down section whatsoever, so the defaults are deliberately generic and unattributed. Don't
credit them to the source or invent BWS cool-down content. Optional on purpose — plans and shared links
written before warm-ups were editable keep working. `PROGRAM_V` / `PROGRAM_CHANGED` exist because
`state.live` is keyed by exercise *index*: whenever the built-in programme's exercise order changes, bump
`PROGRAM_V` or stale in-progress sets silently re-attach to whatever now sits at that position.

**PLANS** — `BUILTIN` wraps the consts above as the read-only "Recommended" plan. A plan is
`{id, name, order:[…], sessions:{ id:{name, kind, warmup?, cooldown?, ex:[…]} }}` — deliberately the same shape `SESSIONS`
already had, so every exercise renderer works unchanged. Reach the active plan through the accessors
`plan()`, `sess(id)`, `order()`, `allPlans()`; **never touch `SESSIONS`/`ORDER` directly** outside
`BUILTIN`. `BUILTIN` is never written to storage, so a deploy can improve the recommended program
without migrating anyone's data. `state.plans` holds only user-authored plans.

**STORAGE** — a three-tier fallback resolved once at boot by `initStore()`: IndexedDB → `window.storage`
(the Claude preview sandbox) → in-memory. The whole `state` object is serialised to a single key
(`wk-v2`). IndexedDB open is wrapped in `withTimeout()` because it hangs indefinitely in private browsing.
Writes go through `writeChain`, a serialised promise chain, so rapid taps can't land out of order — always
call `save()`, never `storeSet()` directly. The store is genuinely keyed in all three modes; exercise
photos rely on that, and the in-memory fallback used to be a single slot that ignored the key.

**STATE** — one module-global `state = { v, view, session, idx, units, live, log, plans, planId, draft }`,
persisted whole to the single `wk-v2` key.
- `state.live` is a scratchpad of in-progress sets keyed `"planId:sessionId:exerciseIndex"` (`lk()`), so a
  half-finished workout survives a reload. **The plan segment is load-bearing** — without it, duplicating
  a plan makes both copies share one scratchpad.
- `state.log` is the committed history. `saveWorkout()` moves `live` → `log` and clears the scratchpad.
  Each record stores its own `kind` and `planId`, because the plan it came from can be deleted later and
  the calendar still has to paint — read it via `recKind()`, never by looking the session up in a plan.
- `state.idx` is the session step cursor: `0` warm-up, `1..n` exercises, `n+1` cool-down, `n+2` save.
  Adding or removing a step means updating `go()`'s max, the step-dot count, and the counter label together.
- `state.draft` is the plan being edited, persisted so a half-written plan survives a reload the same way
  `state.live` protects a half-finished workout.
- `state.startedAt` stamps when a session was opened; `saveWorkout()` turns it into `dur` (seconds) on the
  record. Resuming restarts it, so it times the *sitting*, not the calendar gap. Past `SESSION_MAX` the
  gap is a tab left open rather than a workout, so the save page asks for a finish time instead of
  guessing (`isStale()` → an `<input type="time">`, converted by `pickedDur()` and capped at
  `MANUAL_MAX`). Two traps there: the input has minute resolution, so `pickedDur()` zeroes the start's
  seconds or a nominal hour reads back as 59 min; and a time earlier than the start rolls to the next
  day, because finishing after midnight is the ordinary case for a session you're only now saving.
  `finishValue()` exists so the view and `saveWorkout()` can't disagree about the default. Records saved
  before any of this existed have no `dur`, so every reader must treat it as optional.
- `state.feel` is a scratchpad of optional per-exercise ratings (1 rough / 2 ok / 3 strong), keyed like
  `state.live`. `saveWorkout()` moves it onto the record as `feel:{exerciseName:n}` — by **name**, like
  `entries`, so `lastFeel()` can surface it next time the lift comes round. Omitted entirely when
  nothing was rated, so it stays optional for every reader.
- `state.rest` is the running rest timer, stored as a **deadline** (`endsAt`) plus `note`/`logged`/`buzzed`.
  It is persisted; `timer.id` is only the repaint handle and stays a transient global, as does `sheet`.
- `state.notify` is the opt-in for rest notifications.
- `migrate()` runs on every load and is idempotent. v1 data (one hardcoded program, 2-part live keys, no
  `kind` on records) is upgraded in place; the storage key is unchanged so no history is lost.

**TIME LAYER** (`T`) — uses `Temporal` where available and falls back to `Date`, with no polyfill (the file
must work offline). Three traps this exists to avoid, so don't "simplify" it away:
1. `new Date("2026-07-27")` parses as UTC midnight and renders as the previous day in western time zones —
   use `T.fmtDay()` for `YYYY-MM-DD` strings and `fmtDate()` only for full ISO instants.
2. Subtracting milliseconds to count days is wrong across DST — use `T.daysBetween()`.
3. Log records store both `day` (local calendar date) and `zone` at save time, so history stays correct if
   the user travels. Read a record's day via `recDay()`, never off `date`.

**REST NOTIFICATIONS** — opt-in (`state.notify`, toggled from home so the permission prompt has a user
gesture behind it). Four constraints shaped this and shouldn't be relitigated:
- **A page cannot schedule a notification.** Notification Triggers was an origin trial and never shipped,
  so the "done" alert is fired by our own 1-second tick. If Android freezes or evicts the tab it lands
  late or not at all — which is exactly why the *ongoing* notification spells out the target clock time
  rather than a countdown. Don't promise second-accurate alerts.
- **Android forbids `new Notification()`** — everything goes through
  `ServiceWorkerRegistration.showNotification()`, so this only works where the SW registered.
- **`silent:true` suppresses vibration as well as sound**, so it's set only on the ongoing notification.
  The finish carries `vibrate:[200,100,200]` instead — `navigator.vibrate()` is ignored while hidden.
  Whether a sound also plays is finally the OS notification channel's call, not ours.
- Both use `tag:"rest"` so there is only ever one, replaced in place; `closeRestNote()` clears it when the
  rest is cleared or when you return to a finished rest. `sw.js` has a `notificationclick` handler that
  focuses the existing window instead of opening a second copy.
- **The silent-audio keepalive was considered and rejected — don't add it.** Looping silent audio holds an
  audio session, which stops Android freezing the page and would make the alert land on time; it's the
  standard web workout-timer trick. But Chrome on Android takes media focus even for silent audio, which
  pauses music from other apps. The owner always trains with music on, so that trade is a non-starter here
  — a late buzz beats a stopped playlist. Web Push was rejected too: it needs a server *and* a signal, and
  this app is built for a gym with neither. Late-on-unlock is the accepted behaviour, which is exactly why
  the ongoing notification names the target clock time — you can read it off the lock screen.

**EXERCISE PHOTOS** — a form reminder that works in a basement: YouTube means ads and a signal you don't
have, so each exercise can hold one photo, shown as a thumbnail that expands on tap. Three rules:
- **Photos never go in the state blob.** They live under their own `img:<name>` storage keys, because
  `save()` re-serialises all of `state` on every logged set.
- Keyed by exercise **name**, like `lastTime()` and `exerciseStats()`, so a lift keeps its photo across plans.
- Everything is downscaled through a canvas to 900px / JPEG 0.7 before storing (a phone camera file is
  multiple MB). `render()` is synchronous, so `openSession()` fires `loadImgs()` and re-renders when the
  cache fills. The JSON export carries them, which is why an export can run to megabytes; imported image
  data is filtered to real `data:image/...;base64,` URLs under `IMG_CAP`.

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
  the clock, and `visibilitychange` repaints immediately on return rather than waiting for a throttled
  tick. Completion is signalled once, through whichever channel is live at the moment it's noticed:
  `navigator.vibrate()` if the page is visible, a notification if it isn't.
- The three faces are drawn as inline SVG rather than emoji, so red/amber/green are the app's own palette
  and render identically everywhere. `feelOf()` whitelists the value because records also arrive from
  imported files; anything else renders as nothing rather than throwing.
- The set sheet opens set *n* on what set *n* was **last session** (`prevSet()`), not on today's
  previous set — deliberately, so last week's figure is visible every time even after you've moved up
  today. It only falls back to today's last set when history has fewer sets than you're doing now.
  Unlogged set buttons carry the same figure as a `last 50×10` label.
- The set sheet's weight `+`/`-` walk a **ladder**, not a fixed delta: `wStep()` returns the next value
  that is a multiple of 2 *or* 2.5 (0, 2, 2.5, 4, 5, 6, 7.5, 8, 10, 12, 12.5 …), because machine stacks
  come in both and one fixed step always missed half the pins. It's derived, so it has no ceiling, and
  it snaps an off-ladder number to the neighbouring rung rather than shifting the whole grid.
- Editor text fields (`[data-fld]`) update `state.draft` on `oninput` and deliberately **do not** render;
  replacing `#app` mid-word drops the caret. Only structural edits re-render. Writes there go through
  `saveSoon()` so typing doesn't serialise the whole state per keystroke.

`viewHome` marks the day after your last logged one as **Up next** (`nextSession()`, wrapping round the
plan's order, ignoring other plans' history), and suppresses that hint while a session is half-finished.
An abandoned session can be dropped with `discardSession()` — without it the resume card is permanent.

**Views**: `viewHome` (session picker) → `viewSession` (warm-up → exercises → save) → `viewHistory`
(calendar / list / progress tabs, plus `dataPanel()` — a `<details>` that is **collapsed by default**
and holds JSON import/export, `.ics` export and the history wipe, because they're rare and two of them
are destructive; don't promote any of them back out to a loose button), plus `viewPlans` (switch / create /
share / duplicate / delete), `viewEditor` (edit `state.draft`) and `viewImport` (preview a shared link).
The Progress tab groups **plan → day → exercise** as nested `<details>`; the active plan opens and days
stay shut, because flat it was unreadably long. `progGroups()` buckets by the *records'* `planId` and
`session`, not by the current plans, so days from a deleted plan still appear (labelled). `exerciseStats()`
takes an optional record list so a day's cards count only that day's sessions — note this deliberately
narrows the cross-plan view you get when it's called with no argument.

`exerciseStats()` aggregates history by exercise **name**, for the same reason `lastTime()` does — a lift
keeps its line when it moves between plans, and renaming it starts a fresh one. Its bar chart is indexed
to each lift's own min/max rather than to zero, because working weights cluster near the top and a real
climb would otherwise render as a flat wall; the first/latest/best numbers under it carry the absolute
values. A lift whose sets are all bodyweight tracks reps instead of weight (`byW`).

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

## The source PDF

The Built With Science PDF this project drew its warm-up from is **third-party paid material whose own
disclaimer forbids reproduction or transmission in any form**. It is gitignored (`*.pdf`). It was once
committed by accident — `deploy.sh` runs `git add -A` — and served publicly from GitHub Pages before
being removed. Keep it out of the repo, and never paste its text wholesale into the source.

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

`node test.mjs` — no dependencies, no runner, no config. It lifts the script out of `index.html` and
runs it against stubbed DOM globals, with `test.cases.js` **concatenated into the same script** so the
assertions can see the top-level `const`/`let` bindings. Exit code is non-zero on failure.

The stubs matter as much as the cases: `NOW`/`VIS` are a controllable clock and visibility flag (that's
how the frozen-page rest timer is tested), and `navigator.serviceWorker` records every
`showNotification()` call. Two traps when adding cases — a `pkill -f` pattern that also matches your own
shell will kill the run, and `\n` inside `test.cases.js` is fine but was a repeated footgun back when the
cases lived in a template literal.

Cover the things that rot silently: the share codec, the hostile-input validators, `migrate()`, and any
invariant a view depends on. A real-engine check needs no dependencies either:

```bash
python3 -m http.server 8000 &
CHROME=~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome
$CHROME --headless --disable-gpu --virtual-time-budget=4000 \
        --dump-dom 'http://127.0.0.1:8000/index.html#p=<code>'   # renders + runs JS
$CHROME --headless --disable-gpu --window-size=390,1200 \
        --screenshot=out.png http://127.0.0.1:8000/index.html
```
