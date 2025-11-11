#!/usr/bin/env sh
# start-web.sh
# Serves the static frontend over HTTP so the browser fetches the API without CORS issues.
# Usage: npm run start:web [-- <port>]

set -eu

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-${PORT:-8000}}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 non trovato. Installa Python 3 oppure modifica scripts/start-web.sh per usare un altro server statico." >&2
  exit 1
fi

cd "$PROJECT_ROOT"

cat <<INFO
Servendo la cartella "$PROJECT_ROOT" tramite HTTP.
URL: http://localhost:${PORT}/index.html
(Per l'archivio: http://localhost:${PORT}/pages/archivio/index.html#api=https://calcolatore-prospetti.onrender.com)
Premi CTRL+C per fermare il server.
INFO

FRONTEND_URL="http://localhost:${PORT}/index.html"
if [ -z "${CI:-}" ]; then
  if command -v open >/dev/null 2>&1; then
    open "${FRONTEND_URL}" >/dev/null 2>&1 &
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${FRONTEND_URL}" >/dev/null 2>&1 &
  fi
fi

python3 -m http.server "$PORT"
