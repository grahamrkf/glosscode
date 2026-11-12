# Changelog

What changed in each GlossCode release. The newest release is at the top. Versions follow `MAJOR.MINOR.PATCH` (see [docs/releasing.md](docs/releasing.md)); while the version starts with `0.`, file formats may still change between releases.

## [0.5.0] - 2026-11-12

### Appearance
- Dark theme. View › Theme picks Light, Dark or Same as the system (the default, which follows the system's setting as it changes). Every colour has a dark version, and the window's title bar turns dark with it on Windows 10 and 11 (and on Linux where the desktop theme has a dark version).
- View › Text size… is now View › Appearance…: the theme, the code and gloss fonts with their sizes, the zoom, and colours. The font lists start with the built-in IBM Plex, then the easy-to-read fonts that are installed (Cascadia Mono, Consolas, JetBrains Mono, Atkinson Hyperlegible…), then every installed font. A chosen font that's missing a letter falls back to IBM Plex for it.
- Colours for the code, gloss, comments, N numbers and the rapid, feed, arc and cycle moves (in the editor and the toolpath) can be changed, separately for the light and dark themes, with a button to go back to the theme's colour. All of it is remembered in settings.json.

### Gloss words
- Full words follow fixed rules (docs/gloss-words.md): one idea per part (G89 `cycle.bore.dwell`, was `cycle.boredwell`), on and off last as their own part (M10 `axis.4.brake.on`), fixed opposite pairs (tailstock and quill `advance`/`retract`), direction and side last (`cycle.tap.left`, `cycle.pocket.circle.ccw`), and `.once` for codes that act on one block (Fagor G61 `set.corner.round.once`). Okuma G178 synchronized tapping reads `cycle.tap.rigid`, G30 `run.home.2nd`, Heidenhain M128 `tool.tcp.on`.
- Work offsets use the code's own name: G54 to G59 read `work.g54` to `work.g59` (WRK54 to WRK59), and an extra offset reads `work.p7` (WRKP7) whether it's written G154 P7 or as its alias G116. G154's P used to read as a dwell.
- A new `live` group holds live tooling and the C axis on lathes: `live.fwd`, `live.rev`, `live.off`, `live.brake.on`, the Okuma M-tool cycles (`live.drill`, `live.tap`, `live.thread.face`…) and the C axis (`live.c.on`, `live.c.join`, `live.xc.on`). Short words for the live tool lose the S (LFWD, LREV).

### Docs
- docs/control-status.md lists, for each control, what GlossCode doesn't handle yet and what it isn't sure of, with what's waiting for a manual. The README links to it.

### Wording
- Status-line messages are one short sentence: "Undone (3 more).", "Pasted 4 lines below line 12. Ctrl+Z undoes.", "Saved PART.nc (2,310 bytes, CRLF)."
- Menu items use shop terms: View › Block count (was Run order numbers), View › Collapse moves (was Fold moves), Program › Sort addresses, Program › Auto sequence numbers, Help › Gloss words….

## [0.4.0] - 2026-11-11

### Simulation
- Run time. Each move now takes as long as it would on the machine, worked out from its length and the programmed feed: G94 per minute, G95 per rev times the spindle speed (and threading's lead), G96 surface speed turned into rpm at each move's diameter and capped by the G50 clamp or the machine's max spindle, and a feed above the machine's max feed capped to it. Rapids take the longest axis's distance at the rapid rate; G04 dwells, dwells at the bottom of G82/G89 holes, the extra rapids of G83/G73 pecks and the feed back out of taps and bores count too. Acceleration, tool changes and spindle start aren't counted yet, so a real run takes a bit longer.
- The position line shows the time so far and the whole program's time (Time 3:10 / 12:34), with cutting, rapid, dwell and per-tool times in its tip. With no line simulated it shows the time up to the selected line.
- Playback follows the program's clock: 1× is real time, and the speeds go from ¼× to 1000×, plus Max (as fast as the screen draws). A long move is drawn as far as the tool has got along it.
- Machine profiles have a Rapid rate (in/min) for the run time. Until it's filled in, 1000 in/min is assumed, and the time's tip says so.
- A call nested deeper than the control allows stops the simulation with an alarm, such as 307 on the 1995 Haas control (9 levels of M97/M98, 4 of G65). The limits are per control (callDepth in gcode-rules.json, from the manuals). Where the manual gives no limit (Okuma lathes, Haas NGC subprograms), calls are still followed 8 deep and a simulation note says so.
- G70, G71 and G72 bolt hole patterns end back at the pattern's center, so a second pattern with no X Y is drawn about the same center, not the last hole (#72).
- G47 engraving: the rectangle is now J tall, since J is the path the tool's centre follows, with a lighter edge half the tool's diameter wide around it showing what's cut. The diameter comes from the tool line's comment (1/16, .0625, 1.5MM). The old 1.25 × J height was the shop note's J plus the tool.
- Move folding no longer treats an Okuma M99 (tailstock thrust) as a subprogram end.

## [0.3.0] - 2026-11-11

### Editor
- Code with gloss above is now the only layout. The two older layouts (words in program order, and columns by word type with modal values in empty cells) are gone, and so is typing gloss to write code (View › Edit in) with its autocomplete. View › Layout and Edit in are removed from the menu, and Edit › Break line after the selected word and Delete selected word with them: Enter breaks the line being edited, and Delete and Backspace edit the line.
- Pasting one line of words while a line is being edited puts them in at the caret; with no line being edited, they go at the end of the current line, before its comment.
- The code and gloss now use fonts that come with GlossCode, so they read the same on every computer: IBM Plex Mono for the code and IBM Plex Sans for the gloss. Menus and dialogs keep the system font. The gloss is no longer italic, is a little larger (11 px) and a darker grey, and comments are the same colour as the code (#73).
- View › Text size… sets the code and gloss text sizes and a zoom for the whole window. Ctrl+= and Ctrl+- (or Ctrl+wheel) zoom in and out, and Ctrl+0 goes back to 100%. The sizes and zoom are remembered in settings.json.
- The menus are tidier (#74). View keeps what the editor shows; the toolpath settings (rapid moves, moves after the selected line, cutter comp side, colours) are in Simulate › Toolpath. Menus can open submenus (View › Gloss words, View › Fold moves). A choice shows a round dot and an on/off setting a tick box, each with an empty outline when it isn't picked.
- The toolpath's G00 and hide-later-moves icons are one **Show ▾** button with the same settings written out. It's highlighted while something is hidden.
- The timeline's header is Timeline and its picker (Z by line, X radius by line…), with the value on its own line, so it's no longer cut off.
- Subprograms (#74): **Go to** on a call line (or F12) moves to the subprogram, and a bar above the program (or Alt+←) goes back to the call. **Beside** (or Alt+F12) opens the subprogram in a pane to the right of the program, where its lines are edited like any other. A call inside the pane opens the next subprogram one level down, with a trail at the top (Program › N1000 › N2000) to go back up. G65 library subprograms open there read only. The subprogram lines shown under a call (▸ show) are now read only and left out of copy: clicking one opens it in the pane.

### Subprogram library
- Your own library subprograms are now saved in the program. Save writes the subprogram's file to the `library` folder inside the settings folder (`%APPDATA%\GlossCode\library`, or `~/.config/glosscode/library` on Linux), Delete removes it, and the files there are read when GlossCode starts. Before, the program kept them only until it closed. A file with a built-in subprogram's id replaces the built-in one, and deleting it brings the built-in one back. The window shows the real file each one is in. The shop folder and Export aren't in the program yet.

### Code
- The C core now only reads and writes files. Its copy of the gloss and checks (kept identical to the UI's JavaScript, but never used by the program) is gone, and so is the `--data` option, which only affected that copy. The golden files in `tests/golden/` stay, as a record of what the UI shows.
- The UI page is split into files: `src/ui/index.html` holds the page itself and loads its styles from `src/ui/css/` and its scripts from `src/ui/js/` (one per part of the screen and one per dialog). The build joins them back into one page, so the program is unchanged. `--ui src/ui/index.html` loads the page from its folder.
- The dictionary, rules, built-in library and version are no longer copied into the page. `node scripts/make-ui-data.mjs` writes them to `src/ui/data.js`, and the sample programs from `examples/` to `src/ui/samples.js`, which the program's build leaves out. It replaces `scripts/sync-mockup-data.mjs`.
- The golden files also record the simulation (`tests/golden/sim/`): every step and toolpath move for each test program on each machine.
- The simulation's 660-line `interpret()` is now a `SimRun` class (`js/run-program.js`): setup, the line-by-line run, one line's step, and one method per cycle or pattern. `checkProgram()`'s line checks are one function per group (grammar, modes, tool change, spindle, tool length, cutter comp, cycles, the move).
- Code only one control family uses has its own file: `js/control-klartext.js`, `js/control-fagor.js`, `js/control-okuma.js`.
- Each tab keeps its program in its own object, so switching tabs no longer copies the editor's state in and out.
- Packed lines are split: a line over 160 characters holds one statement, and short names that lived for 50 lines or more have longer ones (`dialect`, `labelMap`, `toX`, `svg`…). The dialogs share one `$`, `showDialog`, `hideDialog` and `dialogKeys` (`js/state.js`).
- Which machines each test program runs on is in `tests/machines.json` instead of in `scripts/make-goldens.mjs`.
- The fonts are embedded in `src/ui/css/fonts.css`, which `node scripts/make-fonts.mjs` writes from `assets/fonts/` (CI checks it's up to date).

## [0.2.0] - 2026-11-07

### Editor
- New default layout, **Code with gloss above** (View › Layout). Each line is plain text: its N number in a column of its own, the code beside it, and the gloss above in small grey italics that can't be selected or edited. The gloss leaves out the N number and comments, and a comment-only line has no gloss line. Click a line to put the caret there and type as in any text editor: Enter breaks the line at the caret (the new line gets the next N number), Backspace at the start joins it to the line above, Delete at the end joins the line below, ↑↓ move the caret between lines, Esc undoes the changes to the line, and dragging along a line selects its text. The gloss follows as you type. The two older layouts (words in program order, columns by word type) are still in View › Layout, and the layout is remembered in settings.json.
- In the new layout all code is black. A line with a problem is tinted: yellow for a warning, orange for an error, red for a machine alarm, and the word the problem is about is underlined in that colour. The marker in the gutter stays, and the move-type bar beside it.
- A control whose rules are a first draft (not yet checked against its programming manual) shows one banner above the program, which can be dismissed and stays dismissed for that control. The note at the top of the Problems panel is gone, and Convert no longer marks every line of a draft control's program amber; it says once to check every line.
- Right-click Cut, Copy and Paste work in the program. The page couldn't reach the clipboard from a menu (only from Ctrl+C and Ctrl+V), so they now use the system clipboard through the program.
- Removed the Caps Lock and click options for switching between editing code and gloss.

### Gloss words
- Full words with a value are the name, a colon and the value: `speed:2100`, `feed:16.0`, `movx:-0.4215`, `incz:0.5`, `tool:1`, `toffset:1`, `rplane:0.1`, `rept:0`, `label:1500` (Haas M97 P), `dwell:0.5`. Units are no longer written after full words (the info panel still gives them). Renamed address words: X Y Z `movx movy movz`, H `toffset` (was LOFS), D `doffset`, R `radius` / `rplane`, P `dwell` / `prog` / `label`, L `rept`, Okuma G15 H `woffset`; canned-cycle words are lower case (`peck:0.05`). N numbers read as written (N10). Short words are unchanged. Typing gloss accepts both forms (`speed:2100` or `RPM2100`).
- Space pauses and resumes the simulation while it's open. It used to start a new word and close the simulation.
- A closed fold's line shows a progress bar while the simulation runs through the folded moves, like a hidden subprogram call's.

### Simulation
- New speeds ½× and ¼×. 1× runs one move per step, about 16 moves a second whatever their length, so a long feed move goes by in a moment; the slower speeds take two or four steps per move.
- The G00 (show rapid moves) and expanded view (⤢) buttons moved from the playback bar onto the toolpath, beside the zoom and Fit buttons. G00 only changes what is drawn: the simulation runs the same either way.
- A new button on the toolpath hides the moves still to come; pressing it again goes back to greyed or shown (View › Moves after the selected line).
- The lathe X timeline is scaled to the cutting moves. Rapids out to a tool change position far from the part used to squash the cutting into a flat line near CL; they now run off the top with ↑, like Z above the part on a mill.
- Scale lines on the Z (X on a lathe) timeline, in powers of ten. The finest ones still 3.5 px apart are drawn light and every tenth one darker with its value at the left (0", -1"; on a lathe Ø1" and CL), and the origin is marked with a circle and cross. A part 11" deep shows 0" and -10" with lines every inch.
- The ⏸ button pauses the simulation on Linux. Its text was rewritten on every step, which made WebKitGTK drop the click.
- Space, F5 and the other keys still work after clicking a blank part of a panel; they used to do nothing until you clicked the editor. Clicking a row while the simulation plays no longer leaves "Playing…" in the status bar.

### Linux
- Fixed a missing declaration of realpath in the Linux build: GCC 14 refused to compile it, and older compilers built a program that could crash opening a file named on the command line.

### Speed
- Editing a long program is faster. After an edit, the gloss and the checks are worked out again only from the edited line down to the first line whose machine state (modes, units, plane, feed, speed, tool, offsets, comp, position) is the same as before, and the rest is reused. A subprogram called more than once is matched per call, each with the state it was called with. Only the rows whose content changed are drawn again; adding or removing a line moves the rows below instead of drawing them again. On a 10,000-line test program, changing a word went from about 2.3 seconds to 0.5, and adding a line from about 2.3 to 1. The simulation is still run in full after each edit.
- The checks and the modes follow a long program in run order all the way through. They used to stop following calls after 5,000 lines and read the rest in file order, so a long subprogram's later lines could show the wrong modes.

## [0.1.9] - 2026-11-06

### Editor
- Long runs of moves fold away, the way a subprogram call's lines do. A fold starts at the first line that moves down (Z on a mill, X on a lathe) after one that didn't, so a CAM program's layers fold one per layer: ramp in, cut, ramp out and the move back, under a ▸ button with the number of lines and the depth. Rapids, M codes, tool changes, comments, block-delete lines, called labels and canned cycles always stay visible. A G01 at 10× the cutting feed or more counts as a rapid (some programs reposition with G01 F500); View › Fold long runs of moves sets 10×, 5×, 3× or G00 only. Runs under 10 lines don't fold.
- Opening a file folds the moves in each section (between comments, tool changes and labels) whose folded lines wouldn't fit in the window, except folds with a problem in them. After that each fold opens and closes on its own, including each place a subprogram is shown. View › Fold all / Unfold all, and the setting to fold on opening, are in the same group. Going to a line inside a fold (click, Find, Problems, the toolpath) opens it; the arrow keys step over a closed fold; the simulation marks the fold's first line. Folding only changes what's shown: line numbers, copying and saving use every line.

### Simulation
- Haas G47 text engraving shows in the toolpath and the Z-by-line timeline. Each G47 line is one grey rectangle, 1.25 × J tall (a shop note says J.120 text comes out .150 high and .120 wide per character), starting at X Y and turned by I, cut on the left, top and bottom. The letters aren't drawn. Letter widths vary and the control doesn't give them, so the length is an estimate (1.0 × J per character, which fits the symmetric layouts and serial-number gaps in proven programs) and the right end fades out, unless the next line is a P1 serial number on the same baseline: then the rectangle ends where the serial starts. While simulating, the tool is a red line across the text, sweeping along it. A G47 line no longer reads as a rapid to Z. The estimate is `engrave` in the Haas mill tables in gcode-rules.json. New sample program: examples/NAMEPLATE.nc.
- Haas bolt hole patterns are drilled: G70 (circle), G71 (arc) and G72 (line) put a hole at each point with the active canned cycle, about the current position or X Y on the line. They used to draw nothing. A canned-cycle line with L0 and X Y now moves there without drilling (usually a bolt circle's center). The gloss row reads their words (I `RAD`, J `STARTANG`, L `HOLES`, K `STEPANG`), and a pattern with no cycle active is flagged.
- G68 with no R (Haas: the angle is in Setting 72) leaves the toolpath unturned and says so in the position line and in Problems.
- G68 rotation and mirror imaging are followed: the toolpath after Haas G68 A B R (Fanuc G68 X Y R) is turned until G69, and after Haas G101 X0 / Y0 (Fanuc G51.1) it's mirrored until G100 (G50.1). Arcs, holes, engraving and the cutter comp side follow. A G101 X0 line no longer reads as a move to X0. New gloss words: G68 `set.rotate.on`, G69 `set.rotate.off`, G101 `set.mirror.on`, G100 `set.mirror.off`.
- Mill arcs written with R (G02 X2. Y0 R1.) are drawn. They used to be drawn as a dot.
- Every drilled hole has a small circle where it's drilled, including lathe drilling and tapping on center (Haas and Fanuc lathe G81-G89, now simulated as holes, Okuma G74 at X0 and G77/G78).
- Cutter comp: moves made with G41 or G42 (and the circles of a G12/G13 pocket) have a grey band on the side the tool's centre is on. It's a fixed width on screen, since the cutter's radius is in the offset table. D00 turns it off, as it turns off the offset. View › Cutter comp side (G41/G42) shows or hides it.
- Haas G12/G13 circular pockets are drawn: a full circle at each radius from I out to K in steps of Q, at Z, L times (G91: deeper each time). They used to read as a Z move. A G12 line no longer counts as a rapid below Z0.
- G73 and G83 peck retracts: the Z timeline shows how far G73 backs off after each peck (about 0.01 in / 0.25 mm) and where G83 rapids back down to (about 0.039 in / 1.0 mm above the last peck) with a grey band, since these amounts are machine settings, not in the program. The values are `peckRetract` in the Fanuc mill tables.
- Haas G107 cylindrical mapping: the toolpath between G107 A0 Y0 Q and G107 is drawn unrolled, inside a dashed rectangle from the origin across X and one turn (π × Q) up Y. With Q0 the diameter is in Setting 34, so the rectangle's top is left open and labelled "diameter unknown (Q0: Setting 34)". A G107 line no longer reads as a move.
- Okuma lathe cycles: G71 threading is drawn pass by pass, as the OSP manual describes: M73 (and no M code) cuts D each pass until within D of H - U, then what's left in halves (D/2, D/4, D/8, D/8), then the U finishing pass; M74 cuts D each pass to H - U, then U; M75 cuts pass n at √n × D. With an infeed angle B, each pass starts further along Z: down the left face (M32), the right face (M34) or alternating (M33). Haas one-line G76 threading is drawn pass by pass too (√n × D, or D each pass with P3/P4). G73 grooving cuts a groove along X at the start Z and every K to the end Z. G77 and G78 tapping go over to X, rapid K toward the hole, tap to Z and feed back out. These used to be one straight move.
- Variables panel, under Active modes: every variable the program sets or reads (#1-#999, and Okuma V and named variables), its value at the line shown, and a start value box. The simulation starts with those values. A variable read before the program sets it, with no start value, is flagged there and in Problems. Common variables (#100-#999, Okuma VC) can be saved to the machine profile with one button, and every program on that machine then starts with them (shown in purple; ✕ removes one).
- Alarms: a code for an option the machine doesn't have stops the simulation on that line with a red ✕, an "Alarm" in the position line and an error in Problems, and the lines after it are greyed. The first is Okuma G152 (programmable tailstock positioning): machine profiles have a new lathe option, Programmable tailstock, and without it G152 alarms. G152 W moves the tailstock, never the tool, so with the option nothing is drawn (it used to read as a Z move). New gloss word: G152 `machine.tailstock.move`.

### Speed
- Long programs (ten thousand lines and more) are much faster. Clicking a line, the arrow keys and the simulation moving to the next line only move the highlight instead of reading, checking and drawing the whole program again. Rows out of view aren't laid out, the Z timeline draws only the steps around the current one, and the toolpath is drawn as a few paths instead of one line per move. On a 10,000-line test program a click went from about 6 seconds to under 0.2, and the simulation from about 1 frame a second to 30 or more.
- Arcs are drawn and simulated with as many straight moves as their size needs (10° each on a mill, a full circle still 36) instead of 36 for every arc, so a program of short arcs no longer simulates 36 times slower than straight lines.
- The simulation speed menu has a Max speed.
- A program with very many moves could stop drawing the toolpath with "Maximum call stack size exceeded". Fixed.

## [0.1.8] - 2026-11-05

### Machines
- Opening a file with no default machine suggests the controls it looks written for, at the top of the picker's control list under "Suggested for this file". Clues come from the extension (.MIN, .SSB and .SDF for Okuma, .H for Heidenhain, .MPF and .SPF for Siemens, .EIA for Mazak, .NGC for LinuxCNC) and the text (CALL and RTS for Okuma, BEGIN PGM for Klartext, %L or #CALL for Fagor 8060, (SUB n) for Fagor 8055, O-word subroutines for LinuxCNC, G187 or M97 for Haas). The best match is picked, preferring one of your own machines with a suggested control, and the reason is shown; you still confirm it. .nc and .tap suggest nothing, since too many controls use them. The clues are in `fileHints` in gcode-rules.json.

### Gloss words
- Every full word is renamed to one pattern: a group, then the action, with a third part for less common codes. `run.*` is for moves and other things the machine does on that line (G00 `run.rapid`, G01 `run.feed`, G02 `run.cw`, G04 `run.pause`, G28 `run.home`), `set.*` for modes that stay in effect (G17 `set.xy`, G20 `set.inch`, G90 `set.abs`, G94 `set.fpm`, G96 `set.sfm`, lathe G50 S `set.smax`), and a fixed set of other groups: `cycle`, `call`, `flow`, `prog`, `spindle`, `cool`, `tool`, `tlen`, `ccomp`, `work`, `axis`, `machine` (builder extras such as chucks, tailstock, barriers and outputs), `probe`, `thread`, `torch`, `param`, `pattern` and `scale` (G41 `ccomp.left`, G43 `tlen.on`, M08 `cool.on`, G65 `call.macro`, G83 `cycle.peck`, Haas lathe M21 `machine.tailstock.in`, Okuma M-tool cycles `cycle.live.drill`). Full words are spelled out (`axis.c.join`, not `cjoin`), and options use the same words everywhere (on, off, fwd, rev, left, right, clamp, unclamp, in, out, select). Full words can be up to 28 characters. Codes that mean the same thing on different controls now share one full word (the Okuma G85 LAP roughing is `cycle.lap.rough`, Fagor's (SUB n) and Haas's M97 calls are `call.sub` and `call.local`). M02 and M30 are both `prog.end` (END): "rewind" dates from tape readers, and starting a program always goes back to the top now. Typing END gives M30.
- Short words are redone to one rule: 3 to 8 characters (2 only for a standard abbreviation or a two-letter word: G21 `MM`, G17 `XY`, IF, DO), as short as is still clear, in up to three parts of 1 to 4 characters each: the group's core (S spindle, C coolant, T tool, TL tool length, TR cutter comp, WRK work offset, AX axis, M machine, PRB probe, TH thread, PL torch, Q parameter, PAT pattern; left out for moves, modes, cycles, calls and program flow), an optional alternate (S2 second spindle, SL live tool, SG gear) and the option. Short words come straight from the full word through one table. For example M03 `SFWD`, M08 `CON`, G43 `TLON`, G41 `TRL`, G54 `WRK1`, G20 `INCH`, G91 `INCR`, G00 `RPD`, G83 `PECK`, M21 `MTSIN`.
- Control-specific codes (ones whose full word no base code uses, such as Okuma's `tlen.x` or Haas's `machine.chuck.clamp`) have a dotted underline in the gloss row, and hovering one says so.
- The long word style (SPINFWD) is gone. Full words are the default; short words (SFWD) stay. Address letters keep their prefix (SEQ10, TOOL1). Library subprograms have a full word (`sub.slotmill`) in place of a long one; library and machine files that still have a long word read it as the full word.

### Converting
- **Program › Convert to another control…** converts the open program to another control of the same machine type, so far for controls that write Fanuc-style blocks. Each code is matched by its full gloss word, not its number. Values without a decimal point are written as the number the source control reads, and dwells are rewritten in the target's units. Each line is green (direct), amber (worth a look, with the reason) or red (no match). For a red line you can leave out the code, write a local subprogram's lines in (Haas M97), comment the line out, or keep it, and the answer is remembered for that pair of controls. The result is checked by the target's own checks and by comparing the two toolpaths move by move. It opens in a new tab with a header saying it is converted and not proven. The review can also show and copy the middle format that every conversion goes through. See [docs/converting.md](docs/converting.md).

### Simulation
- On a mill, the Z timeline gives each kind of step its own symbol (drilling, pecking, tapping, boring, ramps, helixes, dwells, stops and tool changes), with steps going down on the left of the line's column and up on the right. A red dot shows where the tool is.
- Chamfers and corner radii written with `,C` and `,R` are drawn in the toolpath, with the lines out to the sharp corner shown grey and dashed. The gloss row reads them as CHAMFER and ROUND.
- A distance written with no decimal point (X1) now moves to the value the control reads, 0.0001 in on Haas and Fanuc-style controls, the same as the gloss row shows. Before, the toolpath used 1.

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
