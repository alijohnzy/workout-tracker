# 4-Day Plan

An offline-first workout tracker you install on your phone. Built for a basement gym with no signal:
one HTML file, no build step, no dependencies, no account, no server.

**→ [gageracer.github.io/workout-tracker](https://gageracer.github.io/workout-tracker/)**

## Install it

Open the link on your phone, then:

- **Android** — Chrome or Firefox → menu → **Install app**
- **iOS** — Safari → Share → **Add to Home Screen**

Open it once while online so the offline cache fills. After that it works with the plane in airplane mode.

> DuckDuckGo's browser can't install PWAs — it only drops a bookmark shortcut labelled with the domain,
> and it never updates. Use Chrome or Firefox.

## What it does

**Train.** The day after your last one is marked *Up next*. Work through a warm-up, one exercise per
screen, then a cool-down. Abandoned a session? Discard it from the home screen in one tap. Each exercise shows its
target sets and reps, what doing it right feels like, the common way to get it wrong, and a coaching cue.
Log a set and a rest timer starts on its own. Each exercise also links straight to a Google Images
search, and you can save one photo per lift — from your gallery or the camera — which is stored on the
device and shown as a thumbnail next session. Handy for photographing a machine's actual seat and pin
setting, and it works with no signal.

**Rest timer that doesn't lie.** The countdown is a deadline, not a tick count, so it stays accurate even
when your phone throttles or freezes the page. Optional notifications (off by default) put the target
time on your lock screen and buzz when the rest ends.

**Build your own plans.** The bundled 4-day upper/lower split is the read-only *Recommended* plan.
Duplicate it, or start from scratch — name your sessions, write the warm-up and cool-down, add exercises, set
sets/reps/rest, and optionally add your own coaching notes and a YouTube demo. A session without its own
warm-up inherits a sensible default for its upper/lower/full style.

**Share a plan as a link.** Sharing encodes the whole plan into the URL itself — no server, no accounts,
nothing uploaded. A 20-exercise plan with every coaching field filled comes to about 560 characters, so
it pastes into any chat. Whoever opens it gets a preview and chooses whether to save it; it's added
alongside their plans and never touches their history.

**History.** Calendar, list and progress views, with how long each session took. Progress is grouped by
plan, then by day, so it collapses to a few rows instead of one endless list. Open a day and every lift in
it gets a card: times trained, best
set, average weight and reps, how far you've come from your first session, and a bar chart of your top
set each time. Bodyweight movements track reps instead of weight. The calendar is colour-coded
upper/lower with per-workout volume totals and your average gap between training days. Export everything to JSON, import it back on another device, or
export an `.ics` to push your workouts into a real calendar app.

**Your data stays yours.** Everything lives in IndexedDB on your device. There is no backend to talk to,
so there's nothing to sign into and nothing to leak. The flip side: clearing site data wipes it, so use
the JSON export before switching phones.

## Development

There is no build system and no package manager. Edit `index.html` and reload.

```bash
# Tests — plain node, no dependencies to install
node test.mjs

# Quickest loop — file:// works for everything except the service worker
xdg-open index.html

# Full environment: the service worker and manifest need http://
python3 -m http.server 8000     # then open http://localhost:8000
```

Deploying pushes to GitHub Pages and bumps the service worker cache so phones actually pick up the
change:

```bash
./deploy.sh "commit message"
```

Icons are generated from the two SVGs — re-run these after editing either:

```bash
rsvg-convert -w 192 -h 192 icon.svg          -o icon-192.png
rsvg-convert -w 512 -h 512 icon.svg          -o icon-512.png
rsvg-convert -w 192 -h 192 icon-maskable.svg -o icon-maskable-192.png
rsvg-convert -w 512 -h 512 icon-maskable.svg -o icon-maskable-512.png
rsvg-convert -w 180 -h 180 icon-maskable.svg -o apple-touch-icon.png
```

## Layout

| File | |
|---|---|
| `index.html` | The entire app — markup, CSS and JavaScript in one file |
| `sw.js` | Service worker: precaches everything, cache-first, skips cross-origin |
| `manifest.webmanifest` | Install metadata; `icon.svg` / `icon-maskable.svg` are the icon sources |
| `deploy.sh` | Publishes to GitHub Pages and bumps the cache version |
| `test.mjs`, `test.cases.js` | Dev-only test suite — `node test.mjs`, no dependencies |
| `CLAUDE.md` | Architecture notes and the reasoning behind the non-obvious bits |

`CLAUDE.md` is the one to read before changing anything — it documents the traps that aren't visible in
the code, like why the time layer exists and why the rest timer is deadline-based.

## Licence

The **code** is MIT — see [LICENSE](LICENSE).

The **built-in workout programme is not**. Its exercise selection, coaching cues and demo video IDs were
transcribed from a Built With Science PDF, which is a paid third-party product. That content is the
property of its authors, isn't mine to license, and the MIT grant above does not extend to it. Plans you
create yourself are, of course, entirely yours.
