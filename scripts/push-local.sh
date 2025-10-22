#!/usr/bin/env sh
# Commit & push local changes for both frontend and backend
MSG=${1:-"Update from local"}

echo "Committing and pushing local changes..."
git add -A
git commit -m "$MSG" || true
git push origin main || { echo "Push failed"; exit 2; }
echo "Push done."