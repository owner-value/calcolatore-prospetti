#!/usr/bin/env sh
# start-local.sh
# Looks for a free port in the configured range and starts the backend there.
# You can override the port by setting the PORT environment variable.

if [ -n "${PORT:-}" ]; then
  echo "Using explicit PORT=${PORT}"
  node backend/app.js &
  echo $!
  exit 0
fi

START=3002
END=3020
for p in $(seq $START $END); do
  if ! lsof -iTCP:${p} -sTCP:LISTEN -Pn >/dev/null 2>&1; then
    echo "Starting backend on port ${p}"
    PORT=${p} node backend/app.js &
    echo $!
    exit 0
  fi
done

echo "No free port found in ${START}..${END}. You can set PORT to force a port (e.g. PORT=3011 ./scripts/start-local.sh)" >&2
exit 1
