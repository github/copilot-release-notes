#!/usr/bin/env bash
set -euo pipefail

NEXT=$1
NOTES_FILE=$2
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

if [ -n "$MATCH_ID" ] && [ "$MATCH_DRAFT" != "true" ]; then
  echo "::error::$NEXT already exists as a published release"
  exit 1
fi

OTHER_DRAFTS=$(
  jq -r '.[][] | select(.draft) | .tag_name' "$RELEASES_FILE" |
    awk '/^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/' |
    awk -v next="$NEXT" '$0 != next' |
    sort -V
)
if [ -n "$OTHER_DRAFTS" ]; then
  echo "::error::Conflicting or stale draft release(s) must be resolved: ${OTHER_DRAFTS//$'\n'/, }"
  exit 1
fi

if [ -n "$MATCH_ID" ]; then
  gh api --method PATCH "repos/$GITHUB_REPOSITORY/releases/$MATCH_ID" \
    -f tag_name="$NEXT" \
    -f name="$NEXT" \
    -F body=@"$NOTES_FILE" \
    -F draft=true \
    -f target_commitish="$GITHUB_SHA"
else
  gh api --method POST "repos/$GITHUB_REPOSITORY/releases" \
    -f tag_name="$NEXT" \
    -f name="$NEXT" \
    -F body=@"$NOTES_FILE" \
    -F draft=true \
    -f target_commitish="$GITHUB_SHA"
fi
