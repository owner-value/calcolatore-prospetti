#!/usr/bin/env sh
# start-local.sh
# Looks for a free port in the configured range, starts the backend, and opens the frontend.
# You can override the port by setting the PORT environment variable.

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)

open_frontend() {
  port="$1"
  if [ -n "${CI:-}" ]; then
    return
  fi
    index_path="${PROJECT_ROOT}/index.html"
    if [ ! -f "${index_path}" ]; then
      return
    fi
    file_url=$(python3 -c "import pathlib, sys; print(pathlib.Path(sys.argv[1]).resolve().as_uri())" "${index_path}")
    if [ -z "${file_url}" ]; then
      return
    fi
    api_fragment=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "http://localhost:${port}")
    target="${file_url}#api=${api_fragment}"
    if command -v open >/dev/null 2>&1; then
      open "${target}" >/dev/null 2>&1 &
    elif command -v xdg-open >/dev/null 2>&1; then
      xdg-open "${target}" >/dev/null 2>&1 &
    fi
}

is_port_free() {
  lsof -iTCP:"$1" -sTCP:LISTEN -Pn >/dev/null 2>&1
  if [ $? -eq 0 ]; then
    return 1
  fi
  return 0
}

launch_backend() {
  chosen_port="$1"
  if ! is_port_free "${chosen_port}"; then
    echo "Port ${chosen_port} is already in use. Stop the running process or choose another port." >&2
    exit 1
  fi
  echo "API listening on http://localhost:${chosen_port}"
  open_frontend "${chosen_port}"
  PORT=${chosen_port} node backend/app.js
  exit $?
}

if [ -n "${PORT:-}" ]; then
  launch_backend "${PORT}"
fi

START=3002
END=3020
for p in $(seq $START $END); do
  if ! lsof -iTCP:${p} -sTCP:LISTEN -Pn >/dev/null 2>&1; then
    launch_backend "${p}"
  fi
done

echo "No free port found in ${START}..${END}. You can set PORT to force a port (e.g. PORT=3011 ./scripts/start-local.sh)" >&2
exit 1
