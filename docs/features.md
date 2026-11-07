# Features

This list tracks what the mockup shows. Nothing is implemented yet.

## Shown in the mockup

**Editor**
- [ ] Interleaved view: a gloss line (plain English) above every code line
- [ ] Fixed-width columns (at least 12 characters for full words, 8 for short) so words line up down the whole file
- [ ] Full words (`run.feed`, `set.inch`, `cycle.peck`, `machine.tailstock.in`: one of a fixed set of groups, then the action, with a third part for less common codes; control-specific codes are underlined with dots) and short words (View › Gloss words)
- [ ] Type code or type gloss (View › Edit in; the older layouts only)
- [ ] Autocomplete for gloss and code words
- [ ] Keyboard editing by word: ← → move between words, ↑ ↓ between lines, Enter edits and Enter again finishes (the word stays selected), Delete removes the word, typing replaces it
- [ ] While editing, Space starts a new word to the right; in code, typing a letter after a number does too (`G01X` becomes `G01` and `X`)
- [ ] Shift+Enter breaks the line after the selected word, moving the rest to a new numbered line
- [ ] Paste (Ctrl+V or Edit › Paste) splits the text the way opening a file does. One line goes into the current line with each word in its own cell (`G01X1.Y2.` becomes three words). Several lines, or a whole program, go in as their own lines below the current one, or replace it when it's blank
- [ ] Select whole lines by dragging the mouse across them, Shift+↑↓ or Shift+click (Ctrl+A selects all). Right-click, or Ctrl+C / Ctrl+X, copies or cuts them as code text, the same as Save writes it, with no gloss. Ctrl+D duplicates them below; Ctrl+V pastes over them; Delete removes them
- [ ] View › Edit in picks the line typing goes to: code (the default) or gloss
- [ ] Code with gloss above (the default layout): each line as plain text with its N number in its own column and the gloss above in small grey italics, not selectable; N numbers and comments aren't repeated in the gloss. Click to place the caret; Enter breaks the line, Backspace/Delete at the ends join lines, Esc undoes the line's changes
- [ ] Problem lines tinted yellow (warning), orange (error) or red (machine alarm) with the word at fault underlined; one dismissable banner for controls whose rules are a first draft
- [ ] Hint text after codes for the words they still need (`G02` shows `R## or I## J##`, `G83` shows `Z## R## Q##`). Clicking R## types the R and hides I and J; clicking I## hides R but keeps J
- [ ] Mode-clash warnings in the status bar
- [ ] Auto N numbering on new lines (step 10, midpoint when there's no room)
- [ ] Renumber that leaves subprogram labels alone
- [ ] Undo and redo
- [ ] Find, matching both code and gloss
- [ ] Sort the words on each line into a consistent order
- [ ] Menu bar: File, Edit, View, Insert, Program, Simulate
- [ ] Starts on a home page: recent programs (each with the machine it was opened for), New program, Open, and default machines by file type. Sample programs are a separate download, not part of the program
- [ ] Clicking a recent program opens it. If it was moved, renamed or deleted, GlossCode asks: **Locate…** finds it with the Open dialog (it keeps its place in the list and its machine), or **Remove from list**
- [ ] One tab per open program. Menus, panels and checks act on the active tab; each tab keeps its own machine, selected line and word, undo history and scroll position. Ctrl+Tab switches, Ctrl+W closes (asking first if there are unsaved changes)
- [ ] File › New… asks which machine the program is for, then opens a blank program in a new tab
- [ ] Opening a file asks which machine it's for, unless it's in the recent list (the machine used last time) or its extension has a default machine (set on the home page, or by "Always use this machine for .nc files" when asked)
- [ ] When it asks, controls the file looks written for come first under "Suggested for this file", from its extension (.MIN, .SSB and .SDF for Okuma, .H for Heidenhain, .MPF/.SPF for Siemens, .EIA for Mazak, .NGC for LinuxCNC) and clues in its text (CALL and RTS, BEGIN PGM, %L, (SUB n), O-word subroutines, G187 or M97). The best match is picked, preferring your own machine with one of those controls, and the reason is shown. Nothing opens without your OK; .nc and .tap suggest nothing, since many controls use them
- [ ] Hole pattern tool (Insert › Hole pattern…): grid (distance, angle and hole count along each axis) or bolt circle (diameter or radius, hole count, start angle, direction, complete circle or an arc by angle or by distance), in the active plane (G17 XY, G18 XZ, G19 YZ), with a preview; inserts one line per hole after the canned-cycle line, absolute or incremental to match G90/G91
- [ ] Insert › canned cycle by category (drilling, tapping, boring; roughing, finishing, turning and facing, grooving, threading, live tooling): sketch, a box per word with required ones marked, and the finished line with its gloss; categories the machine can't run are hidden
- [ ] Subprogram library (Insert › Subprogram library…, see [subprogram-library.md](subprogram-library.md)): reusable subprograms with named variables, stored in built-in, shop and personal folders. Search, filter to this machine, fill in the values, and insert as a `G65` call or as plain lines worked out from the values (for controls without the macro option). New, edit, make my own copy, delete and export; Insert › Save N1000 to the library… turns a local subprogram into a library one
- [ ] Lathe options in the machine profile (live tooling, Y axis) that decide which cycles and words are offered

**Reading**
- [ ] Inline expansion of subprogram calls, marked with purple N numbers; edits change the subprogram
- [ ] Library calls read by name (`G65 P9101` reads call.macro sub.slotmill, `Z-0.15` reads DEP-0.15) and expand to show the lines they run, in green; the toolpath preview follows them
- [ ] View › Show: both lines, gloss only, or code only
- [ ] View › Layout: words in program order, or columns by word type, most used first (motion and cycle codes, X Y Z, F, S, spindle M-codes…) with rare words at the end. The order is set in the machine's rules
- [ ] In columns, several words in one cell stack, so that line gets taller instead of the column getting wider
- [ ] In columns, lines that don't move the machine (program number, safety line, M00, M01, M30, tool change, dwell, reference return, subprogram calls and returns) keep their words in program order from the left
- [ ] In columns, an empty cell on a motion line shows the modal value still in effect from an earlier line (motion, position, feed, speed, spindle, tool, coolant, cycle R and Q) in grey. View › Modal values in empty cells turns it off
- [ ] Active-modes panel for the selected line, with a mark on modes set on that line
- [ ] Line colors: rapid (amber), feed (blue), arc (teal), cycle (magenta)
- [ ] Canned cycle guide (F1, Help menu, or "How G76 works…" in the side panel): a sketch of how the cycle moves, an example line with every word it takes (gloss above), and what each word does and whether it's required. A button starts a new line with that cycle

**Previews**
- [ ] XY toolpath preview that follows subprogram calls
- [ ] Toolpath colors by move type or by tool
- [ ] Moves after the selected line greyed out, hidden, or shown normally
- [ ] Simulation playback: restart, step back, play/pause, step forward, speed (¼× to 64×, and Max)
- [ ] Playback pauses at M00, and at M01 when optional stop is on; block delete skips lines that start with /
- [ ] Hide rapid moves (the G00 button on the toolpath), to compare with the control's graphics screen; it only changes the drawing
- [ ] Hide the toolpath still to come (a button on the toolpath, beside G00)
- [ ] Drilling cycles plunge and retract at each hole, in the toolpath and the Z-by-line timeline; L0 on the cycle line stores it without drilling
- [ ] Position line above the toolpath: X and Y (X and Z on a lathe), line number and N number
- [ ] Expanded simulation view: large toolpath at the top left, a few program lines centered on the active line, Z by line and active modes on the right
- [ ] Z-by-line timeline in execution order, centered on the selected line
- [ ] Scale lines on the Z (X on a lathe) timeline in powers of ten, two at a time: the finer ones light, the coarser ones darker and labeled (0", -1"; Ø values on a lathe)
- [ ] Lathe X timeline scaled to the cutting moves: rapids out to a tool change position run off the top with an arrow
- [ ] Timeline value picker: Z (X radius on a lathe), feed rate or spindle speed; on plasma, feed rate or Z with a torch-on band and process change marks
- [ ] Mill Z timeline symbols: moves down on the left of a line's column and up on the right; drill, dwell, peck (G83 loops, G73 ticks), tap, bore (G85, G86, G76, G89), ramp, helix (a loop per circuit), G04, M00 (filled square), M01 (empty square), tool change, Z home, M05, program end, and hatched block delete lines; hover a symbol for its name
- [ ] A red dot on the timeline where the tool is, following each move while the simulation runs
- [ ] ,C chamfer and ,R corner radius on G01 moves: drawn in the toolpath, with the lines out to the sharp corner grey and dashed
- [ ] Haas G47 engraving in the toolpath and timeline: one grey rectangle per line of text (J tall, turned by I, open on the right since letter widths aren't known), with the tool as a line sweeping along it
- [ ] Haas G70/G71/G72 bolt hole patterns drilled with the active cycle, G68 rotation and G101 mirror followed, and a small circle at every drilled hole
- [ ] Cutter comp side: a grey band beside G41/G42 moves and G12/G13 pocket circles, on the side the tool's centre is on (View › Cutter comp side)
- [ ] G73/G83 peck retracts shown with a grey band on the Z timeline, since the amounts are machine settings
- [ ] Haas G107 cylindrical mapping drawn unrolled, in a rectangle one turn tall (open at the top when Q0 leaves the diameter to Setting 34)
- [ ] Okuma lathe G71 threading (and Haas one-line G76) drawn pass by pass (M73/M74/M75 infeed patterns, M32/M33/M34 flank infeed); G73 grooving and G77/G78 tapping drawn as cycles
- [ ] Variables panel: each variable's value at the line, start values for the simulation, read-before-set warnings, common values saved to the machine profile
- [ ] Alarms: a code for an option the machine profile doesn't have (Okuma G152 programmable tailstock) stops the simulation with a red ✕ and an error

**Files and machines**
- [ ] Machine selector (mill or lathe, with brand overrides): Haas, Fanuc and Okuma
- [ ] Plasma machine type: torch on/off checks in place of the spindle checks, D as the kerf offset, no canned cycles or tool offsets (Hypertherm, Centroid Acorn, Tormach)
- [ ] End of block: `;` at the end of every line for controls that need it, set per machine profile. Shown after an empty word space in the standard view and written on save. Files that already use `;` are read correctly on any machine
- [ ] Gloss numbers always show a decimal point; distance words without one show what the control reads (X1 → X0.0001)
- [ ] F and S keep their letter with a small unit (ipm, ipr, mmpm, mmpr, rpm, sfm, smm)

**Converting** (see [converting.md](converting.md))
- [ ] Program › Convert to another control…: reads the program with its own control, lifts each code to its full gloss word, and writes the target control's code for the same meaning. Values become real numbers (X1 on a Haas is written X0.0001) and dwells are rewritten in the target's units
- [ ] Review with a level per line: green (direct, toolpath matches), amber (worth a look, with the reason) and red (no match: leave out the code, write a local subprogram in, comment the line out, or keep it). Answers are remembered per pair of controls
- [ ] The converted program is checked by the target's reading, checks and cycle word lists, and its simulation is compared move by move with the source
- [ ] The middle format: one readable line per block with full gloss words and real values, which can be copied

**Checks** (see [checks.md](checks.md))
- [ ] Problems panel with severity filters, margin marks, click or F8 to jump to the line
- [ ] Canned cycles missing required words, per control (Haas, Fanuc, Okuma)
- [ ] Feed move with no F, F left over from the other feed mode, cutting with the spindle off
- [ ] Word repeated in a line, two codes from one modal group, contradicting M-codes
- [ ] Missing decimal point, arc geometry, cutter comp start, tool length offset after a tool change
- [ ] Codes that mean something else on the selected control
- [ ] System Open and Save dialogs
- [ ] Help › About GlossCode: version, website, release notes, check for updates through GitHub Releases and download the installer or portable copy (see [releasing.md](releasing.md))

## Later

- [ ] Native Linux build
- [ ] Machine definition file format and a few starter machines
- [ ] Okuma checked against an OSP manual and real programs; LAP cycles, sequence names, User Task variables. Done for lathes: sequence names, V and named variables, G85/G87 LAP and G74 in the simulation, G50 zero shift
- [ ] Macro programs (#vars, IF, WHILE) and 4th/5th axis checks. The subprogram library's reader already runs a subset (see subprogram-library.md)
- [ ] Checks inside library calls, save called library programs with the program, re-insert written-in lines, Okuma CALL with variables
- [ ] Machine limits (travel, max RPM and feed) and part/fixture models for rapid-into-part checks
- [ ] Find and replace, with whole-word and regex options
- [ ] Move selected lines up or down
- [ ] Comment out or block-delete (/) a line with one key
- [ ] Go to line or N number (Ctrl+G), and bookmarks
- [ ] Tool list: every tool, its offsets, and the lines that use it
- [ ] Program stats: travel extents, cut distance and a rough run time
- [ ] Macro variables (#100, IF, WHILE) shown with their values. Done for `#` assignments and words like `X-#101`: they're shown, and the simulation works them out and shows each word's values. IF, WHILE and GOTO are followed by the simulation, and Okuma V and named variables (`V1=3`, `X=DIA1`) are worked out too
- [ ] Preview: zoom, pan, click a move to jump to its line, and measure between two points
- [ ] Compare two programs side by side
- [ ] Autosave and a backup copy before each save
- [ ] Print or export a listing with the gloss lines
- [ ] An editor for the word dictionary
- [ ] Font size zoom, dark theme and adjustable column width
- [ ] Fast scrolling in very large files (100,000+ lines)
