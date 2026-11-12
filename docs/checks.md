# Checks

The Problems panel lists every mistake GlossCode finds in a program, with the worst ones first on each line. Click a problem (or press F8) to jump to its line. Each problem also shows as a red, amber or blue mark in the margin.

The checks are split in two:

- **Data**: the message, severity and explanation for every rule are in `rules` in [`data/gcode-rules.json`](../data/gcode-rules.json). The per-control tables the rules read (modal groups, canned cycle words, codes that mean something else on that control, number formats, limits) are each control's `dialect` in [`data/controls/`](../data/controls/).
- **Logic** in [`src/ui/js/checks.js`](../src/ui/js/checks.js). `checkProgram()` makes one pass over the program in the order the machine runs it, following subprogram calls, and carries the machine state as it goes: units, absolute or incremental, feed mode and rate, spindle, tool, length offset, cutter comp, the active canned cycle and the tool position. `checkLine()` runs one function per group of checks on each line (`checkGrammar`, `checkSpindle`, `checkCycles`, `checkMove` and so on), and each one calls `emit(li, "rule-id", {values})` for a problem it finds.

Adding a control or fixing a cycle's word list is a data change. Adding a new kind of check is a code change in `checks.js` plus a new entry in `rules`. After either, run `node scripts/make-ui-data.mjs` and `node scripts/make-goldens.mjs`, and read the diff in `tests/golden/` to see which problems appeared or went away.

## Severities

| Severity | Meaning |
|---|---|
| error | The control will alarm, or the program will cut something different from what it says. |
| warning | Very likely a mistake, but some shops do it on purpose. |
| info | Worth a look. Often fine. |

A machine definition file will be able to change any rule's severity or turn it off; see [machine-definitions.md](machine-definitions.md).

## Rules

| Rule id | Severity | What it catches |
|---|---|---|
| `dup-address` | error | The same letter twice in one line, like `Y2. Y3.` (G and M are exempt) |
| `empty-value` | error | A letter with no number, like `X` on its own |
| `unbalanced-brackets` | error | An expression whose `[` and `]` don't pair up, like `V58=[[V50+V51]/2+V52` |
| `modal-group-clash` | error | Two codes from one group on one line, like `G90 G91` or `G00 G01` |
| `m-conflict` | error | M-codes that contradict each other, like `M03 M05` or `M08 M09` |
| `foreign-code` | warning or error | A code that means something else on this control, like `G54` on an Okuma (X-axis length offset) or `M97` on a Fanuc |
| `cycle-missing-word` | error | A canned cycle without a word it needs, like G81 with no R |
| `cycle-missing-choice` | error | A cycle that needs one of several words, like Haas G83 with no Q and no I/J/K |
| `code-missing-word` | error | A code with words of its own missing one it needs, like a Fagor 8055 G60 pattern with only K, or a G66 pocket with no S and E profile labels |
| `cycle-call-no-def` | error | Heidenhain Klartext: CYCL CALL, M99 or M89 before any CYCL DEF |
| `pgm-name-mismatch` | warning | Heidenhain Klartext: END PGM names another program than BEGIN PGM |
| `block-number-order` | info | Heidenhain Klartext: a block number that isn't higher than the one before |
| `pattern-no-cycle` | warning | A Fagor 8055 multiple machining pattern (G60 to G65) with no canned cycle or (MCALL) active to repeat at its points |
| `cycle-needs-feed-per-min` | error | Fagor 8065 lathe: a live tool cycle (G160 to G163) in G95 with no G94 feed programmed before it |
| `cycle-stray-word` | info | A word the cycle doesn't use, like Q on a G81 |
| `missing-label` | error | M97 P, a lathe cycle's P/Q, or a Fagor 8055 G66 label (S, E, D, H, R, I, F, K), pointing to an N number that isn't in the file; on Heidenhain Klartext, a CALL LBL or FN 9 to 12 jump to an LBL that isn't in the file |
| `no-feed-rate` | error | A G01/G02/G03 move or feed cycle before any F |
| `feed-mode-changed` | warning | F set under G94 and then used under G95 (or the reverse), which turns 10 ipm into 10 ipr |
| `feed-plausibility` | info | A per-rev feed that's large (over 0.05 in or 1.5 mm) or a per-minute feed that's tiny |
| `spindle-off-feed` | warning | A cutting move with the spindle stopped or never started (Haas taps start the spindle themselves, so they're exempt) |
| `no-speed` | warning | M03/M04, or a tapping cycle, with no S set |
| `torch-off-cut` | warning | Plasma: a feed move with the torch off or never turned on. Takes the place of `spindle-off-feed` on controls whose cut on and cut off codes are known |
| `torch-on-at-end` | warning | Plasma: the program ends with the torch still on |
| `missing-decimal` | warning | A distance word with no decimal point. `X1` is 0.0001 in on a Fanuc-style control |
| `arc-no-center` | error | G02/G03 with no R and no I/J/K |
| `arc-r-and-ijk` | warning | An arc with both R and I/J/K |
| `arc-full-circle-r` | error | A full circle written with R |
| `arc-radius-mismatch` | warning | The arc's end point isn't the same distance from the center as its start |
| `comp-start-on-arc` | error | G41/G42 turned on during an arc |
| `comp-no-d` | warning | G41/G42 with no D offset given |
| `tlo-missing` | warning | A Z move after a tool change before G43 H (G56 H on Okuma) |
| `tlo-h-mismatch` | info | `T3` with `H04` |
| `cycle-left-on` | warning | A canned cycle still active at a tool change or the program end |
| `comp-left-on` | warning | Cutter comp still on at a tool change or the program end |
| `g28-absolute` | warning | `G28 Z0.` under G90, which moves through work Z0 on the way home |
| `css-no-clamp` | warning | G96 on a lathe before any max RPM (`G50 S`, or `G92 S` on controls that clamp with G92) |
| `dwell-no-time` | error | G04 with no time |
| `dwell-milliseconds` | info | `G04 P500` on a control that reads a whole-number P as milliseconds (set by `dwellNoDecimal` in the dialect; Haas controls, old and NGC, do) |
| `m-per-block` | error | More M-codes on one line than the control allows (set by `mPerBlock`; Haas allows one, Okuma P200L lathes eight) |
| `rapid-below-zero` | info | A G00 to a negative Z (assuming Z0 is the top of the part) |
| `no-program-end` | warning | No M30 or M02 |
| `unknown-word` | info | A code that isn't in the dictionary or this machine's file |

`CHECKS_DEMO.nc` and `LATHE_CHECKS.nc` in `examples/` have one of these mistakes on almost every line.

## Numbers and units in the gloss line

- The gloss line always shows a decimal point: `X1.` reads `X1.0`, and `X.25` reads `X0.25`.
- A distance word (X, Y, Z, U, W, I, J, K, R, Q) written without a decimal point is shown the way the control reads it. On Fanuc and Haas that's the smallest increment (Okuma is assumed to match until checked), so `X1` reads `X0.0001` in orange under G20, or `X0.001` under G21, and `missing-decimal` flags it. The per-control setting is `numbers` in the rules file, so a control set up to read whole numbers as units can turn this off.
- F and S keep their letter, followed by a small unit: `F12.0 ipm`, `F0.008 ipr`, `F300.0 mmpm`, `S2500 rpm`, `S400 sfm`, `S120 smm`. The unit follows the active G94/G95 (G98/G99 on Fanuc-style lathes), G96/G97 and G20/G21.

## How the rules and control files are laid out

```jsonc
// data/gcode-rules.json
{
  "rules": {
    "cycle-missing-word": { "severity": "error", "title": "...", "message": "{cycle} ({name}) needs {word}: {meaning}." }
  },
  "controls": ["fanuc", "haas", "okuma", ...]      // one file each in data/controls/
}

// data/controls/haas.json
{
  "dialect": { "label": "Haas NGC", "inherits": "fanuc", "mill": { "cycles": { "G83": {...}, "G87": null } }, "lathe": {...} },
  "words": { "haas": {...}, "haas.lathe": {...} },  // the gloss words only this control has (see gloss-words.md)
  "cycleHelp": { "haas.mill": {...} }                // canned cycle guide text that differs from the Fanuc-style base
}
```

`scripts/make-ui-data.mjs` joins the control files into the page's data: each `dialect` becomes `RULES.dialects.<id>`, `words` goes into `DICT.machineOverrides` and `cycleHelp` into `RULES.cycleHelp`. To add a control, add its file and its id to `controls`.

A dialect inherits from another and overrides by key. Objects like `cycles` and `foreign` merge one entry at a time, and `null` removes an inherited entry (Haas has no G87 back bore; it uses G77). Each cycle entry lists `requires`, `optional`, `choices` (one of several sets), `labels` (words that name N numbers), and flags: `feed` (uses F as a feed rate), `leadF` (F is the thread lead), `speed` (needs S), `spindle` (needs the spindle running), `startsSpindle` (the cycle starts it) and `modal` (false for one-shot lathe cycles).

Other dialect keys the checks read: `unitCodes` (the codes that switch inch and metric; `null` when units come from a parameter, as on Okuma lathes where G20 and G21 are home returns), `leadCodes` (motion codes whose F is a thread lead, so the feed checks skip it), `mPerBlock` and `dwellNoDecimal`. A cycle can carry `meaning` to say what a required word does in that cycle, for the missing-word message.

### Word hints

`wordHints` lists the words other codes need, so the editor can show them as grey hint text after the code (`G02` shows `R## or I## J##`). An entry is either `{ "arc": true }` (R, or the two centers for the active plane: I/J under G17, I/K under G18, J/K under G19) or `{ "requires": [...] }`. Canned cycles don't need entries here: their hints come from `requires` and `choices` in `cycles`, G04 uses `dwellWords`, and subprogram calls use `subCalls`, so the hints always match the checks. Once a line uses any word from one choice, the other choices' hints go away.

### Cycle help

`cycleHelp` feeds the canned cycle guide (F1). The Fanuc-style base is keyed `mill` and `lathe` in `gcode-rules.json`; a control's own file adds `haas.mill`, `haas.lathe` and so on, overriding by cycle. Each cycle has `about` (what it does), `sketch` (which drawing to use), optional `labels` (letters on the drawing, since Fanuc G76 calls the thread height P where Haas calls it K) and `words`. A word entry is `[example value, what it does]` or `[example value, what it does, gloss word]`. The gloss word, when given, is what the editor shows for that letter while the cycle is active, so Haas `G76 ... A60` reads `ANGLE60` instead of an unknown word. `common` holds words shared by every cycle of that type (X, Y, Z, R, F on a mill).

The word list in the guide (and whether each word is required, one of a choice, or optional) comes from the dialect's `cycles` table, not from `cycleHelp`.

### Plasma and other machine types

`machineTypes` (in `gcode-rules.json`) lists the machine types. `mill` and `lathe` are the original two. `plasma` has `"base": "mill"`: a plasma machine starts from its control's mill tables along the whole inherits chain, then the control's `plasma` tables go on top, and a word not in `<control>.plasma` falls back to `<control>.mill` and the mill meaning in the dictionary. `fanuc.plasma` is the shared plasma base. It turns off canned cycles, tool changes, tool length offsets and spindle speed modes, and lays out the columns with a Torch column (the control's cut codes) and a Kerf column (D). A control with no mill tables, like Hypertherm, has only its plasma table.

A plasma table's `process` names the torch: `on` and `off` are the cut on and cut off codes, which replace the spindle checks (`spindle-off-feed` and `no-speed` don't run on plasma), and `changes` lists codes that change the process or material, which the timeline marks. Controls whose cut codes aren't verified leave `on` empty, which turns the torch checks off. `timeline` in `machineTypes` lists what the timeline can plot for that type, the first being the default.

| Control | Cut on | Cut off | Notes |
|---|---|---|---|
| Hypertherm Phoenix / EDGE Connect (`hypertherm`) | M07 (or M03/M04 when code mapping makes them cut on) | M08 (or M05/M06) | G59 sets variables, G97/G98 start and end a loop, G04 X dwell, G94/G95 flagged as unsupported, G41/G42 D kerf |
| Centroid Acorn (`centroid`) | M61 touch off and pierce | M62 torch off and raise | M65 material profile; everything else as Centroid CNC12 mill |
| Tormach PathPilot (`tormach`) | not checked yet | not checked yet | G15 probe and G16 pierce instead of polar coordinates; M200–M213 aren't in the dictionary yet |

See [manual-reviews/plasma-hypertherm-tormach-centroid.md](manual-reviews/plasma-hypertherm-tormach-centroid.md).

`fileHints` (in `gcode-rules.json`) suggests controls when a file with no default machine is opened. Each rule names `controls`, optional `ext` (lower case, with the dot) and `content` clues (`re`, optional `flags`, and `why`, the reason shown). A content clue counts 3 and an extension 2; the controls of the best-scoring rules go first in the picker. Only add clues that belong to one control family.

`verified: false` marks tables written from general knowledge that still need checking against the control's programming manual. GlossCode shows a banner in the Problems panel for those.

## How much each control is checked

Which controls are supported is in the [README](../README.md#supported-controls), and how sure we are of each, with the reasons, is in [manual-reviews/control-confidence.md](manual-reviews/control-confidence.md). Each control's manual review in [manual-reviews/](manual-reviews/) lists what its tables don't cover yet.
