#!/usr/bin/env bash
# Builds a zip that runs without a build step on the host: compiled code, production dependencies only.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)"
OUT="release/rolewise-$VERSION"

# Build in place without reinstalling: reinstalling under a running dev server fails on Windows file locks.
[ -d backend/node_modules ] || npm ci --prefix backend
[ -d frontend/node_modules ] || npm ci --prefix frontend
npm run build --prefix backend
npm run build --prefix frontend
rm -rf "$OUT" && mkdir -p "$OUT/backend" "$OUT/frontend/dist"
cp -r backend/dist backend/migrations backend/package.json backend/package-lock.json "$OUT/backend/"
cp -r frontend/dist/frontend "$OUT/frontend/dist/"
cp package.json "$OUT/"
(cd "$OUT/backend" && npm ci --omit=dev --silent)
(cd release && python -c "import shutil,sys; shutil.make_archive(sys.argv[1], 'zip', sys.argv[1])" "rolewise-$VERSION")
echo "Created release/rolewise-$VERSION.zip"
