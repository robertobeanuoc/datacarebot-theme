#!/usr/bin/env bash
#
# Releases a new version of app.css/switcher.js and repins every consumer
# app to it in one go: tags this repo, computes the Subresource Integrity
# (SRI) hash for whichever of app.css/switcher.js actually changed, then
# opens one PR per consumer app updating both the version pin and the SRI
# hash together. Replaces the manual "tag, then hand-edit 3 repos" dance
# from before SRI existed - see the security audit
# (datacarebot-security-recommendations.md) for why the hash has to move
# in lockstep with the version now.
#
# Usage (from this repo's root, on a clean main):
#   ./scripts/release.sh v1.10.0
#
# Requires the 3 consumer repos checked out as siblings of this one
# (../datacarebot-food, ../datacarebot-chat, ../datacarebot-activity) -
# override CONSUMERS_DIR below if your layout differs. Does NOT merge
# anything - it stops at opening the 3 PRs, same as every other change in
# this ecosystem: a human reviews and merges.
#
# What it does NOT handle: a brand-new file this repo starts serving (only
# app.css/switcher.js are wired up below), or a consumer app that stops
# using DOM-based SRI (e.g. reverts switcher.js to being loaded as a
# static <script> tag instead of the current runtime-created one in
# datacarebot-chat) - the sed patterns are matched to today's exact usage
# in each app, see the *_FILE variables below.

set -euo pipefail

VERSION="${1:?Usage: ./scripts/release.sh vX.Y.Z}"
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Version must look like vX.Y.Z (got: $VERSION)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
THEME_DIR="$(dirname "$SCRIPT_DIR")"
CONSUMERS_DIR="${CONSUMERS_DIR:-$(dirname "$THEME_DIR")}"

cd "$THEME_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree not clean - commit or stash first." >&2
  exit 1
fi
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Not on main." >&2
  exit 1
fi
git pull --quiet

if git rev-parse "$VERSION" >/dev/null 2>&1; then
  echo "Tag $VERSION already exists." >&2
  exit 1
fi

sri_hash() {
  # Hashes the LOCAL file at HEAD, not the CDN - identical bytes to what
  # jsDelivr will serve for this tag (it mirrors the repo directly), but
  # doesn't race jsDelivr's propagation delay for a tag pushed seconds ago.
  openssl dgst -sha384 -binary "$1" | openssl base64 -A
}

git tag "$VERSION"
git push origin "$VERSION"
echo "Tagged and pushed $VERSION."

APP_CSS_HASH="sha384-$(sri_hash app.css)"
SWITCHER_HASH="sha384-$(sri_hash switcher.js)"
echo "app.css:     $APP_CSS_HASH"
echo "switcher.js: $SWITCHER_HASH"

# repo|file (relative to the repo root)
CONSUMERS=(
  "datacarebot-food|src/food_recognition/templates/base.html"
  "datacarebot-chat|src/datacarebot_chat/chat_agent/index.html"
  "datacarebot-activity|src/templates/base.html"
)

PR_URLS=()

for entry in "${CONSUMERS[@]}"; do
  repo="${entry%%|*}"
  file="${entry##*|}"
  repo_dir="$CONSUMERS_DIR/$repo"

  if [[ ! -d "$repo_dir" ]]; then
    echo "Skipping $repo - not found at $repo_dir (set CONSUMERS_DIR if your layout differs)." >&2
    continue
  fi

  echo "--- $repo ---"
  (
    cd "$repo_dir"
    if [[ -n "$(git status --porcelain)" ]]; then
      echo "  $repo working tree not clean - skipping." >&2
      exit 0
    fi
    git checkout --quiet main
    git pull --quiet
    branch="chore/switcher-${VERSION}"
    git checkout --quiet -b "$branch"

    # Both patterns run on every consumer - a file that only references one
    # of app.css/switcher.js just won't match the other, harmlessly.
    # ".*?" (not "[^\"]*") deliberately crosses the closing quote of the
    # href/src attribute before "integrity=" starts its own - e.g.
    # `href="...app.css" integrity="sha384-..."` has a `"` in between.
    perl -0pi -e "s{(datacarebot-theme\@)v[0-9]+\.[0-9]+\.[0-9]+(/app\.css.*?integrity=\")sha384-[A-Za-z0-9+/=]+}{\${1}${VERSION}\${2}${APP_CSS_HASH}}g" "$file"
    perl -0pi -e "s{(datacarebot-theme\@)v[0-9]+\.[0-9]+\.[0-9]+(/switcher\.js.*?integrity=\")sha384-[A-Za-z0-9+/=]+}{\${1}${VERSION}\${2}${SWITCHER_HASH}}g" "$file"
    # datacarebot-chat's switcher.js reference is a JS string, not an HTML
    # attribute - separate pattern for "...@vX.Y.Z/switcher.js";" followed
    # later by script.integrity = "sha384-...";
    perl -0pi -e "s{(datacarebot-theme\@)v[0-9]+\.[0-9]+\.[0-9]+(/switcher\.js\";)}{\${1}${VERSION}\${2}}g" "$file"
    perl -0pi -e "s{(script\.integrity = \")sha384-[A-Za-z0-9+/=]+(\";)}{\${1}${SWITCHER_HASH}\${2}}g" "$file"

    if [[ -z "$(git status --porcelain)" ]]; then
      echo "  No changes needed in $repo (pin/hash already current, or pattern didn't match - check by hand)."
      git checkout --quiet main
      git branch -D "$branch" >/dev/null 2>&1 || true
      exit 0
    fi

    git add "$file"
    git commit --quiet -m "Bump switcher.js/app.css pin to ${VERSION}

Automated by datacarebot-theme/scripts/release.sh - updates both the
version pin and the Subresource Integrity hash together (see the
security audit for why they now travel as a pair)."
    git push --quiet -u origin "$branch"
    url=$(gh pr create --title "Bump switcher.js/app.css pin to ${VERSION}" --body "Automated by \`datacarebot-theme/scripts/release.sh\`. Updates the pinned CDN version and its SRI hash together for \`app.css\`/\`switcher.js\`.

Review the diff before merging - this only touches the pin/hash, nothing else." )
    echo "  PR: $url"
  )
done

echo
echo "Done. Review and merge each PR, then redeploy (docker compose up -d --build) in each app - the pin is baked into the image, a plain restart won't pick it up."
