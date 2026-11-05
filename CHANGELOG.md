# Changelog

What changed in each GlossCode release. The newest release is at the top. Versions follow `MAJOR.MINOR.PATCH` (see [docs/releasing.md](docs/releasing.md)); while the version starts with `0.`, file formats may still change between releases.

## [Unreleased]

### Gloss words
- Every full word is renamed to one pattern: a group, then the action, with a third part for less common codes. `run.*` is for moves and other things the machine does on that line (G00 `run.rapid`, G01 `run.feed`, G02 `run.cw`, G04 `run.pause`, G28 `run.home`), `set.*` for modes that stay in effect (G17 `set.xy`, G20 `set.inch`, G90 `set.abs`, G94 `set.fpm`, G96 `set.sfm`, lathe G50 S `set.smax`), and a fixed set of other groups: `cycle`, `call`, `flow`, `prog`, `spindle`, `cool`, `tool`, `tlen`, `ccomp`, `work`, `axis`, `machine` (builder extras such as chucks, tailstock, barriers and outputs), `probe`, `thread`, `torch`, `param`, `pattern` and `scale` (G41 `ccomp.left`, G43 `tlen.on`, M08 `cool.on`, G65 `call.macro`, G83 `cycle.peck`, Haas lathe M21 `machine.tailstock.in`, Okuma M-tool cycles `cycle.live.drill`). Full words are spelled out (`axis.c.join`, not `cjoin`), and options use the same words everywhere (on, off, fwd, rev, left, right, clamp, unclamp, in, out, select). Full words can be up to 28 characters. Codes that mean the same thing on different controls now share one full word (the Okuma G85 LAP roughing is `cycle.lap.rough`, Fagor's (SUB n) and Haas's M97 calls are `call.sub` and `call.local`). M02 and M30 are both `prog.end` (END): "rewind" dates from tape readers, and starting a program always goes back to the top now. Typing END gives M30.
- Short words are redone to one rule: 3 to 8 characters (2 only for a standard abbreviation or a two-letter word: G21 `MM`, G17 `XY`, IF, DO), as short as is still clear, in up to three parts of 1 to 4 characters each: the group's core (S spindle, C coolant, T tool, TL tool length, TR cutter comp, WRK work offset, AX axis, M machine, PRB probe, TH thread, PL torch, Q parameter, PAT pattern; left out for moves, modes, cycles, calls and program flow), an optional alternate (S2 second spindle, SL live tool, SG gear) and the option. Short words come straight from the full word through one table. For example M03 `SFWD`, M08 `CON`, G43 `TLON`, G41 `TRL`, G54 `WRK1`, G20 `INCH`, G91 `INCR`, G00 `RPD`, G83 `PECK`, M21 `MTSIN`.
- Control-specific codes (ones whose full word no base code uses, such as Okuma's `tlen.x` or Haas's `machine.chuck.clamp`) have a dotted underline in the gloss row, and hovering one says so.
- The long word style (SPINFWD) is gone. Full words are the default; short words (SFWD) stay. Address letters keep their prefix (SEQ10, TOOL1). Library subprograms have a full word (`sub.slotmill`) in place of a long one; library and machine files that still have a long word read it as the full word.

### Editor
- The two lines are now called **code** and **gloss** instead of G-code and English, since the code line can be any control's language (Klartext too) and the gloss could later be in other languages. View › Edit in reads Gloss / Code, View › Show reads Gloss and code / Gloss only / Code only, the word style group is Gloss words, and the status bar says Editing gloss or Editing code.

## [0.1.7] - 2026-11-05

### Machines
- Machines are picked as machine type → control → machine. Every type and control has a Generic machine, so "Mill › Generic" or "Lathe › Okuma OSP-U10L / OSP-U100L › Generic" works without a profile. Only controls made for the chosen type are listed.
- Your machine profiles are kept in settings.json. New starts from a machine type and control, Copy from another profile, and Add from library from a known model (Haas VF-2 and ST-10, Okuma M560-V and LB3000 EX II), with the numbers we aren't sure of left empty to fill in. Profiles can be deleted: programs that used one open with the Generic machine for its type and control.
- New controls: Okuma OSP-U10L / OSP-U100L and Okuma OSP700L / OSP7000L (lathe), and a Generic control with the common ISO codes. New machine type: router (Centroid, LinuxCNC, GRBL and Generic), which reads like a mill. Haas NGC stays one control: where the 2020 and 2025 manuals differ, the machine profile settles it.
- Lathe G code systems B and C are their own controls: Fanuc lathe system B and C, Mazak EIA/ISO lathe system B (the Mazak default) and C, and Mitsubishi M800 lathe G code list 3, 5 or 7. On these G90/G91 are absolute and incremental, G92 clamps the spindle and with X or Z sets the coordinates, G94/G95 pick the feed, and the turning cycles are G77/G78/G79 (system B) or G20/G21/G24 (system C, where inch and metric are G70/G71 and the repetitive cycles G72 to G78). The Fanuc and Mazak controls stay system A on a lathe.
- New control: Fagor 8055 / 8055i mill. Its statements are in parentheses: (SUB 12) … (RET) subroutines called with (CALL 12) or (PCALL 12, …), (P1 = 2) assignments, (IF (P1 EQ 2) GOTO N40), (MSG "…") and the rest each read as one word, and `;` starts a comment. An N at the end of a line is how many times to repeat it. G04 K is in hundredths of a second, G43/G44 turn the tool length on and off, G58/G59 are additive offsets, G60 to G65 are multiple machining patterns and G96/G97 pick how the feed is measured. The patterns read their own words (G60 X is its length, K the number of points, P to V the points to skip) and the simulation machines the active cycle at every point; G66 to G68 irregular pockets read their labels and words, and the simulation traces the pocket's profile. An N at the end of a line runs it that many times in the simulation.
- New control: Fagor 8060 / 8065 lathe, with the 8060's own block format. Its cycles match the 8055 lathe's (G66, G68/G69, G81 to G89), with the live tool cycles at G160 to G163 (N is the live tool spindle). G192 S limits the spindle speed, G92 presets the coordinates, G33 K is the thread pitch and G04 K is in seconds. G50 is flagged, since it's a corner mode on this control. The cycle words follow the 8065 T canned cycles manual (Ref. 1209): G66, G68 and G69 take the profile as labels S and E, a local subroutine P or a global subroutine Q, and leave G00, G40 and G90 active; the live tool speed S on G160 to G163 is optional, and these cycles flag a missing G94 feed when G95 is active. The dialect still needs checking against a machine.
- New control: Fagor 8055 / 8055i lathe, with the same statements in parentheses as the mill. Its cycles run once where they're written: G81/G82 straight turning and facing, G84/G85 with an arc, G66 pattern repeat, G68/G69 roughing along a profile, G83 drilling, G86/G87 threading, G88/G89 grooving, and the G60 to G63 live tool cycles. On those lines S can be a profile label or the live tool speed and M a finish stock, and they read that way. G96 is constant surface speed, G92 S limits the spindle speed, G33 L is the thread pitch and G04 K is in hundredths of a second. The simulation draws the passes of each cycle and the profile of G66, G68 and G69; G84/G85 are drawn with straight passes. Its cycles follow the 8055 M programming manual (Ref. 1501): G69 and G81 to G89, the G87/G88 pockets and G210 to G212, with Z as the reference plane and I as the depth.
- New control: Fagor 8060 / 8065 mill. It reads Fagor's own block format: `;` and `( )` comments, `$IF`/`$GOTO` and `#CALL`/`#MSG` statements, `%L` local subroutines ending in M17, M29 or #RET and called with LL or #CALL, `N10:` and `[NAME]` labels, NR repeats and P parameters (XP1). Its cycles take Z as the reference plane and I as the depth, G04 K is in seconds, G70/G71 set the units and the tool length comes from D. G43, M98 and other Fanuc codes it doesn't have are flagged. The cycle words follow the 8060/8065 canned cycles manual (Ref. 1807) and still need checking against a machine.
- New control: Heidenhain TNC 640, Klartext (conversational) programs, as a first draft. A block number, then a function and its words: `L X+10 Y-5 RL F200 M3`, `CC`, `C`, `CR`, `CT`, `CP`, `LP`, `RND`, `CHF`, `APPR`/`DEP`, `TOOL CALL 5 Z S4000`, `BLK FORM`, `CYCL DEF` with its Q parameters one to a line ending in `~`, `CYCL CALL`, `PATTERN DEF`, `LBL`/`CALL LBL`, `FN` functions and Q parameter formulas. Each reads in English like G code does: `CYCL DEF 200 DRILLING` reads its Q lines by name (Q200 is the set-up clearance). The checks cover block numbers, the program name, a cycle call with no cycle defined, calls and jumps to missing labels, and the first feed move with no F or with the spindle stopped. The simulation draws lines, arcs, polar moves and tangent arcs, drilling cycles at each call, pattern points and pockets, and follows subprograms, repeats and FN jumps. RND and CHF corners and FK free contours aren't drawn. Program › Renumber numbers the blocks from 0, and File › Open lists `.H` files.
- New controls: Fanuc Series 0 / 00 / 0-Mate (mill: no G93, G150 to G152 normal direction control, G05), and a Mitsubishi M800 lathe with G code list 2, 4 or 6 (G190/G191 absolute and incremental).
- New control: Mitsubishi M700/M70 in the M2/M0 format (mill). G22 L calls a subprogram (L the program, P the repeat count) and G23 returns, G44 cancels the tool length (G49 is flagged), G62 is mirror image, and G22.1/G23.1 are the stroke check.
- New control: Okuma OSP-E100L (lathe), the generation between the OSP-U10L and the OSP-P200L, with the same Okuma lathe tables. On every Okuma lathe G30 now reads as the skip cycle rather than a return home, and on the OSP-E100L and OSP700L M98/M99 read as tailstock thrust low and high. On Okuma controls M99 no longer ends a subprogram (they end with RTS), and Okuma lathes read a number with no decimal point as written, so X1 is X1.000.
- The Home tab is just the ⌂ icon.

### Simulation
- The toolpath fits the cutting moves, so a home return far from the part (`G00 X20. Z20.`) no longer shrinks the part to a dot. Rapids that go farther run off the edge.
- Zoom and pan the toolpath: scroll to zoom about the pointer, drag to pan, Shift+drag (or ⬚ then drag) to zoom to a box, and double-click or Fit to fit again. +/− zoom from the middle.
- Macro expressions follow the Fanuc Custom Macro B rules more closely. `ATAN[a]/[b]` gives the angle from 0 to 360 degrees (it used to divide the one-argument ATAN by b). `ROUND[-1.5]` is -2. `ASIN`, `ACOS`, `LN`, `EXP`, `BIN`, `BCD`, `XOR` and `#[expression]` variables are read. `AND` and `OR` work bit by bit, as on the control.

### Okuma
- The graphic display statements `DEF WORK`, `PS LC,[..],[..]`, `END`, `CLEAR` and `DRAW` read as one word each, and nothing moves.
- A sign then a variable (`Z-V10`) reads as one word, so `G91 G50 Z-V10` is a zero shift in the reading and the simulation.
- `L` on a `G75` or `G76` line is the chamfer or rounding size.
- The Ctrl+Z end-of-file mark some older systems write is kept, shown as `^Z` and read as EOF.
- New check `unbalanced-brackets`: an expression whose `[` and `]` don't pair up.

## [0.1.6] - 2026-11-04

### Nothing is hidden
- Every character of a program shows in the G-code row, as in a text editor, with the spacing of the columns added. `%` lines and `;` at the end of a block are shown and saved as written (a `;` only some lines have stays only on those lines). Text GlossCode can't read, like a stray symbol or number, is kept as written and flagged.
- A machine that needs `;` on every block still gets it added on save, but never a second one.

### Editor
- The row you're editing is dark and heavy, and the other row of each line is light and faint, so it's clear which one is active.
- New English style, View › Full words, writes codes as words like `spindle.fwd`, `units.inch`, `units.absolute` and `coolant.on`. Typing a full word in English mode works too. Address words (X, SEQ, TOOL, PECK…) read as in the long style.
- Each line shows a grey run order number on the left: the block count as the program runs, counting a subprogram's lines on every call. It matches the line count some controls show. View › Run order numbers turns it off.

### Simulation
- The simulation follows the line actually running, not the first time that line runs. A subprogram called again with new variables (a deeper `#110`, for example) shows its own depth in the timeline, and the timeline scrolls straight through calls instead of jumping back.
- Inside a call, the editor follows along in the call's shown lines (▸ show). While the call is hidden, a progress bar beside its button shows how far through it the tool is.
- New 16×, 32× and 64× speeds.
- Lathes: a program that uses the tailstock shows a tailstock symbol in the toolpath view, with ← (in), → (out) or ? (not set yet).

## [0.1.5] - 2026-11-02

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
