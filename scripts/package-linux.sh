#!/bin/sh
# Makes the Linux release files from a finished build:
#   GlossCode-<version>-linux-amd64.deb
#   GlossCode-<version>-linux-x86_64.rpm
#   GlossCode-<version>-linux-x86_64-portable.tar.gz
#
#   scripts/package-linux.sh [build-folder] [output-folder]     (defaults: build, dist)
#
# Needs nFPM (https://nfpm.goreleaser.com) on the PATH for the .deb and .rpm:
#   go install github.com/goreleaser/nfpm/v2/cmd/nfpm@v2.48.0
set -eu

src=$(cd "$(dirname "$0")/.." && pwd)
build=$(cd "${1:-build}" && pwd)
mkdir -p "${2:-dist}"
out=$(cd "${2:-dist}" && pwd)
version=$(tr -d ' \r\n' < "$src/VERSION")
work="$build/package"

rm -rf "$work"
mkdir -p "$work"

# The files the packages install, staged under $work/stage/usr.
DESTDIR="$work/stage" cmake --install "$build" --prefix /usr --strip

# .deb and .rpm from the staged files.
command -v nfpm >/dev/null || { echo "nfpm isn't installed; see the top of this script" >&2; exit 1; }
export GC_VERSION="$version"
cd "$work"   # the src: paths in nfpm.yaml are relative to here
cat "$src/LICENSE" - "$src/THIRD_PARTY_NOTICES.md" > copyright <<'TXT'

----------------------------------------------------------------------

TXT
cp "$src/packaging/linux/postinstall.sh" postinstall.sh
nfpm package --config "$src/packaging/linux/nfpm.yaml" --packager deb --target "$out/GlossCode-$version-linux-amd64.deb"
nfpm package --config "$src/packaging/linux/nfpm.yaml" --packager rpm --target "$out/GlossCode-$version-linux-x86_64.rpm"

# Portable archive: the program, an empty "portable" file (settings stay in GlossCode-data beside it),
# the icon and desktop file for anyone who wants to add a menu entry, and the license notices.
top="GlossCode-$version"
p="$work/portable/$top"
mkdir -p "$p"
cp "$work/stage/usr/bin/glosscode" "$p/glosscode"
: > "$p/portable"
cp "$src/assets/logo/glosscode-256.png" "$p/glosscode.png"
cp "$src/packaging/linux/glosscode.desktop" "$p/glosscode.desktop"
cp "$src/LICENSE" "$p/LICENSE.txt"
cp "$src/THIRD_PARTY_NOTICES.md" "$p/THIRD_PARTY_NOTICES.txt"
cp "$src/CHANGELOG.md" "$p/CHANGELOG.txt"
cp "$src/packaging/portable-readme.txt" "$p/README.txt"
tar -C "$work/portable" --owner=0 --group=0 --numeric-owner --sort=name \
    -czf "$out/GlossCode-$version-linux-x86_64-portable.tar.gz" "$top"

ls -l "$out"
