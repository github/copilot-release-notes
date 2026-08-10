#!/usr/bin/env bash
set -euo pipefail

NEXT=$1
MAJOR_TAG=$2
NOTES_FILE=$3
AUTOMATIC=$4
RELEASES_FILE="$RUNNER_TEMP/releases.json"

gh api --paginate --slurp \
  "repos/$GITHUB_REPOSITORY/releases?per_page=100" > "$RELEASES_FILE"

MATCH_COUNT=$(
  jq --arg tag "$NEXT" '[.[][] | select(.tag_name == $tag)] | length' \
    "$RELEASES_FILE"
)
if [ "$MATCH_COUNT" -gt 1 ]; then
  echo "::error::Multiple releases already use $NEXT"
  exit 1
fi

MATCH_ID=$(
  jq -r --arg tag "$NEXT" \
    '[.[][] | select(.tag_name == $tag)][0].id // empty' \
    "$RELEASES_FILE"
)
MATCH_DRAFT=$(
  jq -r --arg tag "$NEXT" \
    '[.[][] | select(.tag_name == $tag)][0].draft // empty' \
    "$RELEASES_FILE"
)

if [ "$AUTOMATIC" = "true" ] && [ "$MATCH_DRAFT" = "true" ]; then
  echo "::error::Automatic patch release refuses to publish existing draft $NEXT"
  exit 1
fi

if [ -n "$MATCH_ID" ]; then
  if [ "$MATCH_DRAFT" != "true" ]; then
    echo "::error::$NEXT is already published"
    exit 1
  fi
  gh api --method PATCH "repos/$GITHUB_REPOSITORY/releases/$MATCH_ID" \
    -f tag_name="$NEXT" \
    -f name="$NEXT" \
    -F body=@"$NOTES_FILE" \
    -F draft=false \
    -f target_commitish="$GITHUB_SHA"
else
  gh api --method POST "repos/$GITHUB_REPOSITORY/releases" \
    -f tag_name="$NEXT" \
    -f name="$NEXT" \
    -F body=@"$NOTES_FILE" \
    -F draft=false \
    -f target_commitish="$GITHUB_SHA"
fi

git fetch --force --tags origin
HIGHEST=$(
  gh api --paginate --slurp \
    "repos/$GITHUB_REPOSITORY/releases?per_page=100" |
    jq -r '.[][] | select((.draft | not) and (.prerelease | not)) | .tag_name' |
    awk -v major="${MAJOR_TAG#v}" \
      '$0 ~ ("^v" major "\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$")' |
    sort -V |
    tail -n 1
)
if [ -z "$HIGHEST" ]; then
  echo "::error::No stable release found for $MAJOR_TAG"
  exit 1
fi

git tag -f "$MAJOR_TAG" "${HIGHEST}^{commit}"
git push origin "refs/tags/$MAJOR_TAG" --force
