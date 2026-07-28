#!/usr/bin/env bash
# Publishes this folder to GitHub Pages and prints the install URL.
#
#   ./deploy.sh              -> first-time setup, creates the repo
#   ./deploy.sh "message"    -> pushes an update afterwards
#
# Needs: git, gh (pacman -S github-cli), and `gh auth login` done once.

set -euo pipefail

REPO="${REPO:-workout-tracker}"
MSG="${1:-update workout tracker}"

die(){ printf '\n  %s\n\n' "$*" >&2; exit 1; }
say(){ printf '  %s\n' "$*"; }

command -v git >/dev/null || die "git not found:  sudo pacman -S git"
command -v gh  >/dev/null || die "gh not found:   sudo pacman -S github-cli"
gh auth status >/dev/null 2>&1 || die "Not signed in. Run:  gh auth login"

for f in index.html sw.js manifest.webmanifest icon.svg; do
  [ -f "$f" ] || die "Missing $f — run this from the folder holding all four files."
done

USER="$(gh api user --jq .login)"
say "Signed in as $USER"

# Bump the service worker cache so phones actually pick up the new build.
# Without this they keep serving the old cached copy and your edits look ignored.
N=$(sed -n 's/.*CACHE = "4day-v\([0-9][0-9]*\)".*/\1/p' sw.js | head -1)
if [ -n "$N" ]; then
  sed -i "s/CACHE = \"4day-v$N\"/CACHE = \"4day-v$((N+1))\"/" sw.js
  say "Cache version bumped to 4day-v$((N+1))"
fi

if [ ! -d .git ]; then
  say "Setting up a new repo..."
  git init -q
  git branch -M main
  printf 'node_modules/\n.DS_Store\n' > .gitignore
  git add -A
  git -c user.email="${GIT_EMAIL:-$USER@users.noreply.github.com}" \
      -c user.name="${GIT_NAME:-$USER}" commit -qm "$MSG"

  gh repo create "$REPO" --public --source=. --push \
    --description "Offline upper/lower workout tracker" >/dev/null
  say "Repo created: $USER/$REPO"

  say "Waiting for GitHub to register the push..."
  sleep 4
  gh api -X POST "repos/$USER/$REPO/pages" \
    -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 \
    || say "(Pages may already be on, or needs a moment — check Settings > Pages)"
else
  git add -A
  if git diff --cached --quiet; then
    say "No changes to push."
    exit 0
  fi
  git commit -qm "$MSG"
  git push -q
  say "Pushed."
fi

URL="https://$USER.github.io/$REPO/"
cat <<EOF

  ------------------------------------------------------------
  $URL
  ------------------------------------------------------------

  First build takes about a minute. Then on your phone:

    1. Open that URL in Chrome or Firefox
    2. Menu -> Install app  (or Add to Home Screen)
    3. Open it once while online so the offline cache fills

  Moving your existing history across:
    On the old copy  -> History -> Export logs (.json)
    On the new one   -> History -> Import logs
    Storage is per-origin, so it will not carry over on its own.

EOF
