# Building GlossCode

GlossCode is one program built from three parts:

- **The core** (`src/core/`): portable C99, standard library only. It reads G-code files into blocks and words and writes them back, keeping every unchanged line byte for byte.
- **The platform file** (`src/platform/`): `platform_win32.c` on Windows, `platform_posix.c` on Linux. Reading and writing files, the settings and cache folders, portable mode, opening links.
- **The shell** (`src/app/`): opens a [webview](https://github.com/webview/webview) window, shows the UI (`src/ui/`, joined into one page and compiled in, which does the gloss, checks and simulation in JavaScript), and connects it to the core and the system file dialogs ([nativefiledialog-extended](https://github.com/btzy/nativefiledialog-extended)).

CMake downloads webview 0.12.0 and nativefiledialog-extended 1.4.1 (pinned to their release commits) the first time it configures, so the build needs network access once.

## Windows

Install [MSYS2](https://www.msys2.org/), open the **UCRT64** shell, and install the compiler and tools:

```
pacman -S mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-cmake mingw-w64-ucrt-x86_64-ninja git
```

Then, in the repository folder:

```
cmake -S . -B build -G Ninja
cmake --build build
ctest --test-dir build
```

The result is `build/GlossCode.exe`: one file with the UI (and the dictionary, rules and built-in library it carries) inside, linked statically so it needs no MinGW DLLs. The WebView2 runtime it uses comes with Windows 10 and 11. The webview library's build also downloads the WebView2 SDK headers from NuGet.

## Linux

Install a compiler, CMake, and the GTK 3 and WebKitGTK 4.1 development packages. On Debian or Ubuntu:

```
sudo apt install build-essential cmake ninja-build pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev
```

Then the same three commands as on Windows. The result is `build/glosscode`. The smoke test (below) runs only when there is a display, or when `xvfb-run` is installed (package `xvfb`).

## Only the core

To build and test just the core, with no webview, GTK or WebView2 (for example on a server):

```
cmake -S . -B build -G Ninja -DGLOSSCODE_APP=OFF
cmake --build build
ctest --test-dir build
```

## The web app and the website

The web app is the same screen (`src/ui/`) with `src/web/bridge-web.js` in place of the program's bridge, and the core built as WebAssembly (`src/web/core_wasm.c` plus `src/core/`). It needs clang and wasm-ld with the WASI C library. On Debian or Ubuntu 24.04:

```
sudo apt install clang lld wasi-libc libclang-rt-18-dev-wasm32
scripts/build-wasm.sh build-web
node scripts/build-site.mjs --wasm build-web/core.wasm --out _site
```

`_site/` is the whole website as GitHub Pages serves it: the landing page (`site/index.html`), `download/`, `app/` (the web app) and `try/` (the browser demo with the sample programs). Serve it with any local server (`python3 -m http.server -d _site`) and open `http://localhost:8000/app/`; a `file://` address doesn't work, since browsers won't load WebAssembly or a service worker from local files. `scripts/package-web.sh build-web/core.wasm dist` makes the self-host package, `GlossCode-<version>-web.zip`, holding only the web app.

The web app's `GlossCodeNative` (below) works like the program's, with these differences:

- Open and Save use the browser's file pickers. With the File System Access API (Chrome, Edge) Save writes back to the file opened, and the file handles are kept in IndexedDB so the recent list can reopen them (the browser asks again for permission after a restart). Without it (Firefox, Safari) Open reads a copy, Save downloads one, and the recent list reopens the copy kept in IndexedDB.
- A browser gives no folder paths, so a file's "path" is its name, or `name (2)` when another file of that name is in the list. `platform` is `"web"` and `configDir` is `"this browser"`.
- Settings and the personal subprogram library are kept in IndexedDB (database `glosscode-app`), not files. `/try` keeps its settings in localStorage, apart from the app's.
- `sw.js` (a service worker) keeps every file of the app for offline use. `build-site.mjs` names its cache after the version and a hash of the files, so any change to the site is picked up the next time the app starts. `manifest.webmanifest` makes it installable and lets an installed copy open `.nc` files.

## Tests

| Test | What it checks |
|---|---|
| `test_core` | Number formatting, the JSON reader, splitting lines into words, reading and writing files (line endings, `;`, Latin-1), the JSON interface, and 300 random programs that must not crash the reader or writer |
| `test_tokens` | The core splits every program in `examples/` and `tests/cases/` into the same words as the UI (the words in `tests/golden/*.json`). If it fails after a change to `src/ui/js/reading.js` or `src/core/gc_doc.c`, make the same change in the other one |
| `app_smoke` | The program itself: opens a sample through the app's functions, runs a core method, saves a copy with one line changed, and checks that nothing else in the file changed |

Two more checks run the UI's JavaScript in Node (no browser needed); CI runs both:

- `node scripts/make-goldens.mjs --check`: the files in `tests/golden/` record every word's gloss, unit and description, and every problem, for each program in `examples/` and `tests/cases/` on each machine (`tests/machines.json` says which machines each program runs on); `tests/golden/sim/` records every step and toolpath move the simulation makes of each. After changing the gloss, the checks, the simulation or the data files, run `node scripts/make-ui-data.mjs` (for data files) and then `node scripts/make-goldens.mjs` and look over the diff: it shows exactly what changed on screen.
- `node tests/test_web.mjs _site`: the website in Chromium (Playwright): the pages load, every program in `examples/` and `tests/cases/` opened and saved in the web app comes back byte for byte, a changed block changes only its line, Latin-1 and `;` marks are kept, the recent list, settings and library survive a reload, the app starts offline, and Open and Save work without the File System Access API. Build `_site` first (above) and install Playwright (`npm install --no-save playwright` and `npx playwright install chromium`). CI runs it in the Web app job.
- `node tests/test_ui.mjs`: a few gloss and check cases on controls the samples don't cover, and a check that no two scripts define the same global name (they share one scope).

## Options when running

```
GlossCode.exe [--ui <file.html>] [--debug] [file]
```

- `--ui <file.html>` loads the UI from disk instead (`--ui src/ui/index.html`, which finds its `css/` and `js/` files beside it), so the page can be edited without rebuilding.
- `--debug` turns on the webview's developer tools.
- A file name opens that file at start-up.

## How the UI talks to the program

In the program, `window.GlossCodeNative` is set before the page loads (`src/app/bridge.js`; in the web app, `src/web/bridge-web.js`, see above). The page checks for it: File › Open, Save and Save As then use the system dialogs, and the About window shows the real version and whether the copy is portable. In a browser it isn't there, and the page uses its sample files.

| Function | What it does |
|---|---|
| `GlossCodeNative.open(fromPath)` | Shows the Open dialog and reads the file; resolves with `{ path, name, latin1, doc }` or `null` |
| `GlossCodeNative.save({ path, name, latin1, doc })` | Writes the file (with the Save dialog when `path` is `null`); resolves with `{ path, name, bytes }` |
| `GlossCodeNative.core(method, params)` | Runs a core method: `parse`, `serialize` or `tokenize` (see `src/core/gc_api.c`) |
| `GlossCodeNative.startup()` | The file named on the command line, read like `open()` |
| `GlossCodeNative.openPath(path)` | Reads a file from the recent list, like `open()` without the dialog |
| `GlossCodeNative.exists(path)` | Whether a file is still there, so a recent program that was moved or deleted can ask to be located or removed |
| `GlossCodeNative.settings()`, `saveSettings(obj)` | Reads and writes `settings.json` in the settings folder (recent files, default machines by file type) |
| `GlossCodeNative.openUrl(url)`, `setTitle(text)`, `quit()` | Open a link in the browser, set the window title, close the window |

Saving keeps every line that wasn't changed exactly as it was read (spacing, `%`, block delete `/`, macro text), writes changed lines from their words, keeps the file's line endings, and writes a Latin-1 file back as Latin-1. The file is written to a temporary file first and then swapped in, so a failed save never leaves half a file.

The UI's data comes from two files that `node scripts/make-ui-data.mjs` writes (run it after changing `data/`, `examples/`, the example library or `VERSION`): `src/ui/data.js` (dictionary, rules, built-in library, version) and `src/ui/samples.js` (the sample programs and a shop's example library). `cmake/bundle-ui.cmake` joins `index.html` and its `css/` and `js/` files into the one page that gets embedded, leaving out `samples.js` and the example user's machines (between `/* samples */` and `/* end samples */` in `js/machines.js`), so the program starts on its home page with no samples. The code and gloss fonts (IBM Plex Mono and IBM Plex Sans, `assets/fonts/`, SIL Open Font License) are embedded in `src/ui/css/fonts.css` as data URLs, so the one-page program needs no font files; run `node scripts/make-fonts.mjs` after changing `assets/fonts/`. `scripts/package-examples.sh` puts `examples/` and the example library files in their own download, `GlossCode-<version>-examples.zip`.

## Packages

The release files ([releasing.md](releasing.md#release-files)) are made from a finished build by four scripts. CI runs them on every push, so each build's artifacts are the files a release would have, and the release workflow attaches them to a draft release.

| Script | Makes | Needs |
|---|---|---|
| `scripts/package-linux.sh [build] [dist]` | `.deb`, `.rpm` and the portable `.tar.gz` | [nFPM](https://nfpm.goreleaser.com): `go install github.com/goreleaser/nfpm/v2/cmd/nfpm@v2.48.0` |
| `scripts/package-windows.ps1 [-Build build] [-Out dist]` | The installer and the portable `.zip` | [Inno Setup](https://jrsoftware.org/isinfo.php) 6.3 or later |
| `scripts/package-examples.sh [dist]` | `GlossCode-<version>-examples.zip` | `zip` |
| `scripts/package-web.sh <core.wasm> [dist]` | `GlossCode-<version>-web.zip`, the web app for your own server | Node and `zip`; `core.wasm` from `scripts/build-wasm.sh` |

- On Linux, `cmake --install` puts the program in `bin/`, `glosscode.desktop` in `share/applications/`, the icons in `share/icons/hicolor/` and the license notices in `share/doc/glosscode/`; `packaging/linux/nfpm.yaml` makes both packages from those files. They depend on the distribution's GTK 3 and WebKitGTK 4.1, and the program needs glibc 2.35 or later (Ubuntu 22.04, Debian 12, Fedora 36 and newer).
- On Windows, `packaging/windows/glosscode.iss` installs `GlossCode.exe` for the current user into `%LOCALAPPDATA%\Programs\GlossCode`, with a Start menu entry, an optional desktop shortcut, an optional **Open with** entry for `.nc` files, and an uninstaller that leaves the settings folder alone.
- Both portable archives hold one folder with the program, an empty `portable` file, the license notices, the changelog and `packaging/portable-readme.txt`.
- `scripts/release-notes.sh` prints a version's section of `CHANGELOG.md` with the download table, for the release description.
