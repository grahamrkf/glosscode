# Where to change what

A map from the usual jobs to the files they touch. [architecture.md](architecture.md) explains how the parts fit together; this page is for finding the right file fast.

## Before you start

Almost everything you see on screen is the UI's JavaScript in `src/ui/js/`, and it runs the same in a browser. Open `src/ui/index.html` in a browser to try a change: there's no build, and the sample programs are built in (`?open=POCKET_2X1.nc` opens one straight away). The C core in `src/core/` only reads and writes files.

After any change to the data, the gloss, the checks or the simulation:

```
node scripts/make-ui-data.mjs     # only after changing data/, examples/ or VERSION
node scripts/make-goldens.mjs     # records what the UI shows for every test program
git diff tests/golden             # read it: every changed gloss word, problem and toolpath move is listed
node tests/test_ui.mjs
```

CI fails if `src/ui/data.js` or the golden files are out of date. See [building.md](building.md#tests).

## The gloss

| To change | Look in |
|---|---|
| A code's full or short gloss word, or its description, on every control | `codes` in [`data/gcode-words.json`](../data/gcode-words.json). The rules for the words are in [gloss-words.md](gloss-words.md) |
| A gloss word on one control only (M98 is tailstock thrust on an Okuma E100L lathe) | `words` in that control's file, [`data/controls/<id>.json`](../data/controls/) |
| What an address letter reads as (X, F, S…) | `address` in `data/gcode-words.json` |
| How a word becomes its gloss (units, decimal points, values like `movx:1.0`) | `word()` and `fmtNum()` in [`src/ui/js/gloss.js`](../src/ui/js/gloss.js) |
| The modes carried from line to line (units, G90/G91, feed mode, the active cycle) | `applyModes()` and `trackCarry()` in `gloss.js` |
| How the code and gloss rows are drawn | [`src/ui/js/editor.js`](../src/ui/js/editor.js) (`textRowHTML`), colours and sizes in [`src/ui/css/main.css`](../src/ui/css/main.css) |
| The grey hint text for missing words (`G02` shows `R## or I## J##`) | `wordHints` in the control's `dialect`; `hintItems()` in `gloss.js` |

## Checks (the Problems panel)

| To change | Look in |
|---|---|
| A problem's message, title or severity | `rules` in [`data/gcode-rules.json`](../data/gcode-rules.json) |
| What a check looks for on one control (modal groups, a cycle's required words, foreign codes, M-codes per line) | the control's `dialect` in `data/controls/<id>.json`. Keys are listed in [checks.md](checks.md#how-the-rules-and-control-files-are-laid-out) |
| How a check works | [`src/ui/js/checks.js`](../src/ui/js/checks.js): `checkLine()` calls one function per group (`checkGrammar`, `checkSpindle`, `checkCycles`, `checkMove`…) |
| Add a new check | an entry in `rules`, an `emit(li, "your-rule-id", {…})` in the right group in `checks.js`, a row in the table in [checks.md](checks.md), and a line that triggers it in a program in `tests/cases/` |
| Klartext (Heidenhain) checks | `checkKlartext()` in [`src/ui/js/control-klartext.js`](../src/ui/js/control-klartext.js) |

## Controls and machines

| To change | Look in |
|---|---|
| Add a control | a new `data/controls/<id>.json` (usually `inherits` a close control and lists only what differs), its id in `controls` in `data/gcode-rules.json`, a manual review in [`docs/manual-reviews/`](manual-reviews/) (follow its [README](manual-reviews/README.md)), and a test program in `tests/cases/` with its machines in [`tests/machines.json`](../tests/machines.json). Its Generic machines appear in the picker on their own |
| Which controls a file looks like it was written for | `fileHints` in `data/gcode-rules.json` |
| A known machine model (Haas VF-2 specs) | `MACHINE_LIBRARY` in [`src/ui/js/machines.js`](../src/ui/js/machines.js) |
| The machine picker | `src/ui/js/tabs.js` (`pickerOrder` and the picker dialog) and `machines.js` |
| The Machine profiles window | [`src/ui/js/profiles.js`](../src/ui/js/profiles.js), markup in `#pdlg` in `src/ui/index.html` |
| A control with its own block syntax (Fagor, Klartext) | `blockSyntax` in its `dialect`, `tokenize()` in [`src/ui/js/reading.js`](../src/ui/js/reading.js) **and** `src/core/gc_doc.c` (the test `test_tokens` checks they agree) |

## Simulation, toolpath and timeline

| To change | Look in |
|---|---|
| How a move or canned cycle runs (the moves it makes) | `class SimRun` in [`src/ui/js/run-program.js`](../src/ui/js/run-program.js), one method per cycle |
| A cycle only Fagor or Okuma has | [`control-fagor.js`](../src/ui/js/control-fagor.js), [`control-okuma.js`](../src/ui/js/control-okuma.js) |
| Subprogram calls, macro variables, GOTO and WHILE in the simulation | `run-program.js` (`step()`, the jump and call handling) |
| How long the program takes | [`src/ui/js/sim-time.js`](../src/ui/js/sim-time.js) |
| Drawing the toolpath, the timeline and its symbols, playback | [`src/ui/js/simulation.js`](../src/ui/js/simulation.js) (`drawViews`, `drawTimeline`) |
| Colours of rapid, feed, arc and cycle moves | `KCOL` at the top of `simulation.js` |

## The editor and the screen

| To change | Look in |
|---|---|
| A menu item or a keyboard shortcut | `MENUS` and the `keydown` handler in [`src/ui/js/menus.js`](../src/ui/js/menus.js) |
| Typing, Enter, Backspace on a line | `onLineInput()`, `onLineKey()`, `commitLine()` in `editor.js` |
| Undo, paste, copy, line selection, the right-click menu, N numbers, Renumber | [`src/ui/js/editor-edit.js`](../src/ui/js/editor-edit.js) |
| The status bar, the info line, the active modes and variables panels | [`src/ui/js/editor-panels.js`](../src/ui/js/editor-panels.js) |
| Folding long runs of moves | [`src/ui/js/editor-fold.js`](../src/ui/js/editor-fold.js) |
| Find | [`src/ui/js/editor-find.js`](../src/ui/js/editor-find.js) |
| Subprogram calls in the editor (show, Go to, Beside) | [`src/ui/js/subprograms.js`](../src/ui/js/subprograms.js) |
| Tabs, the home page, recent files, Open and Save | [`src/ui/js/tabs.js`](../src/ui/js/tabs.js) |
| A dialog | its markup is a `.dim` box in `src/ui/index.html`, its code is the matching file in `src/ui/js/` (Insert cycle: `insert-menu.js`, hole pattern: `hole-pattern.js`, library: `library.js`, convert: `convert.js`, about: `about.js`, appearance: `appearance.js`), its styles in `src/ui/css/` |
| Fonts, text size and zoom | `src/ui/css/fonts.css` (made by `scripts/make-fonts.mjs`), `appearance.js` |
| A colour, or the dark theme | write colours as `var(--c-rrggbb)` (the light value), never `#rrggbb`, then run `node scripts/make-theme.mjs` to write `src/ui/css/theme.css` with its dark value (`--convert` turns raw colours into that form). `tests/test_ui.mjs` fails on a raw colour or an out-of-date `theme.css`. The colours a user can change (`--ink-code`, `--rapid`…) are listed in `NAMED` in the script and `COLORS` in `appearance.js` |

## Files, settings and the program

| To change | Look in |
|---|---|
| Reading and writing G-code files (line endings, `;`, Latin-1) | [`src/core/gc_doc.c`](../src/core/gc_doc.c) |
| The calls the UI makes into the program (open, save, settings, library) | [`src/app/main.c`](../src/app/main.c) (the C side), [`src/app/bridge.js`](../src/app/bridge.js) (`window.GlossCodeNative`), listed in [building.md](building.md#how-the-ui-talks-to-the-program) |
| Anything that differs between Windows and Linux (folders, dialogs, files) | `src/platform/platform_win32.c` and `platform_posix.c`, which share `platform.h` |
| The subprogram library | [`src/ui/js/library.js`](../src/ui/js/library.js), built-in entries in `data/library/`; see [subprogram-library.md](subprogram-library.md) |
| Converting to another control | [`src/ui/js/convert.js`](../src/ui/js/convert.js); see [converting.md](converting.md) |
| The sample programs | `examples/`, plus `SAMPLE_FILES` in `scripts/make-ui-data.mjs` (the machine each opens on) and `tests/machines.json` |
| The version, installers and releases | `VERSION`; see [releasing.md](releasing.md) |

## The order the page loads in

`src/ui/index.html` loads its scripts in a fixed order and they share one global scope: a file can use what an earlier file defines at its top level, and functions from any file once the page has started. `js/start.js` is last and starts the page. Some files keep their own names private inside `(() => { … })()` and hand out only what others need as `window.something`. `tests/test_ui.mjs` fails if two files define the same top-level name.
