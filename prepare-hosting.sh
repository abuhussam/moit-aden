#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

rm -rf hosting-dist
mkdir -p hosting-dist

cp index.html ops.html \
   analytics-v54.js closure-v54.js hybrid-v54.js \
   sw.js manifest.json manifest-ops.json \
   icon-192.png icon-512.png hosting-dist/

echo "Hosting files:"
ls -1 hosting-dist
echo "Total files: $(ls -1 hosting-dist | wc -l)"
