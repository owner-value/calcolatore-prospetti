#!/usr/bin/env sh
# Usage: ./scripts/show-version.sh [url]
URL=${1:-http://localhost:3006}
echo "Checking version and links at $URL"
echo "/_version:"; curl -s ${URL}/_version || true; echo "\n/_links:"; curl -s ${URL}/_links || true; echo ""
