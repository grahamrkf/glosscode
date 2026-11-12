<img src="assets/logo/glosscode.svg" alt="GlossCode logo" width="96" align="left">

# GlossCode

GlossCode is a G-code editor that shows a gloss line in plain English above every line of code, with each code word lined up under its gloss word. It tracks active modes, colors rapid and feed moves, and expands subprogram calls inline.

> **Status: early development.** The program opens and saves files on Windows and Linux through a small core in C, and its screen (with the gloss, checks and simulation) is [`src/ui/index.html`](src/ui/index.html). Downloads for Windows and Linux are on the [Releases page](https://github.com/grahamrkf/glosscode/releases), starting with 0.1.0, a preview. The screenshots below come from the program. To build it, see [`docs/building.md`](docs/building.md).

> **Check every program on the machine before you cut.** GlossCode is new and hasn't been widely tested, so it can miss real problems and flag code that's fine. Its tables for each control are only as good as the manuals behind them, and machine builders' options and settings can change what a code does. Before running a part, prove the program out on the machine itself: run it through the control's own graphics or simulation, then a dry run or single block with the feed override turned down.
>
> **Supported controls.** The tables were checked against programming manuals for: Haas (NGC, classic and 1995 controls), Fanuc 0i-F/0i-D and Series 0, Okuma OSP mills and lathes (P300M, P200L, E100L, U10L and OSP700L), LinuxCNC, Tormach PathPilot, GRBL, Centroid CNC12, Mazak EIA/ISO, Hurco WinMax NC (ISNC), Mitsubishi M800/M80 mills and lathes and the M700/M70 M2/M0 format, Fanuc Custom Macro B expressions (from the 21i manual), Fagor 8055 mills and lathes, Fagor 8060/8065 mills and lathes (the lathe a first draft, still marked unverified), Heidenhain TNC 640 Klartext (a first draft, still marked unverified) Siemens SINUMERIK ISO mode, and Hypertherm Phoenix/EDGE plasma (still marked unverified). How sure we are of each is in [`docs/manual-reviews/control-confidence.md`](docs/manual-reviews/control-confidence.md). Some features of each are still unchecked; the reviews in [`docs/manual-reviews/`](docs/manual-reviews/) list them. **Any other control** (for example Heidenhain ISO programs, native Siemens programs, wire EDM, laser or waterjet) **hasn't been checked against a manual.** On those, GlossCode uses generic Fanuc-style rules, which may not match what your control does.

![The GlossCode editor](docs/images/editor-overview.png)

## What it looks like

Each line of code has its gloss above it in small grey text, and its N number in a column of its own:

```
       spindle.fwd set.rpm speed:6000
N40    M03 G97 S6000

       tlen.on toffset:01 movz:1.0 cool.on
N50    G43 H01 Z1.0 M08
```

The gloss words come from a dictionary of consistent abbreviations ([`data/gcode-words.json`](data/gcode-words.json)). Each code has a full word and a short one. Full words (the default) name what the code does as a group, then the action, such as `run.rapid` (G00), `run.feed` (G01), `set.inch` (G20), `tlen.on` (G43) and `cycle.peck` (G83). There are 20 fixed groups: `run` is for moves and other things the machine does on that line, `set` for modes that stay in effect, `cycle` for canned cycles, `call` and `flow` for subprograms and jumps, `prog` for the program itself, and a feature name (`spindle`, `cool`, `tool`, `tlen`, `ccomp`, `work`, `probe`, `thread`, `torch` and others) for the rest. Short words are the compact style: 3 to 8 characters, made from the group's core letters, an optional alternate and the option (`SFWD` spindle forward, `S2FWD` on the second spindle, `CON` coolant on, `TLON`, `WRK1` for G54, `INCH` and `INCR`). Two letters are used only for a standard abbreviation or a two-letter word (`MM`, `XY`, `IF`, `DO`). Codes that only some controls have are underlined with dots. A word with a value is its name, a colon and the value in full words (`tool:1`, `toffset:01`, `movz:1.0`, `speed:6000`), and the name and value run together in short words (`T1`, `H01`, `Z1.0`, `S6000`). N numbers read as written (`N40`). Numbers always show their decimal point (`X1.` reads `X1.0`), and a distance written without one is shown the way the control reads it, so `X1` reads `X0.0001`. Full words leave the unit off (`speed:600`); the info panel says whether it's RPM or surface speed. Short words keep a small unit that follows the active modes, so `S600` reads `S600 rpm` under G97 and `S600 sfm` under G96.

| Simulation | Problems panel |
|---|---|
| ![Simulation partway through a program, with the run time](docs/images/simulation.png) | ![Problems panel with mistakes found on purpose](docs/images/problems.png) |

| Lathe | Subprogram beside the program |
|---|---|
| ![A lathe program with the XZ toolpath and X timeline](docs/images/lathe.png) | ![A subprogram open in the pane beside the program](docs/images/subprogram-beside.png) |

| Insert a canned cycle | New program: pick a machine |
|---|---|
| ![Insert a peck drilling cycle](docs/images/insert-cycle.png) | ![Choosing the machine for a new program](docs/images/machine-picker.png) |

| Convert to another control |
|---|
| ![Converting a Haas program for a Fanuc mill](docs/images/convert.png) |

## Features

**Editing**
- Menu bar (File, Edit, View, Insert, Program, Simulate), undo and redo, and Find that matches both code and gloss.
- Starts on a home page with recent programs, New program and Open. Each open program gets a tab, and each tab remembers its machine and the selected line and word.
- A new program asks which machine it's for. A file opened before reopens with the same machine; any other file uses the default machine for its extension (.nc, .MIN…) if one is set, and otherwise asks, with the controls the file looks written for (from its extension and its text: CALL and RTS mean Okuma, BEGIN PGM Klartext) suggested at the top.
- The default layout shows each line as plain text, its N number in a column on the left and the gloss above it in small grey text (`speed:2100 spindle.fwd` over `S2100 M03`). Click a line and type, as in any text editor; the gloss follows.
- Editing like a text editor: ↑↓ move between lines, Enter breaks a line, Backspace at the start of a line joins it to the one above, and Esc undoes the changes to the line. Ctrl+Enter adds a new line below. Pasting a few lines or a whole program puts each line on a line of its own. Drag across lines (or Shift+↑↓) and right-click to copy, cut or duplicate them; Ctrl+D duplicates a section.
- Grey hint text after a code shows the words it still needs (`G02` shows `R## or I## J##`). Click one to fill it in; picking R hides I and J.
- A canned cycle guide (F1) with a sketch of each cycle, an example line, and what every word does.
- Automatic N numbers on new lines (step 10, or the midpoint when there's no room), plus a Renumber command that leaves subprogram labels alone.
- An Insert menu. **Insert › Hole pattern…** is a tool that works out drilling positions and inserts them after the canned-cycle line. Grid mode takes a distance, angle and hole count along each axis; bolt circle mode takes a diameter or radius, hole count, start angle and direction, for a complete circle or an arc spaced by angle or by distance. It follows the active plane (G17 XY, G18 XZ, G19 YZ) and G90/G91, and writes every number with a decimal point.
- Canned cycles from the Insert menu, grouped by category (drilling, tapping, boring on a mill; roughing, finishing, turning and facing, grooving, threading, drilling and live tooling on a lathe). Each opens a window with a rough sketch of the cycle, a box for each word it takes (required ones marked, with what each does), and the finished line with its gloss before it goes in. Categories the selected machine can't run are hidden, such as live tooling on a lathe without it, and Y and C words are hidden on lathes without a Y axis or live tooling. Those options are set in the machine profile.
- Converting a program to another control (Program › Convert to another control…): each code is matched by meaning, not number, and the result is checked by the target's rules and by comparing the two toolpaths move by move. Lines that need a look or a decision are marked with the reason. See [`docs/converting.md`](docs/converting.md).
- A subprogram library: reusable subprograms with named variables (a slotting routine where only the positions and depths change between parts). Find one under **Insert › Subprogram library…**, fill in the values, and insert it as one `G65 P9101 …` call or as plain lines worked out from the values for controls without the macro option. Calls read by name in the gloss (`sub.slotmill`, `dep:-0.15`) and expand to show the lines they run. Library files live in built-in, shop or personal folders, like machine definitions. See [`docs/subprogram-library.md`](docs/subprogram-library.md).
- Warnings when a word clashes with the active mode, such as an inches-per-rev feed while G94 is on.
- A Problems panel that checks the program as you type: canned cycles missing words (G83 with no Q), feed moves with no F or with the spindle off, a word repeated in a line, two codes from one group, numbers with no decimal point, arcs that don't close, missing length offsets, and codes that mean something else on the selected control (G54 on an Okuma). See [`docs/checks.md`](docs/checks.md).
- Opens and saves through the standard system file dialog, and keeps each file's original line endings.

**Reading**
- Show both lines, gloss only, or code only (View menu).
- Program › Sort words puts the words on each line in a consistent order (motion and cycle codes first, then X, Y, Z, F, S and the spindle M-codes, with rare words at the end).
- Subprogram and canned-cycle calls (for example Haas `M97 P1000`) expand inline below the call, marked with purple N numbers. Editing an expanded row edits the subprogram itself.
- An active-modes panel for the selected line: motion, units, absolute or incremental, plane, feed mode and rate, spindle, coolant, tool and offsets. A dot marks modes set on that line.
- A bar beside each line's number by motion: amber for rapid, blue for feed, teal for arcs, magenta for drilling cycles. Lines with a problem are tinted yellow (warning), orange (error) or red (machine alarm), with the word at fault underlined.

**Previews**
- XY toolpath view that follows subprogram calls, colored by move type or by tool. Moves after the selected line can be greyed out, hidden, or shown normally.
- Simulation playback that draws the tool moves one line at a time, with step, play and speed controls. It pauses at M00 (and M01 with optional stop on), can skip block delete (/) lines, and has an expanded view with a large toolpath.
- A timeline in execution order that keeps the selected line centered. It shows Z by line (X radius on a lathe), the feed rate or the spindle speed. On a plasma table it shows the feed rate or Z, with a band where the torch is on and marks where the process or material changes. On a mill each kind of step gets a symbol (drilling, pecking, tapping, boring, ramps, helixes, dwells, stops, tool changes), and a red dot shows where the tool is. Light scale lines in powers of ten show the depth, with the coarser ones labeled.
- Chamfers and corner radii written with ,C and ,R are drawn in the toolpath, with the lines out to the sharp corner shown grey and dashed.

**Machines**
- Mill, lathe and plasma modes, since some codes mean different things on each (G50, G76, G98, G99, and M07/M08 as cut on and off on a Hypertherm plasma control). Plasma checks the torch instead of the spindle: Hypertherm Phoenix/EDGE Connect (first draft), Centroid Acorn and Tormach plasma.
- Per-machine definition files that override dictionary entries (for example Haas M88/M89 and M97).
- An end-of-block setting per machine profile for older controls that need `;` at the end of every line.
- Haas and Fanuc mills and lathes, plus a first draft of Okuma OSP (G15 H work offsets, G56 H length offsets, CALL and RTS). [`docs/checks.md`](docs/checks.md) lists what each control covers so far.

See [`docs/features.md`](docs/features.md) for the full list and what is still under discussion.

## Platform plan

Windows first, with a native Linux build later.

- **Core in portable C**: parser, translator, mode tracking, checks and dictionary loading. Only the C standard library, no `windows.h`, UTF-8 throughout.
- **One small platform file per OS**: `platform_win32.c` and `platform_posix.c`, each with the same handful of functions (read and write files, list a folder, find the settings folder, portable mode, open a link).
- **UI in a native webview** through the [webview](https://github.com/webview/webview) library: WebView2 on Windows 10/11, WebKitGTK on Linux. The same HTML/JS UI runs on both.
- **System file dialogs** through [nativefiledialog-extended](https://github.com/btzy/nativefiledialog-extended).
- **Build with MinGW-w64 or clang** so the same toolchain works on both systems.

More detail is in [`docs/architecture.md`](docs/architecture.md). Releases, installers and portable copies are covered in [`docs/releasing.md`](docs/releasing.md).

![Open uses the standard Windows dialog](docs/images/native-open-dialog.png)

## Repository layout

```
data/gcode-words.json   Gloss dictionary (full and short words, mill/lathe splits, Haas and Okuma overrides)
data/gcode-rules.json   Problems-panel rules and per-control tables (modal groups, canned cycle words, dialect traps)
data/library/           Built-in subprogram library (reusable subprograms with variables)
src/core/               The core in portable C: reading and writing G-code files, JSON interface
src/platform/           Platform files: platform_win32.c, platform_posix.c
src/app/                The program: webview window, bindings to the core, Windows icon and version info
tests/                  Core tests, UI tests and golden files, edge-case programs, smoke test
CMakeLists.txt          Build (see docs/building.md)
docs/architecture.md    Core, platform layer, UI and build plan
docs/building.md        How to build and test on Windows and Linux
docs/checks.md          Every check, the rules file format, and Haas/Okuma coverage
docs/features.md        Feature list and open questions
docs/releasing.md       Version number, release files, update check, and what a first release still needs
docs/subprogram-library.md  Subprogram library: file format, variables, call or write in, folders
docs/images/            Mockup screenshots
src/ui/                 The program's screen; also runs in a browser (index.html loads css/ and js/)
src/ui/data.js          Dictionary, rules, built-in library and version, written from data/ by scripts/make-ui-data.mjs
src/ui/samples.js       The sample programs, written from examples/ (browser only)
assets/fonts/           The code and gloss fonts (IBM Plex, SIL Open Font License), embedded by scripts/make-fonts.mjs
VERSION                 Current version number
examples/               Sample programs (Haas, Fanuc and Okuma; BRACKET_0MC.nc ends lines with ;). Not built into the program; a separate download
```

## Try it in a browser

Try it at **[grahamrkf.github.io/glosscode](https://grahamrkf.github.io/glosscode/)**, or open [`src/ui/index.html`](src/ui/index.html) from a copy of the repository. Open a sample program from the home page, click a line to edit its code, try the View menu (show one or both lines, full or short words, text size), and use **▸ show N1000** or **Beside** to see the subprogram. Press F5 to run the simulation. Press F1 on a canned cycle to see how it works. In a browser the sample programs are built in, Open shows a pretend file list and nothing is saved to your computer; the program uses real files instead.

## License

[MIT](LICENSE)
