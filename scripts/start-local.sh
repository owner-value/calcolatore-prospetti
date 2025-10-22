#!/usr/bin/env sh
# find a free port between 3002 and 3010 and start the backend on it
for p in 3002 3003 3004 3005 3006 3007 3008 3009 3010; do
  if ! lsof -iTCP:${p} -sTCP:LISTEN -Pn >/dev/null 2>&1; then
    echo "Starting backend on port ${p}"
    PORT=${p} node backend/app.js &
    echo $!
    exit 0
  fi
done
echo "No free port found in 3002..3010" >&2
exit 1
