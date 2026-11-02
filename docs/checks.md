# Checks

The Problems panel lists every mistake GlossCode finds in a program, with the worst ones first on each line. Click a problem (or press F8) to jump to its line. Each problem also shows as a red, amber or blue mark in the margin.

The checks are split in two:

- **Data** in [`data/gcode-rules.json`](../data/gcode-rules.json): the message, severity and explanation for every rule, plus the per-control tables the rules read (modal groups, canned cycle words, codes that mean something else on that control, number formats, limits).
- **Logic** in the core (`checks.c`, still to be written; the mockup's `checkProgram()` is the reference). It makes one pass over the program in the order the machine runs it, following subprogram calls, and carries the machine state as it goes: units, absolute or incremental, feed mode and rate, spindle, tool, length offset, cutter comp, the active canned cycle and the tool position.

Adding a control or fixing a cycle's word list is a data change. Adding a new kind of check is a code change plus a new entry in `rules`.

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
| `modal-group-clash` | error | Two codes from one group on one line, like `G90 G91` or `G00 G01` |
| `m-conflict` | error | M-codes that contradict each other, like `M03 M05` or `M08 M09` |
| `foreign-code` | warning or error | A code that means something else on this control, like `G54` on an Okuma (X-axis length offset) or `M97` on a Fanuc |
| `cycle-missing-word` | error | A canned cycle without a word it needs, like G81 with no R |
| `cycle-missing-choice` | error | A cycle that needs one of several words, like Haas G83 with no Q and no I/J/K |
| `cycle-stray-word` | info | A word the cycle doesn't use, like Q on a G81 |
| `missing-label` | error | M97 P, or a lathe cycle's P/Q, pointing to an N number that isn't in the file |
| `no-feed-rate` | error | A G01/G02/G03 move or feed cycle before any F |
| `feed-mode-changed` | warning | F set under G94 and then used under G95 (or the reverse), which turns 10 ipm into 10 ipr |
| `feed-plausibility` | info | A per-rev feed that's large (over 0.05 in or 1.5 mm) or a per-minute feed that's tiny |
| `spindle-off-feed` | warning | A cutting move with the spindle stopped or never started (Haas taps start the spindle themselves, so they're exempt) |
| `no-speed` | warning | M03/M04, or a tapping cycle, with no S set |
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
| `css-no-clamp` | warning | G96 on a lathe before any `G50 S` max RPM |
| `dwell-no-time` | error | G04 with no time |
| `dwell-milliseconds` | info | `G04 P500` on a control that reads a whole-number P as milliseconds (set by `dwellNoDecimal` in the dialect; Haas controls, old and NGC, do) |
| `m-per-block` | error | More M-codes on one line than the control allows (set by `mPerBlock`; Haas allows one, Okuma P200L lathes eight) |
| `rapid-below-zero` | info | A G00 to a negative Z (assuming Z0 is the top of the part) |
| `no-program-end` | warning | No M30 or M02 |
| `unknown-word` | info | A code that isn't in the dictionary or this machine's file |

`CHECKS_DEMO.nc` and `LATHE_CHECKS.nc` in the mockup have one of these mistakes on almost every line.

## Numbers and units in the English line

- The English line always shows a decimal point: `X1.` reads `X1.0`, and `X.25` reads `X0.25`.
- A distance word (X, Y, Z, U, W, I, J, K, R, Q) written without a decimal point is shown the way the control reads it. On Fanuc and Haas that's the smallest increment (Okuma is assumed to match until checked), so `X1` reads `X0.0001` in orange under G20, or `X0.001` under G21, and `missing-decimal` flags it. The per-control setting is `numbers` in the rules file, so a control set up to read whole numbers as units can turn this off.
- F and S keep their letter, followed by a small unit: `F12.0 ipm`, `F0.008 ipr`, `F300.0 mmpm`, `S2500 rpm`, `S400 sfm`, `S120 smm`. The unit follows the active G94/G95 (G98/G99 on Fanuc-style lathes), G96/G97 and G20/G21.

## How the rules file is laid out

```jsonc
{
  "rules": {
    "cycle-missing-word": { "severity": "error", "title": "...", "message": "{cycle} ({name}) needs {word}: {meaning}." }
  },
  "dialects": {
    "fanuc": { "mill": { "modalGroups": {...}, "cycles": {...}, "foreign": {...} }, "lathe": {...} },
    "haas":  { "inherits": "fanuc", "mill": { "cycles": { "G83": {...}, "G87": null } } },
    "okuma": { "inherits": "fanuc", "verified": false, ... }
  }
}
```

A dialect inherits from another and overrides by key. Objects like `cycles` and `foreign` merge one entry at a time, and `null` removes an inherited entry (Haas has no G87 back bore; it uses G77). Each cycle entry lists `requires`, `optional`, `choices` (one of several sets), `labels` (words that name N numbers), and flags: `feed` (uses F as a feed rate), `leadF` (F is the thread lead), `speed` (needs S), `spindle` (needs the spindle running), `startsSpindle` (the cycle starts it) and `modal` (false for one-shot lathe cycles).

Other dialect keys the checks read: `unitCodes` (the codes that switch inch and metric; `null` when units come from a parameter, as on Okuma lathes where G20 and G21 are home returns), `leadCodes` (motion codes whose F is a thread lead, so the feed checks skip it), `mPerBlock` and `dwellNoDecimal`. A cycle can carry `meaning` to say what a required word does in that cycle, for the missing-word message.

### Word hints

`wordHints` lists the words other codes need, so the editor can show them as grey hint text after the code (`G02` shows `R## or I## J##`). An entry is either `{ "arc": true }` (R, or the two centers for the active plane: I/J under G17, I/K under G18, J/K under G19) or `{ "requires": [...] }`. Canned cycles don't need entries here: their hints come from `requires` and `choices` in `cycles`, G04 uses `dwellWords`, and subprogram calls use `subCalls`, so the hints always match the checks. Once a line uses any word from one choice, the other choices' hints go away.

### Cycle help

`cycleHelp` (beside `dialects`) feeds the canned cycle guide (F1). It's keyed `mill` and `lathe` for the Fanuc-style base, with `haas.mill`, `haas.lathe` and so on overriding by cycle. Each cycle has `about` (what it does), `sketch` (which drawing to use), optional `labels` (letters on the drawing, since Fanuc G76 calls the thread height P where Haas calls it K) and `words`. A word entry is `[example value, what it does]` or `[example value, what it does, English word]`. The English word, when given, is what the editor shows for that letter while the cycle is active, so Haas `G76 ... A60` reads `ANGLE60` instead of an unknown word. `common` holds words shared by every cycle of that type (X, Y, Z, R, F on a mill).

The word list in the guide (and whether each word is required, one of a choice, or optional) comes from the dialect's `cycles` table, not from `cycleHelp`.

`verified: false` marks tables written from general knowledge that still need checking against the control's programming manual. The mockup shows a banner in the Problems panel for those.

## How much Haas and Okuma support there is today

| Control | Translation | Checks | Confidence |
|---|---|---|---|
| Haas mill (NGC) | Good for 2.5-axis work, plus English for G12/G13, G47, G70–G72 bolt patterns, G110–G129 and G154 work offsets, M10–M13 brakes | All rules above, with Haas cycle words (I/J/K peck, J retract on taps, L repeats), M97 local subprograms, one M code per line, P without a decimal as milliseconds | High: checked against the 2025 and 2020 mill manuals (see [manual-reviews/haas-ngc.md](manual-reviews/haas-ngc.md)) |
| Haas lathe (NGC) | Good for turning, facing, grooving and threading, plus English for work offsets G110–G129 and G154, live tool, chuck, tailstock and sub-spindle M codes, M88/M89 high-pressure coolant, G95 live-tool tap | All rules above, with Haas one-block G71/G72/G73/G76, G90/G92/G94 cycles, G50 S clamp, G84 starting the spindle, one M code per line, P without a decimal as milliseconds | High: checked against the 2020 and 2025 lathe manuals (see [manual-reviews/haas-ngc.md](manual-reviews/haas-ngc.md) and [haas-ngc-lathe-2025.md](manual-reviews/haas-ngc-lathe-2025.md)) |
| Fanuc (0i/30i) | Same base as Haas | Same, with Fanuc cycle words and M97 flagged as Haas-only | High |
| Haas mill, 1995 control (`haas1995`) | Same as Haas mill, plus G87/G88 manual-retract bores, G110–G129 work offsets and M16 | Haas rules with the 1995 cycle words (no P on G73/G83, no J on G74/G84), one M-code per line, P without a decimal as milliseconds, and G93/G95/G96/G154/M88/M89 flagged | High: checked against the June 1995 VF-Series Operator's Manual (see [manual-reviews/haas-vf-1995.md](manual-reviews/haas-vf-1995.md)) |
| Okuma mill (OSP) | G15 H work offsets, G56 H length offset, G53 offset cancel, CALL / RTS subprograms, M02 | All the generic rules, plus Okuma's traps: G54–G59 (length offsets on Okuma), G43, G28, M97, M98, M99 | Medium: first draft, not yet checked against an OSP manual |
| Okuma lathe (OSP) | G90/G91, G94/G95 feed modes, G20 home return, G28/G29 torque limit, G31–G35 thread cycles, LAP codes named | Generic rules, plus G71/G72 thread, G73/G74 grooving and G77/G78 tapping cycles, up to eight M codes per line, G54–G59 (info), G98/G99, G28 and M97/M98 flagged | Medium: lathe tables checked against the OSP-P200L manual (see [manual-reviews/okuma-osp-p200l.md](manual-reviews/okuma-osp-p200l.md)); LAP isn't checked yet |

### Not covered yet

**Haas mill:** checks for G12/G13 circular pockets, G150 pocketing, G70/G71/G72 bolt patterns and G47 engraving (they translate but their words aren't checked), G51/G68 scaling and rotation, 4th and 5th axis (A/B words, G93 inverse time, G234 TCPC, G254 DWO), and macros (`#` variables, IF, WHILE, GOTO, G65 calls). Macro lines are left alone rather than flagged.

**Haas lathe:** live tooling checks (C axis, G112 polar interpolation, Y axis, G95/G186/G195 live-tool taps, G242–G246), sub-spindle and tailstock codes, bar feeder, and tool nose comp checks.

**Okuma, both:** the parts of OSP that aren't Fanuc-shaped. These need their own parser support, not just table entries:

- Sequence names made of letters (`NAT1`, `NLAP1`) and program names like `OSUB`. The mockup only handles numeric `N` and `O` labels.
- User Task variables (`VC1`, `V1`, named variables) and `IF [..] N..` / `GOTO` branches.
- Schedule programs and file types (`.MIN`, `.SSB`, `.SDF`).
- Okuma lathe LAP: the G85/G86/G87/G88 roughing and finishing cycles read a contour defined between G81/G82 and G80, named by a sequence name. Checking these needs the contour block support above.
- Okuma lathe 6-digit tool calls (`T010101`) and two-letter words (DA, SB, QA, SA).
- Twin-turret G13/G14 and the Okuma M-codes that differ from Fanuc.

To take Okuma past draft quality, the next step is a handful of real programs from each Okuma machine, plus the control model (P300, P500…) so the tables can be checked against its manual.
