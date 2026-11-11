# Architecture

GlossCode targets Windows first. Everything is arranged so that a native Linux build is mostly a recompile.

## Layers

```
+--------------------------------------------------------------+
|  UI (HTML/CSS/JS in a native webview)                        |
|  editor, gloss, checks, simulation, tabs, modes panel        |
+------------------------------^-------------------------------+
                               |  JSON messages (webview bind)
+------------------------------v-------------------------------+
|  Core (portable C, standard library only)                    |
|  reading and writing files (parser · writer)                 |
+------------------------------^-------------------------------+
                               |  ~8 functions
+------------------------------v-------------------------------+
|  Platform file: platform_win32.c / platform_posix.c          |
+--------------------------------------------------------------+
```

### Core (portable C)

The core reads and writes G-code files:

- **Parser**: splits each line into words (`N40`, `M03`, `G97`, `S6000`) and keeps comments whole, with each control's own block syntax (Fagor 8055 and 8060, Heidenhain Klartext). Remembers each file's line endings, since G-code is often CRLF.
- **Writer**: writes every line that wasn't changed exactly as it was read, and changed lines from their words.

Rules for the core: C standard library only (`stdio`, `stdlib`, `string`), no `windows.h`, UTF-8 everywhere, `/` in paths, and no compiler-specific extensions.

The core lives in `src/core/`: `gc_doc.c` (reading and writing files), `gc_json.c` (the JSON reader and writer), `gc_util.c` (strings and numbers), and `gc_api.c` (the JSON methods the UI calls). A file that isn't valid UTF-8 is read as Latin-1, as older controls and DNC software write, and saved back as Latin-1.

The gloss, the mode tracking, the checks and the simulation are done by the UI's JavaScript, the same code in the program and in a browser. `tests/golden/` records what it shows for every sample program; see [building.md](building.md#tests).

### Platform file

One file per OS with the same small set of functions:

| Function | Windows | Linux |
|---|---|---|
| List a folder | `FindFirstFileW` | `opendir` |
| Read / write a file (written to a temporary file, then swapped in) | `CreateFileW`, `MoveFileExW` | `open`, `rename` |
| Watch a file for changes (not written yet) | `ReadDirectoryChangesW` | `inotify` |
| Settings folder | `%APPDATA%\GlossCode` | `$XDG_CONFIG_HOME/glosscode` (usually `~/.config/glosscode`) |
| Open / save dialog | nativefiledialog-extended (`IFileOpenDialog`) | nativefiledialog-extended (GTK / portal) |
| Create the window | webview (WebView2) | webview (WebKitGTK) |

### UI

The UI is plain HTML, CSS and JavaScript loaded into the webview. It talks to the core through the webview library's bind calls, passing JSON (`window.GlossCodeNative`, listed in [building.md](building.md#how-the-ui-talks-to-the-program)). The page is [`src/ui/index.html`](../src/ui/index.html), which loads its styles from `src/ui/css/` and its scripts from `src/ui/js/`, one file per part of the screen (reading lines, gloss, checks, editor, simulation, menus, tabs, and each dialog). The scripts load in order and share one global scope, so a file can use what an earlier one defines. The program's build joins them into one page (`cmake/bundle-ui.cmake`), compiles it in (without the sample programs) and shows it filling the window; opened in a browser, it runs the same screen with the sample programs and a pretend Open dialog.

## Build

- MinGW-w64 or clang on Windows, gcc or clang on Linux.
- Avoid .NET, MFC, the registry and MSVC-only features.
- WebView2 ships with Windows 10 and 11, so the .exe stays small.

## Packaging

GlossCode ships as **one executable**. Nothing it needs to start sits beside it.

- **The UI is embedded.** The HTML, CSS and JavaScript are compiled into the program (a generated C array, or a Windows resource) and served to the webview from memory.
- **The built-in data is embedded.** `gcode-words.json`, `gcode-rules.json`, the built-in machine definitions and the built-in subprogram library are in `src/ui/data.js` (written by `scripts/make-ui-data.mjs`), which is joined into the page. They are read-only and are replaced by each release.
- **Windows**: build with `-static` so the MinGW runtime is inside the .exe, and use the webview library's built-in WebView2 loader so `WebView2Loader.dll` isn't needed. The WebView2 runtime itself comes with Windows 10 and 11.
- **Linux**: the same single executable, linked against the system's GTK and WebKitGTK packages, which are listed as dependencies rather than bundled. An AppImage or distribution package can come later if needed.
- A development flag (`--ui src/ui/index.html`) loads the UI page and its files from disk instead, so the page can be edited without a rebuild.

### Where user files go

The program never writes beside itself. Everything the user or shop creates goes in the platform's standard user data folder:

| What | Windows | Linux |
|---|---|---|
| Settings (`settings.json`: recent files with the machine each was opened for, default machines by file type), personal machine definitions, personal library | `%APPDATA%\GlossCode\` (`machines\`, `library\`) | `$XDG_CONFIG_HOME/glosscode/` (usually `~/.config/glosscode/`) |
| WebView data and caches (safe to delete) | `%LOCALAPPDATA%\GlossCode\` | `$XDG_CACHE_HOME/glosscode/` (usually `~/.cache/glosscode/`) |
| Shop folder | Wherever Settings points (often a network path) | Same |

The WebView2 user data folder must be set to `%LOCALAPPDATA%\GlossCode\WebView2` explicitly; by default WebView2 creates it beside the .exe, which fails under `Program Files`.

To change a built-in machine, the user picks **Make my own copy** (a new file that `extends` the built-in one) or saves a file with the same id in the personal or shop folder to replace it (marked **modified built-in**). **Export** writes out any built-in file for reference. Because the built-in files are inside the program, an update can never overwrite a user's changes, and a user's changes can never break the built-in files.

### Portable mode

If a file named `portable` sits beside the .exe, GlossCode keeps settings, personal files and caches in a `GlossCode-data` folder beside the .exe instead. This is for running from a USB drive or a shared folder at the machine. Without that file, the standard folders above are used.

## Data files

- `data/gcode-words.json`: the base dictionary. Each code has a full word (`words`, such as `run.rapid`), a `short` word and a description. Codes that differ between machine types have `mill` and `lathe` entries.
- `data/gcode-rules.json`: the checks' messages and severities, and per-control tables (Fanuc, Haas, Okuma; mill and lathe) that inherit from each other. The same tables drive the hint text for missing words (`wordHints` plus the cycle word lists), and `cycleHelp` holds the canned cycle guide's text.
- Machine profiles (`machines/<id>.json`, see machine definitions below): name, control, dialect, mill or lathe, limits, brand codes, and `eob` (true when every line must end with `;`). The parser treats `;` as an end of block on every machine; the writer adds it when the profile says so.
- The UI reads both from `src/ui/data.js`. After changing either (or `data/library/`, `examples/` or `VERSION`), run `node scripts/make-ui-data.mjs`; CI checks the files are up to date.
- Machine definitions: per-machine JSON files built in layers (process base, control, model, shop machine) that hold the words, cycles and check settings for each machine. Proposed in [machine-definitions.md](machine-definitions.md).
