#!/bin/sh
# Packages the web app for running on your own web server: <out>/GlossCode-<version>-web.zip, holding
# GlossCode-<version>-web/ with the app's files, README.txt (packaging/web-readme.txt) and LICENSE.
#   scripts/package-web.sh <core.wasm> [out-dir]      (default dist)
# core.wasm comes from scripts/build-wasm.sh. Needs Node and zip.
set -eu
wasm=$1
out=${2:-dist}
src=$(cd "$(dirname "$0")/.." && pwd)
version=$(tr -d ' \r\n' < "$src/VERSION")
top="GlossCode-$version-web"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
node "$src/scripts/build-site.mjs" --wasm "$wasm" --app-only --out "$work/$top"
sed "s/@VERSION@/$version/g" "$src/packaging/web-readme.txt" > "$work/$top/README.txt"
cp "$src/LICENSE" "$work/$top/LICENSE.txt"
mkdir -p "$out"
out=$(cd "$out" && pwd)
rm -f "$out/$top.zip"
# Same dates and order every time, so the same sources give the same zip.
find "$work/$top" -exec touch -h -d "$(git -C "$src" log -1 --format=%cI 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)" {} +
(cd "$work" && find "$top" -type f | LC_ALL=C sort | zip -X -q -@ "$out/$top.zip")
echo "$out/$top.zip: $(wc -c < "$out/$top.zip") bytes"
