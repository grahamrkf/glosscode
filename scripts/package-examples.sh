#!/bin/sh
# Makes GlossCode-<version>-examples.zip: the sample programs (examples/) and the example
# subprogram library files (docs/subprogram-library/examples/), which aren't part of the program.
#
#   scripts/package-examples.sh [output-folder]     (default: dist)
set -eu
src=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "${1:-dist}"
out=$(cd "${1:-dist}" && pwd)
version=$(tr -d ' \r\n' < "$src/VERSION")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

top="GlossCode-$version-examples"
mkdir -p "$work/$top/programs" "$work/$top/library"
cp "$src"/examples/* "$work/$top/programs/"
cp "$src"/docs/subprogram-library/examples/* "$work/$top/library/"
cat > "$work/$top/README.txt" <<TXT
GlossCode $version examples

programs/  Sample programs for Haas, Fanuc and Okuma mills and lathes.
           Open them with File > Open.
library/   An example subprogram library file, showing the file format
           (https://github.com/grahamrkf/glosscode/blob/main/docs/subprogram-library.md).

These are examples only. Check every program against your machine's manual
and prove it out before running it on a machine.
TXT
rm -f "$out/$top.zip"
(cd "$work" && find "$top" -type f | LC_ALL=C sort | zip -q -X "$out/$top.zip" -@)
ls -l "$out/$top.zip"
