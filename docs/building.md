# Building GlossCode

GlossCode is one program built from three parts:

- **The core** (`src/core/`): portable C99, standard library only. It reads G-code, tracks modes in the order the control runs the lines, gives each word its English word, and runs the checks. Everything it knows about codes and controls comes from `data/`.
- **The platform file** (`src/platform/`): `platform_win32.c` on Windows, `platform_posix.c` on Linux. Reading and writing files, the settings and cache folders, portable mode, opening links.
- **The shell** (`src/app/`): opens a [webview](https://github.com/webview/webview) window, shows the UI (`docs/mockup/index.html`, compiled in), and connects it to the core and the system file dialogs ([nativefiledialog-extended](https://github.com/btzy/nativefiledialog-extended)).

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

The result is `build/GlossCode.exe`: one file with the UI, the dictionary, the rules and the built-in library inside, linked statically so it needs no MinGW DLLs. The WebView2 runtime it uses comes with Windows 10 and 11. The webview library's build also downloads the WebView2 SDK headers from NuGet.

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

## Tests

| Test | What it checks |
|---|---|
| `test_core` | Number formatting, the JSON reader, splitting lines into words, reading and writing files (line endings, `;`, Latin-1), machine profile overrides, the JSON interface, and 300 random programs that must not crash the core |
| `test_golden` | The core against the mockup: every word's English, unit and description, and every problem, for each sample program on each machine |
| `app_smoke` | The program itself: opens a sample through the app's functions, runs the core, saves a copy with one line changed, and checks that nothing else in the file changed |

`test_golden` compares against files in `tests/golden/`, which `node scripts/make-core-goldens.mjs` writes by running the mockup's own JavaScript on every program in `examples/` and `tests/cases/`. After changing the mockup's translation or checks, or the data files, run it again; CI fails if the files are out of date. If the core and the mockup disagree, the test prints the word or problem that differs.

## Options when running

```
GlossCode.exe [--data <folder>] [--ui <file.html>] [--debug] [file]
```

- `--data <folder>` loads `gcode-words.json`, `gcode-rules.json` and `library/` from a folder instead of the copies inside the program, so the tables can be edited without rebuilding (`--data data`).
- `--ui <file.html>` loads the UI from a file instead (`--ui docs/mockup/index.html`).
- `--debug` turns on the webview's developer tools.
- A file name opens that file at start-up.

## How the UI talks to the program

In the program, `window.GlossCodeNative` is set before the page loads (`src/app/bridge.js`). The page checks for it: File › Open, Save and Save As then use the system dialogs, and the About window shows the real version and whether the copy is portable. In a browser it isn't there, and the mockup uses its sample files.

| Function | What it does |
|---|---|
| `GlossCodeNative.open(fromPath)` | Shows the Open dialog and reads the file; resolves with `{ path, name, latin1, doc }` or `null` |
| `GlossCodeNative.save({ path, name, latin1, doc })` | Writes the file (with the Save dialog when `path` is `null`); resolves with `{ path, name, bytes }` |
| `GlossCodeNative.core(method, params)` | Runs a core method: `parse`, `serialize`, `analyze` or `tokenize` (see `src/core/gc_api.c`) |
| `GlossCodeNative.startup()` | The file named on the command line, read like `open()` |
| `GlossCodeNative.openPath(path)` | Reads a file from the recent list, like `open()` without the dialog |
| `GlossCodeNative.exists(path)` | Whether a file is still there, so a recent program that was moved or deleted can ask to be located or removed |
| `GlossCodeNative.settings()`, `saveSettings(obj)` | Reads and writes `settings.json` in the settings folder (recent files, default machines by file type) |
| `GlossCodeNative.openUrl(url)`, `setTitle(text)`, `quit()` | Open a link in the browser, set the window title, close the window |

Saving keeps every line that wasn't changed exactly as it was read (spacing, `%`, block delete `/`, macro text), writes changed lines from their words, keeps the file's line endings, and writes a Latin-1 file back as Latin-1. The file is written to a temporary file first and then swapped in, so a failed save never leaves half a file.

The UI still draws its English words and problems with its own JavaScript, which `test_golden` keeps identical to the core. Moving the drawing over to `GlossCodeNative.core("analyze", …)` is the next step.

The sample programs aren't built into the program. In `docs/mockup/index.html` they sit between `/* samples */` and `/* end samples */` markers, and `cmake/strip-samples.cmake` replaces everything between them with `null` in the copy that gets embedded, so the program starts on its home page with no samples. `scripts/package-examples.sh` puts `examples/` and the example library files in their own download, `GlossCode-<version>-examples.zip`.

## Packages

The release files ([releasing.md](releasing.md#release-files)) are made from a finished build by three scripts. CI runs them on every push, so each build's artifacts are the files a release would have, and the release workflow attaches them to a draft release.

| Script | Makes | Needs |
|---|---|---|
| `scripts/package-linux.sh [build] [dist]` | `.deb`, `.rpm` and the portable `.tar.gz` | [nFPM](https://nfpm.goreleaser.com): `go install github.com/goreleaser/nfpm/v2/cmd/nfpm@v2.48.0` |
| `scripts/package-windows.ps1 [-Build build] [-Out dist]` | The installer and the portable `.zip` | [Inno Setup](https://jrsoftware.org/isinfo.php) 6.3 or later |
| `scripts/package-examples.sh [dist]` | `GlossCode-<version>-examples.zip` | `zip` |

- On Linux, `cmake --install` puts the program in `bin/`, `glosscode.desktop` in `share/applications/`, the icons in `share/icons/hicolor/` and the license notices in `share/doc/glosscode/`; `packaging/linux/nfpm.yaml` makes both packages from those files. They depend on the distribution's GTK 3 and WebKitGTK 4.1, and the program needs glibc 2.35 or later (Ubuntu 22.04, Debian 12, Fedora 36 and newer).
- On Windows, `packaging/windows/glosscode.iss` installs `GlossCode.exe` for the current user into `%LOCALAPPDATA%\Programs\GlossCode`, with a Start menu entry, an optional desktop shortcut, an optional **Open with** entry for `.nc` files, and an uninstaller that leaves the settings folder alone.
- Both portable archives hold one folder with the program, an empty `portable` file, the license notices, the changelog and `packaging/portable-readme.txt`.
- `scripts/release-notes.sh` prints a version's section of `CHANGELOG.md` with the download table, for the release description.
