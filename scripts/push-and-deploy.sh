#!/usr/bin/env sh
# Simple helper: commit any changes, push to origin main, then poll render health until live.
# Usage: ./scripts/push-and-deploy.sh "Commit message"
MSG=${1:-"Update from local"}

# 1) commit & push
git add -A
git commit -m "${MSG}" || true
git push origin main || { echo "Push failed"; exit 2; }

# 2) determine render URL from backend/config/links.json if present
RENDER_URL=""
if [ -f backend/config/links.json ]; then
  RENDER_URL=$(node -e "console.log(require('./backend/config/links.json')['calcolatore-prospetti']?.render || '')")
fi
if [ -z "$RENDER_URL" ]; then
  echo "Render URL not found in backend/config/links.json. Provide URL as first argument or set it in that file." >&2
  echo "Usage: ./scripts/push-and-deploy.sh 'commit message' https://your-render-url"
  exit 3
fi

# 3) poll /_health until it returns 200 or timeout
echo "Polling ${RENDER_URL}/_health for readiness..."
TRIES=0
while [ $TRIES -lt 60 ]; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" ${RENDER_URL}/_health || echo "000")
  echo "status=${HTTP} (try ${TRIES})"
  if [ "$HTTP" = "200" ]; then
    echo "Deployment live: ${RENDER_URL}"
    exit 0
  fi
  TRIES=$((TRIES+1))
  sleep 5
done

echo "Timeout waiting for ${RENDER_URL} to become healthy" >&2
exit 4
