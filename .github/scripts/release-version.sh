#!/usr/bin/env bash
set -euo pipefail

BUMP=$1
EXPECTED_BASE=${2:-}

LATEST=$(
  git tag --list |
    awk '/^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/' |
    sort -V |
    tail -n 1
)
if [ -z "$LATEST" ]; then
  LATEST="v0.0.0"
fi
if [ -n "$EXPECTED_BASE" ] && [ "$EXPECTED_BASE" != "$LATEST" ]; then
  echo "::error::Latest stable release advanced from $EXPECTED_BASE to $LATEST; retry automation"
  exit 1
fi

case "$BUMP" in
  major|minor|patch) ;;
  *)
    echo "::error::Invalid version bump: $BUMP"
    exit 1
    ;;
esac

IFS='.' read -r MAJOR MINOR PATCH <<< "${LATEST#v}"
case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

echo "previous=$LATEST" >> "$GITHUB_OUTPUT"
echo "next=v${MAJOR}.${MINOR}.${PATCH}" >> "$GITHUB_OUTPUT"
echo "major=v${MAJOR}" >> "$GITHUB_OUTPUT"
