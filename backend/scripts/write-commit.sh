#!/usr/bin/env sh
# Write the current git short commit to backend/config/commit.json
OUTFILE="$(dirname "$0")/../config/commit.json"
COMMIT=""
if [ -n "$COMMIT_SHA" ]; then
  COMMIT="$COMMIT_SHA"
elif [ -n "$RENDER_GIT_COMMIT" ]; then
  # Render injects the deployed commit during build; git checkout may be absent
  COMMIT="$RENDER_GIT_COMMIT"
else
  if command -v git >/dev/null 2>&1; then
    COMMIT=$(git rev-parse --short HEAD 2>/dev/null || true)
  fi
fi
# normalize to short 7-char sha
COMMIT=$(printf '%s' "$COMMIT" | cut -c1-7)
if [ -z "$COMMIT" ]; then
  echo "{}" > "$OUTFILE"
  exit 0
fi
mkdir -p "$(dirname "$OUTFILE")"
cat > "$OUTFILE" <<EOF
{ "commit": "${COMMIT}" }
EOF
echo "Wrote commit ${COMMIT} to $OUTFILE"
