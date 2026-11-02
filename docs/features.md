# Features

This list tracks what the mockup shows. Nothing is implemented yet.

## Shown in the mockup

**Editor**
- [ ] Interleaved view: an English line above every G-code line
- [ ] Fixed-width columns (10 characters for long words, 8 for short) so words line up down the whole file
- [ ] Long and short word styles
- [ ] Type G-code or type English (View › Edit in). Clicking a G-code word while editing English switches to editing G-code and selects it, and clicking an English word while editing G-code switches back
- [ ] Autocomplete for English and G-code words
- [ ] Keyboard editing by word: ← → move between words, ↑ ↓ between lines, Enter edits and Enter again finishes (the word stays selected), Delete removes the word, typing replaces it
- [ ] While editing, Space starts a new word to the right; in G-code, typing a letter after a number does too (`G01X` becomes `G01` and `X`)
- [ ] Shift+Enter breaks the line after the selected word, moving the rest to a new numbered line
- [ ] Paste (Ctrl+V or Edit › Paste) splits the text the way opening a file does. One line goes into the current line with each word in its own cell (`G01X1.Y2.` becomes three words). Several lines, or a whole program, go in as their own lines below the current one, or replace it when it's blank
- [ ] Select whole lines by dragging the mouse across them, Shift+↑↓ or Shift+click (Ctrl+A selects all). Right-click, or Ctrl+C / Ctrl+X, copies or cuts them as G-code text, the same as Save writes it, with no English. Ctrl+D duplicates them below; Ctrl+V pastes over them; Delete removes them
- [ ] Caps Lock switches between editing the G-code line and the English line (View › Caps Lock switches between them)
- [ ] Hint text after codes for the words they still need (`G02` shows `R## or I## J##`, `G83` shows `Z## R## Q##`). Clicking R## types the R and hides I and J; clicking I## hides R but keeps J
- [ ] Mode-clash warnings in the status bar
- [ ] Auto N numbering on new lines (step 10, midpoint when there's no room)
- [ ] Renumber that leaves subprogram labels alone
- [ ] Undo and redo
- [ ] Find, matching both G-code and English
- [ ] Sort the words on each line into a consistent order
- [ ] Menu bar: File, Edit, View, Insert, Program, Simulate
- [ ] Starts on a home page: recent programs (each with the machine it was opened for), New program, Open, and default machines by file type. Sample programs are a separate download, not part of the program
- [ ] Clicking a recent program opens it. If it was moved, renamed or deleted, GlossCode asks: **Locate…** finds it with the Open dialog (it keeps its place in the list and its machine), or **Remove from list**
- [ ] One tab per open program. Menus, panels and checks act on the active tab; each tab keeps its own machine, selected line and word, undo history and scroll position. Ctrl+Tab switches, Ctrl+W closes (asking first if there are unsaved changes)
- [ ] File › New… asks which machine the program is for, then opens a blank program in a new tab
- [ ] Opening a file asks which machine it's for, unless it's in the recent list (the machine used last time) or its extension has a default machine (set on the home page, or by "Always use this machine for .nc files" when asked)
- [ ] Hole pattern tool (Insert › Hole pattern…): grid (distance, angle and hole count along each axis) or bolt circle (diameter or radius, hole count, start angle, direction, complete circle or an arc by angle or by distance), in the active plane (G17 XY, G18 XZ, G19 YZ), with a preview; inserts one line per hole after the canned-cycle line, absolute or incremental to match G90/G91
- [ ] Insert › canned cycle by category (drilling, tapping, boring; roughing, finishing, turning and facing, grooving, threading, live tooling): sketch, a box per word with required ones marked, and the finished line with its English; categories the machine can't run are hidden
- [ ] Subprogram library (Insert › Subprogram library…, see [subprogram-library.md](subprogram-library.md)): reusable subprograms with named variables, stored in built-in, shop and personal folders. Search, filter to this machine, fill in the values, and insert as a `G65` call or as plain lines worked out from the values (for controls without the macro option). New, edit, make my own copy, delete and export; Insert › Save N1000 to the library… turns a local subprogram into a library one
- [ ] Lathe options in the machine profile (live tooling, Y axis) that decide which cycles and words are offered

**Reading**
- [ ] Inline expansion of subprogram calls, marked with purple N numbers; edits change the subprogram
- [ ] Library calls read by name (`G65 P9101` reads MACRO SLOTMILL, `Z-0.15` reads DEP-0.15) and expand to show the lines they run, in green; the toolpath preview follows them
- [ ] View › Show: both lines, English only, or G-code only
- [ ] View › Layout: words in program order, or columns by word type, most used first (motion and cycle codes, X Y Z, F, S, spindle M-codes…) with rare words at the end. The order is set in the machine's rules
- [ ] In columns, several words in one cell stack, so that line gets taller instead of the column getting wider
- [ ] In columns, lines that don't move the machine (program number, safety line, M00, M01, M30, tool change, dwell, reference return, subprogram calls and returns) keep their words in program order from the left
- [ ] In columns, an empty cell on a motion line shows the modal value still in effect from an earlier line (motion, position, feed, speed, spindle, tool, coolant, cycle R and Q) in grey. View › Modal values in empty cells turns it off
- [ ] Active-modes panel for the selected line, with a mark on modes set on that line
- [ ] Line colors: rapid (amber), feed (blue), arc (teal), cycle (magenta)
- [ ] Canned cycle guide (F1, Help menu, or "How G76 works…" in the side panel): a sketch of how the cycle moves, an example line with every word it takes (English above), and what each word does and whether it's required. A button starts a new line with that cycle

**Previews**
- [ ] XY toolpath preview that follows subprogram calls
- [ ] Toolpath colors by move type or by tool
- [ ] Moves after the selected line greyed out, hidden, or shown normally
- [ ] Simulation playback: restart, step back, play/pause, step forward, speed
- [ ] Playback pauses at M00, and at M01 when optional stop is on; block delete skips lines that start with /
- [ ] Position line above the toolpath: X and Y (X and Z on a lathe), line number and N number
- [ ] Expanded simulation view: large toolpath at the top left, a few program lines centered on the active line, Z by line and active modes on the right
- [ ] Z-by-line timeline in execution order, centered on the selected line

**Files and machines**
- [ ] Machine selector (mill or lathe, with brand overrides): Haas, Fanuc and Okuma
- [ ] End of block: `;` at the end of every line for controls that need it, set per machine profile. Shown after an empty word space in the standard view and written on save. Files that already use `;` are read correctly on any machine
- [ ] English numbers always show a decimal point; distance words without one show what the control reads (X1 → X0.0001)
- [ ] F and S keep their letter with a small unit (ipm, ipr, mmpm, mmpr, rpm, sfm, smm)

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
- [ ] Okuma checked against an OSP manual and real programs; LAP cycles, sequence names, User Task variables
- [ ] Macro programs (#vars, IF, WHILE) and 4th/5th axis checks. The subprogram library's reader already runs a subset (see subprogram-library.md)
- [ ] Checks inside library calls, save called library programs with the program, re-insert written-in lines, Okuma CALL with variables
- [ ] Machine limits (travel, max RPM and feed) and part/fixture models for rapid-into-part checks
