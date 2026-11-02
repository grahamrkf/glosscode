# Changelog

What changed in each GlossCode release. The newest release is at the top. Versions follow `MAJOR.MINOR.PATCH` (see [docs/releasing.md](docs/releasing.md)); while the version starts with `0.`, file formats may still change between releases.

## [Unreleased]

### Macro variables
- Lines and words that use macro variables are read and shown instead of being dropped. A line like `#110= -0.035` (setting a variable) is one word, `X - #101` reads as `X-#101`, and `Z#113`, `F#111` and `F[#111*3]` keep their variable or expression. `IF`, `WHILE` and `END1` lines are kept whole as written.
- Selecting a word that uses a variable shows what it works out to each time the simulation runs that line, for example the four values `X-#103` takes in a subprogram called for four rows.
- These lines no longer get false "has no number after it" problems, and a move to a variable position doesn't give arc or rapid checks a wrong position.

### Okuma lathes (OSP)
- Okuma variables are read: `V1=3`, `VC2=VC2+1` and named variables like `DIA1=1.3` are one word each, and a word like `X=DIA1` keeps its expression.
- Sequence names like `NA1` are read as one word (`G85 NA1` reads LAPRUF SEQA1, and the `NA1 G81` line is labeled). `GOTO N90`, `G85 NA1` and `IF [..] N440` that point to a name or number missing from the file are flagged, and these N words no longer give a false "address used twice" problem.
- `G50 X Z` (or `G91 G50 Z…`) reads SETCOORD, setting the coordinates, instead of the spindle clamp. `G03 X Z L0.062` reads L as the arc radius, and the arc checks ask for L on these lathes. `G04 F0.2` reads as a dwell in seconds.

### Simulation
- Macro variables are worked out as the program runs, including through local subprograms (`M97 P1000`), so subprograms that cut with variable positions (like concentric slots with `G03 X - #103 Y#104 I#101 J - #102`) draw correctly.
- Drilling cycles: each hole now plunges from R to the bottom and goes back up to R (`G99`) or the starting height (`G98`). The Z-by-line timeline draws this as a vertical line down and back up for each hole. A cycle line with `L0` stores the cycle without drilling, and the holes come from the lines that follow (often a list of positions in a local subprogram). The cycle stays on until `G80` or `G00`–`G03`, even across subprogram calls.
- The simulation follows jumps and loops: `GOTO N90` and `IF [V2 GE V1] N440` (Okuma), `GOTO 100` and `IF [..] GOTO 100` (Fanuc), and `WHILE [..] DO1` … `END1`.
- Okuma lathes: `G85` LAP roughing cuts the contour named on the line (`NA1 G81` … `G80` along Z, `G82` along X) in steps of D, leaving U and W, then follows the contour at that allowance; `G87` finishing follows the contour. The contour lines are skipped in normal order, as on the control. `G74` face grooving plunges at the start X and every I until the X on the line. Arcs with an L radius are drawn as arcs.
- `G50 X Z` and `G91 G50 Z…` on a lathe move the zero, so a program that makes several parts from one bar (a loop that shifts Z each time) draws each part in its place.
- New **G00** button beside the M01 and / buttons (also Simulate › Show rapid moves) hides rapid moves, so the toolpath shows feed moves only, like the control's own graphics screen.

## [0.1.4] - 2026-11-02

### Fixed
- On Windows the program opened on the mockup's intro page, with the editor in a small framed window inside it. It now opens straight into the editor, filling the window. The mockup's intro, drawn title bar and notes are gone from the page altogether, and the page moved from `docs/mockup/` to `src/ui/`. Links in the program (such as **Get the examples**) open in your web browser again instead of replacing the editor.

## [0.1.3] - 2026-11-02

### Home page
- Clicking a recent program that was moved, renamed or deleted now asks what to do: **Locate…** opens the Open dialog in the nearest folder that's still there, and the file you pick takes the old one's place in the list with the same machine; **Remove from list** takes it off.
- A program opened from the command line or with **Open with** is remembered by its full path, so it opens from the recent list later no matter which folder GlossCode starts in.

### Machines
- New plasma machine type. Hypertherm Phoenix/EDGE Connect (first draft), Centroid Acorn and Tormach plasma tables read M07/M08 (Hypertherm) or M61/M62 (Acorn) as cut on and off, D as the kerf offset, and Hypertherm's G59 as setting variables.
- Plasma programs get torch checks instead of spindle checks: a feed move with the torch off, and a program that ends with the torch on. Canned cycle, tool length and spindle speed checks don't run on plasma.
- PLASMA_BRACKET.nc joins the example programs.

### Simulation
- The timeline can show the feed rate or the spindle speed instead of Z. Pick it in the timeline's header; the choice is remembered for each machine type.
- On a plasma table the timeline shows the feed rate by default, with a band where the torch is on and marks on lines that change the process or material.

### Linux
- The menu entry is now under Development (Programming in the Linux Mint and Cinnamon menus) and Engineering, instead of Utility (Accessories).
- The menu entry shows its icon right after installing, instead of a blank icon until you log out and back in (seen on Linux Mint).
- GlossCode is offered in Open With for `.gcode` files (the standard G-code file type), as well as plain text files.

## [0.1.2] - 2026-11-01

### Editor
- Select whole lines by dragging the mouse across them, with Shift+↑↓ or Shift+click, or all of them with Ctrl+A.
- Right-click selected lines (or any line) to cut, copy, paste, duplicate or delete them. Ctrl+X, Ctrl+C, Ctrl+V and Delete do the same.
- Copy puts only the G-code on the clipboard, the same text Save writes, so it pastes cleanly into other programs.
- Ctrl+D duplicates the selected lines (or the current line) right below them. Pasting several lines over a selection replaces it.

### Simulation
- Playback goes on to the end of the program (normally M30) instead of stopping at the last move.
- Canned cycles keep Z and R for the following holes, and the tool returns to R (G99) or the starting Z (G98), so Z by line and the final retract are drawn right.

## [0.1.1] - 2026-11-01

### Editor
- Pasting a few lines or a whole program puts each line in its own row and each word in its own cell.

### Simulation
- Playback pauses at M00. The new M01 button (optional stop) makes it pause at M01 too, and the / button (block delete) skips lines that start with /.
- A line between the buttons and the toolpath shows X and Y (X and Z on a lathe), the line number and its N number, in place of "Up to line".
- Expanded view (⤢ or Ctrl+Shift+E): the toolpath fills most of the window, with a few program lines centered on the active line below it, and Z by line and active modes on the right.

### Fixes
- A block delete "/" at the start of a line is kept as the line's first word (English `BLKDEL`) instead of being dropped when the file was read, so saving no longer loses it.

## [0.1.0] - 2026-11-01

The first release: a preview for trying GlossCode on real programs. The C core reads, translates and checks the program, and the program opens and saves files; the screen still draws its English words with its own copy of the core's logic, which the tests keep identical.

### Editor
- An English line above every G-code line, each word in a fixed-width column under its English word, in long (`SPINFWD`) or short (`SFWD`) style, or English only.
- Numbers always show their decimal point, and a distance written without one is shown the way the control reads it (`X1` reads `X0.0001`). Feeds and speeds show their unit from the active modes (`S600 rpm` under G97, `S600 sfm` under G96).
- Type G-code or English, with autocomplete, hints for the words a code still needs, and keyboard editing by word.
- Auto N numbering, renumbering, sorting words into a consistent order, undo and redo, and Find across G-code and English.
- Active-modes panel, rapid and feed colors, a step-through simulation and a column view by word type.
- Problems panel with checks for common mistakes on mills and lathes.
- Insert menu: hole patterns (grids and bolt circles), canned cycles by category, and a subprogram library with G65 variables, inserted as a call or written in.
- Subprogram and canned-cycle calls can be expanded inline.

### Machines
- Haas, Fanuc and Okuma mills and lathes, with layered machine definitions and per-machine profiles.

### Program
- Windows (10 and 11, 64-bit) and Linux (64-bit, GTK 3 and WebKitGTK 4.1).
- Starts on a home page with recent programs, New, Open, and default machines by file extension. One tab per open program.
- Uses the system Open and Save dialogs. Saving keeps every unchanged line exactly as it was read, keeps the file's line endings, and writes Latin-1 files back as Latin-1.
- Help › About shows the version and checks GitHub for a newer release.
- Settings are kept in the user's settings folder (`%APPDATA%\GlossCode` on Windows, `~/.config/glosscode` on Linux), or in `GlossCode-data` beside a portable copy.

### Downloads
- Windows installer (per-user, no administrator rights needed) and portable `.zip`.
- Linux `.deb`, `.rpm` and portable `.tar.gz`.
- Sample programs and example library files as a separate `GlossCode-<version>-examples.zip`.

### Known limitations
- The Windows files aren't code-signed, so SmartScreen warns the first time; choose **More info › Run anyway**.
- Check for updates opens the download in the browser; it doesn't yet download and check the file itself.
- Files changed by another program while open aren't reloaded.
