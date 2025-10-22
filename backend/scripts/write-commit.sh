#!/usr/bin/env sh
# Write the current git short commit to backend/config/commit.json
OUTFILE="$(dirname "$0")/../config/commit.json"
COMMIT=""
if [ -n "$COMMIT_SHA" ]; then
  COMMIT="$COMMIT_SHA"
else
  if command -v git >/dev/null 2>&1; then
    COMMIT=$(git rev-parse --short HEAD 2>/dev/null || true)
  fi
fi
if [ -z "$COMMIT" ]; then
  echo "{}" > "$OUTFILE"
  exit 0
fi
mkdir -p "$(dirname "$OUTFILE")"
cat > "$OUTFILE" <<EOF
{ "commit": "${COMMIT}" }
EOF
echo "Wrote commit ${COMMIT} to $OUTFILE"
