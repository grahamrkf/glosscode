#!/bin/sh
# Builds the C core as WebAssembly for the web app: <out>/core.wasm (src/web/core_wasm.c plus src/core).
#   scripts/build-wasm.sh [out-dir]          (default build-web)
# Needs clang and wasm-ld with the WASI C library. On Debian or Ubuntu:
#   sudo apt install clang lld wasi-libc libclang-rt-dev-wasm32   (Ubuntu 24.04: libclang-rt-18-dev-wasm32)
# Set CLANG to use another clang (CLANG=clang-18).
set -eu
out=${1:-build-web}
cc=${CLANG:-clang}
cd "$(dirname "$0")/.."
mkdir -p "$out"
"$cc" --target=wasm32-wasi -O2 -std=c99 -Wall -Wextra -Werror -mexec-model=reactor \
    -Isrc/core src/core/gc_util.c src/core/gc_json.c src/core/gc_doc.c src/core/gc_api.c src/web/core_wasm.c \
    -Wl,--strip-all -o "$out/core.wasm"
echo "$out/core.wasm: $(wc -c < "$out/core.wasm") bytes"
