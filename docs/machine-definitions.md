# Machine definition files

> **Status: proposal.** This describes how word definitions, canned cycles and check settings should be organized once there are many machines. Today they live in two shared files (`data/gcode-words.json` and `data/gcode-rules.json`); the migration plan is at the end.

## Summary

- **GlossCode ships controls; users make machine profiles.** The built-in files are arranged like the manuals: control series › control model › machine type (Haas › NGC › mill). Users add a named profile for each real machine ("VF-3SS (cell 1)") with the numbers from their spec sheet, the options it has, and shop limits such as "keep the spindle under 8,000 rpm".
- **Contradictions in the manuals are shown, not hidden.** An entry lists each reading with its page. A machine profile can settle it, by an option (the tool changer type) or by the user's answer, and until then the word is marked and the Problems panel says which reading is in use.
- **Every control level has a Generic choice**, worked out by GlossCode from the entries under it, which shows only what they all share and flags codes that aren't on every control.
- **One file per node, built in layers.** Each file names the files it builds on (`extends`) and only holds what's different. Under the control tree sit the process bases (mill, lathe, router, laser, wire EDM…), and on top sits the user's machine profile.
- **Everything about a machine goes in its file:** the English words, address letters and number format, modal groups, canned cycles and their help text, subprogram calls, machine options (travel, live tooling, Y axis), and which checks are on and how severe they are.
- **The check logic and its wording stay in the app.** "Two codes from one group" works the same on every control; what differs is which codes are in which group. So the rule code and messages are shared, and the tables the rules read come from the machine file.
- **Private or shared is decided by where the file lives.** Built-in files ship with GlossCode, shop files live in a shared folder the shop picks (a network drive), and personal files live in the user's settings folder. GlossCode never uploads anything. Sharing means exporting a file on purpose.
- **Codes can have a decimal part** (`G43.4`, `G05.1`, `A00.0`). The code key keeps the decimal, so `G43.4` and `G43` are different codes, while `G1`, `G01` and `G001` are the same.
- **A GUI editor is worth building**, on top of plain JSON files that stay readable and diffable. It shows each value's layer, writes only to the user's own file, and checks widths and duplicates as you type.

## Layers

```
process base      base.mill                    base.lathe          base.wire-edm   …
                       │
Fanuc-style base  fanuc.mill        control series   haas   (M97 local subprograms and other codes every Haas control shares)
                       │                              │
                       │            control model    haas.ngc     haas.classic     haas.1995
                       │                              │
machine type      haas.ngc.mill  extends ["fanuc.mill", "haas.ngc"]          haas.ngc.lathe …
                       │
machine profile   acme.vf3ss-cell1   (the user's: name, numbers, options, limits; personal or shop folder)
```

A file's `extends` is a list. Files are applied in order, then the file itself goes on top. That lets a control share pieces between its mill and lathe files: `haas.ngc.mill` extends `["fanuc.mill", "haas.ngc"]`, where `haas.ngc` (and `haas` above it) holds M97 local subprograms and the other codes both machine types use.

| Layer | Holds | Examples |
|---|---|---|
| `process` | What every machine of this kind has: address meanings (X, Y, Z, U, W, I, J, K…), the core G and M codes, modal groups, the "process on" codes (spindle, beam, torch, wire), which checks apply | `base.common`, `base.mill`, `base.lathe`, `base.mill-turn`, `base.router`, `base.laser`, `base.plasma`, `base.waterjet`, `base.wire-edm`, `base.sinker-edm` |
| `series`, `control`, `type` | The control's language: its codes, cycles and their words, sub calls, foreign codes, number format, the options it knows about | `haas`, `haas.ngc`, `haas.ngc.mill`, `okuma.p200.lathe`, `fanuc.0i.mill`, `linuxcnc.mill` |
| `machine` | A user's machine profile: its name, numbers and shop limits, options, in-house M-codes, custom macros, check settings | `acme.vf3ss-cell1` |

Built-in files stop at the machine type. See [Controls and machine profiles](#controls-and-machine-profiles).

The process bases for router, laser, plasma, waterjet and EDM are starting points. Their codes vary much more between builders than on mills and lathes, so they ship `verified: false` and get a brand layer as real programs come in.

### Merging

The same rules the rules file uses today:

- Objects merge key by key, so a machine file that sets `codes.M88.long` keeps the inherited `short` and `desc`.
- Arrays replace (a modal group listed in a file is the whole group).
- `null` removes an inherited entry (`"G87": null` on Haas, which uses G77 for back boring).
- The resolved machine is what the editor uses. The GUI editor shows which file each value came from.

### Where files live

| Folder | Who writes it | Shared? |
|---|---|---|
| Built into the program (compiled into the .exe) | GlossCode releases | Built in, read-only |
| Shop folder (set in Settings, can be a network path) | The shop | With everyone who points at that folder |
| `%APPDATA%\GlossCode\machines` (`~/.config/glosscode/machines` on Linux) | The user | No |

The personal folder is the platform's standard user data folder, not a folder beside the program, so it works when GlossCode is installed in `Program Files` and survives updates. See [Packaging](architecture.md#packaging) for the portable mode that keeps everything beside the .exe instead.

Ids are unique across all three. A shop or personal file that uses the same id as a built-in file replaces it, which lets a shop fix a mistake in a built-in table without waiting for a release; the editor marks the machine "modified built-in" so it isn't a surprise. The usual way is to extend, not replace.

### Private and shared

Location is what keeps a file private: nothing in a personal or shop folder leaves the computer or network unless someone exports it. A file can also say `"private": true`. That doesn't change how it loads; it makes **Export** ask before writing it out, and makes Export leave out the `notes` and `shop` sections (asset numbers, cell names, who to call). Export offers two forms:

- **This layer only**: the small file with just the changes. The person receiving it needs the same base files, which are listed in `extends`.
- **Flattened**: every inherited value written into one file with `extends: []`, for someone on a different GlossCode version or with no base files.

Import copies the file into the personal folder and lists any `extends` it can't find.

### Definitions written from manuals

Most built-in tables will be checked against builders' programming manuals. Manuals are copyrighted, and some come with license terms or confidentiality notices, so these rules apply:

- **Manuals never go in the repository.** Keep the PDFs on your own computer or the shop's drive. `manuals/` is in `.gitignore` as a local place for them.
- **Write facts in our own words.** A definition records what a code does, which words it takes and which modal group it's in. Codes and their meanings are facts. Descriptions, cycle help and examples are written fresh and kept short, never copied from the manual. Never copy tables, drawings or examples from a manual.
- **Record the source without quoting it.** `"source": { "manual": "Haas Mill Operator's Manual", "revision": "2024", "section": "G-codes" }` says where to look. `verified: true` means someone checked the file against that source.
- **When in doubt, keep it private.** If a manual's terms forbid sharing what's in it (an NDA, or a "confidential" or "for the licensed user only" notice), or nobody is sure, the definition goes somewhere private rather than in the built-in files:
  - the personal folder or the shop folder, which never leave the computer or the network;
  - or a **separate private git repository** (for example `glosscode-machines-private`) that the shop folder points at, for a team that wants history and review;
  - `machines/private/` in a local checkout of this repository, which is also in `.gitignore`, for trying a definition out before deciding where it goes.

Whether a given definition can be published is a legal question this document can't answer. The defaults above keep the safe choice easy: private unless someone decides otherwise.

## The file

One JSON file per layer. Keys that aren't needed are left out. A full example of each layer is in [`machine-definitions/examples/`](machine-definitions/examples/).

```jsonc
{
  "glosscode": "machine/1",          // format version
  "id": "acme.vf3ss-cell1",          // unique; lowercase, dots and dashes
  "name": "VF-3SS (cell 1)",         // whatever the shop calls it
  "layer": "machine",                // process | series | control | type | machine
  "extends": ["haas.ngc.mill"],     // a machine type from the control tree
  "private": true,
  "verified": true,                  // false = written from general knowledge
  "author": "Acme Machine, programming group",

  "machine": {                       // what the editor and the previews need
    "process": "mill",               // inherited from the process base; shown here for clarity
    "control": "Haas NGC",
    "units": "inch",
    "travel": { "X": 40, "Y": 20, "Z": 25 },
    "spindle": { "max": 12000, "limit": 8000 },   // spec sheet max, and the shop's own limit
    "rapid": 1400, "feed": { "max": 833 }, "tools": 30,
    "eob": false,
    "options": { "toolChanger": "side-mount", "rotary": "A", "tsc": true, "probe": true }
  },

  "addresses": {                     // what each letter means on this machine
    "A": { "role": "axis", "rotary": true, "long": "A", "short": "A" }
  },

  "numbers": { "noDecimal": "leastIncrement", "increment": { "inch": 0.0001, "mm": 0.001 } },

  "codes": {                         // English words for code words (G, M and any other code letter)
    "M51": { "long": "VISEOPEN", "short": "VOPN", "desc": "Open the hydraulic vise (cell 3 wiring)" },
    "M52": { "long": "VISECLS",  "short": "VCLS", "desc": "Close the hydraulic vise" }
  },

  "modalGroups": { },
  "mConflicts": [["M51", "M52"]],
  "cycles": { },                     // words, help text, sketch and options per canned cycle
  "subCalls": { },
  "foreign": { },                    // codes that mean something else on this control

  "checks": {                        // turn rules off or change severity; see "Checks" below
    "rapid-below-zero": "off",
    "missing-decimal": "warning"
  },
  "lineRules": [ ],                  // simple in-house rules; see below

  "notes": "Spindle kept under 8,000 rpm. Vise valves on M51/M52 since the 2025 rewire.",
  "shop": { "asset": "VF3SS-0412", "cell": "1" }
}
```

What each section replaces today:

| Section | Comes from |
|---|---|
| `codes`, `addresses` | `gcode-words.json` `codes`, `address` and `machineOverrides` |
| `numbers`, `modalGroups`, `mConflicts`, `programEnds`, `toolLength`, `toolChange`, `dwellWords`, `subCalls`, `subReturn`, `arcTolerance`, `feedPlausible`, `speedClamp`, `diameterX`, `wordHints`, `wordMeaning`, `foreign`, `referenceOnly`, `keywords` | `gcode-rules.json` `dialects.<control>.<mill or lathe>` |
| `cycles` | `dialects.<control>.<type>.cycles` and `cycleHelp`, joined into one entry per cycle |
| `machine` | the mockup's `MACHINES` profiles |
| `checks` | new (the severity override `checks.md` already promises) |

Because each file is for one process, the `mill` / `lathe` sub-entries in today's dictionary go away: `G50` is scaling-off in `base.mill` and the RPM clamp in `base.lathe`.

### Codes with a decimal part

Many controls have codes with a decimal part, such as `G90.1`/`G91.1` (arc center distance mode), `G54.1 P1` (extra work offsets) and `G41.1`/`G42.1` (LinuxCNC cutter comp with a diameter word). A machine could also write every code with one decimal place (`G00.0`, `A00.0`). The file format and the parser handle all of these. The built-in files only include a decimal code once it has been checked against that control's manual, so anything else is left for users to add in their own machine files.

- A letter's `role` says whether a number after it is a **value** (`axis`, `feed`, `speed`, `offset`, `count`, `time`…) or picks a **code** (`code`). G and M are `code` in `base.common`. A machine where A selects a function rather than a rotary axis sets `"A": { "role": "code" }`, and its `codes` table gets `A00.0`-style entries.
- **Code keys** are the letter, the whole number padded to two digits, and the decimal part if it isn't zero: `G01`, `G43.4`, `A12.5`. When reading a program, `G1`, `G01`, `G001`, `G1.` and `G01.0` all find `G01`; `G43.4` only finds `G43.4`. An unknown `G43.4` is never shown as `G43`; it gets `unknown-word`.
- A control where `.0` is a different code from no decimal (rare) sets `"exactDecimal": true` on that letter, and then `G01` and `G01.0` are separate keys.
- `write` says how GlossCode writes codes it inserts (autocomplete, Insert menu, Renumber). `"G": { "role": "code", "write": "00.0" }` makes autocomplete insert `G00.0`. Words already in the program keep the form they were typed in.
- For value letters, `numbers` keeps working the way it does today (a distance with no decimal point reads as the smallest increment on Fanuc-style controls).
- A decimal code goes in `modalGroups` like any other code, so `G90.1` and `G91.1` form their own group, and `G59.1` can join the work offset group.
- A code that takes a selector word (`G54.1 P3`, Haas `G154 P12`) lists the word in `wordHints` as `requires`, the same way `G43` lists `H`.

Candidates for the built-in files, from a reference table. None of these have been checked against a manual yet, so they stay out of the built-in files until they are:

| Control | Decimal codes |
|---|---|
| Fanuc (0i, 30i/31i/32i) | G90.1 / G91.1 (arc IJK distance), G54.1 P1–P48 (extended work offsets, option) |
| Haas NGC | G90.1 / G91.1. Extended offsets use G154 P1–P99, not G54.1 |
| Hurco WinMax | G51.1 (mirroring), G54.1 (auxiliary work offsets), G94.1 (rotary tangential velocity) |
| LinuxCNC | G90.1 / G91.1, G41.1 / G42.1 (cutter comp with a D diameter word), G59.1 / G59.2 / G59.3 |
| Mach3 / Mach4 | G90.1 / G91.1, G59.1 / G59.2 / G59.3; Mach4 also G54.1 P1–P248 |
| Centroid | G90.1 / G91.1 (varies by CNC12 version). Extended fixtures are G54 P1–P12, with no decimal |
| GRBL | G91.1 only (incremental arc IJK is the default; G90.1 isn't implemented) |

Word-style codes like Okuma `CALL`, `RTS` and `GOTO` stay in `keywords`, with their English in `codes`.

### Canned cycles

Each cycle is one entry that holds everything the checks, word hints, Insert menu and F1 guide need, so they can't disagree:

```jsonc
"cycles": {
  "G83": {
    "name": "Peck drill",
    "category": "drilling",           // Insert menu group
    "requires": ["Z", "R"],
    "choices": [["Q"], ["I", "J", "K"]],
    "optional": ["X", "Y", "F", "L", "P"],
    "feed": true, "spindle": true,
    "needs": [],                       // machine options, e.g. ["liveTooling"]; hidden when missing
    "sketch": "peck",
    "about": "Peck drilling. Each peck retracts to R to clear chips.",
    "words": {
      "Q": ["0.1", "Depth of each peck.", "PECK"],
      "I": ["0.2", "First peck depth (use I, J and K instead of Q).", "PECK1"]
    }
  }
}
```

A machine can add a cycle (a builder's own G-code), remove one with `null`, or change one word: a file with only `"G83": { "words": { "Q": ["0.05", "Peck depth in mm", "PECK"] } }` keeps the rest. Machine options that hide cycles and words (`liveTooling`, `yAxis` today) are declared in `machine.options`, and a cycle's `needs` lists the options it requires.

Help text is plain English and is the same in every layer unless a layer overrides it. Translations, later, would be separate files keyed by cycle and word, not more fields here.

### Column order

The **Columns by word type** layout reads its columns from `columns`, in order from left to right. The built-in order puts the most used words first: the G column (motion, canned cycles, cycle cancel and spindle speed mode G96/G97, which rarely share a line with a motion code), X, Y, Z, the arc and cycle words, F, S, the spindle M-codes, the tool, coolant, then other G-codes, other M-codes, rare words and the comment. A word goes in the first column that matches it, so a code listed in an earlier column (M03 under Spindle) never reaches a later catch-all (M).

```jsonc
"columns": [
  { "id": "MOT",  "label": "G",       "groups": ["motion", "canned cycle"], "cycles": true, "codes": ["G96", "G97"],
    "carry": "motion", "aligns": true, "alignsExcept": ["G80"] },
  { "id": "X",    "label": "X",       "letters": ["X", "U"], "carry": "position", "aligns": true },
  { "id": "SPIN", "label": "Spindle", "codes": ["M03", "M04", "M05"], "carry": "spindle", "aligns": true },
  { "id": "G",    "label": "Other G", "letters": ["G"] },
  { "id": "OTHER","label": "Other",   "other": true },
  { "id": "NOTE", "label": "Comment", "comments": true }
],
"programOrderCodes": ["M00", "M01", "M02", "M30", "M06", "M97", "M98", "M99", "G65", "G04", "G10", "G28", "G30", "G53", "G92"]
```

- `letters`: any word starting with these letters. `codes`: these exact codes. `groups`: every code in these modal groups. `cycles`: every canned cycle the machine has. `about`: the column heading's tooltip.
- `carry`: what an empty cell shows in grey when a modal value is still in effect from an earlier line: `motion` (the motion code or active cycle), `position` (where the axis was last sent), `cycle` (R and Q kept by an active canned cycle), `value` (the last F or S), `spindle`, `coolant` and `tool`. Columns with no `carry` stay empty. A carried value stays on one line and is cut short with … if it doesn't fit.
- `aligns`: a line is laid out in columns only when it has a word from one of these columns (motion, axes, arc and cycle words, F, S, spindle). Codes in `alignsExcept` don't count, so the safety line `G80 G20 G90 G17 G40 G49` isn't pulled into the grid by its G80.
- `programOrderCodes`: a line with any of these codes, or with an Okuma keyword (`CALL`, `RTS`, `GOTO`…), is shown in program order even if it has axis words. These are lines that don't make a cutting or positioning move: program stop (M00), optional stop (M01), program end (M02, M30), tool change (M06), subprogram and macro calls and returns (M97, M98, M99, G65), dwell (G04, where X or P is a time), data setting (G10), reference return (G28, G30), machine coordinate moves (G53) and coordinate system setting (G92 on mills, G50 on lathes). Lathes leave out G92, which is a threading cycle there.
- Lines in program order, and lines with no words at all for the aligned columns (the program number, the safety line, a tool preselect, a comment), don't split into columns: their words fill cells from the left in the order they're written.
- Several words in one cell stack one above the other, so a column is only as wide as its widest single word and a line with a stacked cell gets taller.
- Like other arrays, a layer that sets `columns` or `programOrderCodes` replaces the whole list. Only columns used by lines laid out in columns are shown, so extra columns cost nothing.

## Controls and machine profiles

Programming manuals are written for a control, not a machine. The Haas NGC mill manual covers every NGC mill, and none of the Haas manuals reviewed so far gives specs for a particular model (see [haas-ngc.md](manual-reviews/haas-ngc.md)). Spec sheets are hard to get, change between model years, and don't say how a shop actually runs its machines: a shop may own a VF-3SS rated for 12,000 rpm but keep it under 8,000 to make the spindle last.

So the work is split in two:

- **GlossCode ships the controls**, checked against their manuals: the codes, cycles, checks and the options each control knows about.
- **Users make machine profiles** for the machines they have. A profile is a name, a control, and the numbers and options from the user's own spec sheet and shop practice. GlossCode doesn't ship machine models.

### The control tree

```
Control series     Haas                                   Okuma                   Fanuc
                    │                                      │                       │
Control model      Haas NGC     Haas classic   Haas 1995   OSP-P200L   OSP7000L    0i-MF   0i-TF …
                    │
Machine type       NGC mill     NGC lathe

Every level also has   Generic   (only what all the entries under it share)
```

- **Control series** is the builder of the control: Haas, Okuma, Fanuc, Siemens, Mazak, LinuxCNC.
- **Control model** is one generation of that control, written from one set of manuals: Haas NGC, Haas classic, the 1995 Haas control, Okuma OSP-P200L. Manual editions that agree go in one control model. Where an edition changed something, the entry says which (see [Contradictions in the manuals](#contradictions-in-the-manuals)), so Haas NGC doesn't split into "NGC 2020" and "NGC 2025".
- **Machine type** is mill, lathe, mill-turn and so on, because the same control speaks a different language on each (G50 is the spindle limit on a Haas lathe and scaling off on a Haas mill). A control that only exists for one type, like the OSP-P200L lathe control, has one entry here.

### Generic

Each level has a **Generic** entry: "Haas NGC mill", "Haas NGC, any type", "Haas, any control". It's for a program that has to run on more than one control, or when you don't know the exact control yet.

Generic is worked out by GlossCode from the entries under it, never written by hand, so it can't fall out of step:

- A code that every entry has, with the same meaning, is in Generic and reads normally.
- A code that every entry has but with different meanings (G50 across mill and lathe) is shown as **varies by machine**. Hovering over it lists each meaning, and the check `varies-by-machine` gives an info.
- A code that only some entries have isn't in Generic's autocomplete or Insert menu. If a program uses it, the check `not-on-every-machine` names the entries that lack it. This turns Generic into a portability check.

The higher the level, the smaller Generic gets. "Haas NGC, any type" is little more than the shared Fanuc-style core plus Haas subprogram calls. The picker shows how many codes each Generic has so that's not a surprise.

### Machine profiles

A machine profile is what the user picks when they open or start a program. It's a small file in the personal or shop folder:

```jsonc
{ "glosscode": "machine/1", "id": "acme.vf3ss-cell1", "layer": "machine",
  "name": "VF-3SS (cell 1)",
  "extends": ["haas.ngc.mill"],
  "machine": {
    "travel": { "X": 40, "Y": 20, "Z": 25 },
    "spindle": { "max": 12000, "limit": 8000 },       // limit: what this shop runs it at
    "rapid": 1400, "feed": { "max": 833 },
    "tools": 30,
    "options": { "toolChanger": "side-mount", "gearbox": false, "probe": true, "macros": true }
  },
  "notes": "Spindle kept under 8,000 rpm to make it last. Numbers from the 2019 spec sheet in the office." }
```

- **Name** is whatever the shop calls the machine: "VF-3SS (cell 1)", "Big Haas", "Okuma lathe by the door".
- **Control** is one entry from the control tree, or a Generic.
- **Limits** have two numbers where it helps: the machine's **max** from the spec sheet, and an optional shop **limit**. A program above the limit gets a warning ("S9000 is above this machine's 8,000 rpm shop limit"); above the max it's an error. Leave the limit empty and only the max is checked. Spindle speed, cutting feed and travel all work this way; rapids only have a max.
- **Options** are checkboxes for the things the control's manual says depend on the machine. Each control lists the options it knows about, with a one-line hint on where to find it ("Side-mount tool changer: the tool arm swings tools in from the side of the column").
- **Notes** are free text for the source of the numbers and the shop's reasons.
- Everything is optional. A profile with only a name and a control works, and the checks that need a missing number skip it.

Shops share profiles through the shop folder, so the VF-3SS in cell 1 is set up once and everyone gets the same 8,000 rpm limit. A user who wants to try something can **Make my own copy** in the personal folder.

### What the options change

The Haas manuals describe these in general terms ("if your machine has a gearbox", "side-mount changer only", "varies by model"). The control file turns each into an option, and the profile says whether this machine has it:

| Option or number | Changes in GlossCode | Manual reference |
|---|---|---|
| Max spindle speed and shop limit | S check, speed clamp hints | Spec sheet and shop practice |
| Rapid and cutting feed | Feed plausibility, cycle time estimate | Mill 2025 p. 474 says these vary by model |
| Travel | A future out-of-travel check, the Z timeline scale | Spec sheet |
| Gearbox | M41/M42 valid, or flagged as having no effect | Mill 2025 pp. 203, 437; VF 1995 p. 91 |
| Tool changer (umbrella or side-mount) and tool count | Tool pre-call ("T next after M06") hint, M39, heavy-tool flags, broken tool detection, the T range | Mill 2025 pp. 162–170, 437, 444, 524 |
| Machine-specific codes | G143 (VR models), tailstock settings (ST-20, 30 and 40), G199 (dual spindle) | Mill 2025 p. 397; lathe 2020 pp. 142–147, 227 |
| Purchased options (through-spindle coolant, high-speed machining, macros, rotation and scaling, probing) | Codes that need the option are hidden or flagged when it's off | Mill 2025 pp. 242, 353, 438 |

A code or cycle that depends on an option lists it in `needs`, the way lathe cycles already list `liveTooling`. It shows up in autocomplete and the Insert menu when everything in its `needs` is on:

```jsonc
// haas.ngc.mill (machine type)
"options": {
  "gearbox":     { "label": "Gearbox", "hint": "Two-speed spindle; M41/M42 pick the range", "default": false },
  "toolChanger": { "label": "Tool changer", "choices": ["umbrella", "side-mount"], "default": "side-mount" },
  "vr":          { "label": "VR five-axis head", "default": false }
},
"codes": {
  "M41":  { "long": "GEARLOW",  "short": "GLOW", "desc": "Low gear",  "needs": ["gearbox"] },
  "M42":  { "long": "GEARHIGH", "short": "GHI",  "desc": "High gear", "needs": ["gearbox"] },
  "G143": { "long": "TLEN5AX",  "short": "TL5X", "desc": "Five-axis tool length offset", "needs": ["vr"] }
}
```

(M41, M42 and G143 aren't in the dictionary yet; this shows the shape.) In a program, a code whose `needs` aren't met still reads as English, so old programs make sense, and a new `needs-option` check says why: "This machine has no gearbox, so M41 has no effect." On a Generic or a profile that leaves an option unset, codes that need it are allowed and get no check.

### Contradictions in the manuals

Manuals don't always agree, between editions or even between two pages of one edition. The ones found so far:

| Code | What disagrees | Likely depends on |
|---|---|---|
| M39 (Haas mill) | 2020 manual (p. 417): turns the side-mount changer. 2025 (p. 444): turns the umbrella changer | The machine's tool changer |
| G114–G129 (Haas lathe) | 2020 p. 361 and 2025 p. 396: G154 P3–P18. 2020 p. 362 and 2025 p. 397: P5–P20 (G110–G129 = P1–P20) | Probably a manual error, but only the control can say |
| G74 I (Haas lathe) | 2020: peck increment as a radius. 2025 (p. 365): as a diameter | The control's software version |
| G268/G269 (Haas mill) | 2025: group 14. 2020: group 02 | Unknown |

GlossCode doesn't pick a side quietly. An entry with a contradiction lists each **reading**, where it comes from, and what decides between them:

```jsonc
"M39": { "long": "TCROTATE", "short": "TCROT",
  "readings": {
    "side-mount": { "desc": "Rotate the side-mount tool carousel",
                    "source": { "manual": "Haas Mill 96-8210", "revision": "N (2020)", "page": 417 } },
    "umbrella":   { "desc": "Rotate the umbrella tool carousel",
                    "source": { "manual": "Haas Mill 96-8210", "revision": "V (2025)", "page": 444 } } },
  "decidedBy": "toolChanger" },       // an option in the profile settles it

"G114": { "long": "WORK11", "short": "W11",
  "readings": {
    "p5": { "desc": "Work offset 11 (G154 P5)", "source": { "revision": "V (2025)", "page": 397 } },
    "p3": { "desc": "Work offset 11 (G154 P3)", "source": { "revision": "V (2025)", "page": 396 } } },
  "default": "p5",                     // used until the profile settles it
  "group": "g110-g129-mapping" }       // one answer settles G110 to G129 together
```

How it reaches the user:

1. **Settled by the profile without asking.** When `decidedBy` names an option and the profile has it set (side-mount tool changer), GlossCode uses that reading and says nothing. This covers contradictions that are really about the machine.
2. **A mark on the word.** When nothing settles it, the word gets a small dotted underline in the editor. Hovering shows both readings with their manual pages, which one GlossCode is using, and a **Settle for this machine…** button.
3. **One note per program in the Problems panel.** The check `unsettled-meaning` gives an info once per code, not on every line: "M39: the 2020 and 2025 Haas manuals disagree on which tool changer it turns. Using: side-mount." It's a warning when the reading changes what the program does (which work offset G114 picks), and info when it only changes the English.
4. **A list in the machine profile.** The profile window has a **Manual conflicts** section with every open contradiction for its control. Each one shows the readings, how to check it on the machine ("Set G114 and look at which offset is active on the Work Offsets page"), and a choice. The answer is saved in the profile:

   ```jsonc
   "settled": { "g110-g129-mapping": "p5", "G74.I": "diameter" }
   ```

A profile in the shop folder settles a contradiction once for everyone who uses that machine. Generic and unset profiles keep the default and the note. When a later manual or a check on a real machine settles a contradiction for good, the built-in entry drops `readings`, and settled answers that no longer apply are ignored.

### The files

| Level | Holds | Examples |
|---|---|---|
| `series` | What every control from this builder shares | `haas`, `okuma`, `fanuc` |
| `control` | One control generation's language for all machine types | `haas.ngc`, `haas.classic`, `haas.1995`, `okuma.p200` |
| `type` | That control on one machine type: the codes, cycles, checks and the options it knows | `haas.ngc.mill`, `haas.ngc.lathe`, `okuma.p200.lathe` |
| `machine` | A user's machine profile: name, control, numbers, options, in-house codes and checks | `acme.vf3ss-cell1` |

Built-in files stop at `type`. Everything from `machine` down is the user's.

### Setting up a machine in GlossCode

**New machine profile…** (from the machine chip, File › New, or the home page) is one window:

1. **Name** the machine.
2. **Control**: the tree as columns (series, control, type) with Generic at the top of each, and a search box ("ngc mill", "p200").
3. **Spindle, feed, travel and tools**: each with max and optional shop limit, and a "from the spec sheet" hint.
4. **Options**: the control's checkboxes, at their defaults.
5. **Notes.**

A program can name its profile in a comment near the top, `(MACHINE: VF-3SS (cell 1))`, and GlossCode picks that profile when the file is opened. Otherwise the file's recent machine or the extension default is used, as today.

Only the name and control are required, so a new user is writing programs in seconds and can fill in numbers later. **Copy profile** starts a second machine from an existing one (a second VF-3SS, or the same machine with a different limit for a job). The machine menu shows the profile name and control: "VF-3SS (cell 1) · Haas NGC mill".

## Checks: how much is machine-specific

There are 31 checks today. None of their logic needs to change per machine, and almost all of the data they read does.

| | Machine-specific? | Where it lives |
|---|---|---|
| The logic of each check (how to find a modal clash, an arc that doesn't close) | No | The core (`checks.c`; `checkProgram()` in the mockup) |
| Title, message and explanation | No | `data/checks.json` in the app (renamed from the `rules` half of `gcode-rules.json`) |
| On/off and severity | Yes | `checks` in the definition file |
| The tables the checks read | Yes | The definition file |

How the 31 break down:

- **9 are fully generic** and only use severity: `empty-value`, `arc-r-and-ijk`, `arc-no-center`, `arc-full-circle-r`, `comp-start-on-arc`, `cycle-left-on`, `comp-left-on`, `feed-mode-changed`, `no-feed-rate`.
- **19 read a table from the definition file**: modal groups (`modal-group-clash`), M conflicts, foreign codes, cycles (three checks), sub calls (`missing-label`), program ends, tool length codes (two checks), dwell words, number format (`missing-decimal`), the dictionary itself (`unknown-word`), arc tolerance, feed plausibility, the speed clamp code (`css-no-clamp`), which letters can repeat in a block (`dup-address`), `comp-no-d`, `g28-absolute`.
- **3 only make sense for some processes**: `spindle-off-feed`, `no-speed`, `rapid-below-zero`.

Two changes come out of this:

1. **"Spindle" becomes "process".** A laser has a beam, a plasma cutter a torch, a waterjet a pump and abrasive valve, a wire EDM machining power. Each process base declares `process: { "on": [...], "off": [...], "label": "beam" }`, and `spindle-off-feed` becomes "cutting with the beam off" on a laser without a separate rule. Process bases turn off what doesn't apply (`tlo-missing` on a laser, `css-no-clamp` on a mill).
2. **A small set of declarative rules for shops**, so in-house conventions don't need code. Each `lineRules` entry is a condition and a message, no scripting:

   ```jsonc
   "lineRules": [
     { "id": "acme.vise-before-start", "when": { "code": "M03" }, "requiresEarlier": ["M52"],
       "severity": "warning", "message": "Close the vise (M52) before starting the spindle." },
     { "id": "acme.t-with-m06", "when": { "code": "M06" }, "requiresOnLine": ["T"],
       "severity": "error", "message": "M06 needs a T word on the same line in this shop." }
   ]
   ```

   The forms to start with: `requiresOnLine`, `forbidsOnLine`, `requiresEarlier` (anywhere before in execution order) and `requiresActive` (a modal code that must be on). Anything more complex becomes a built-in check.

## A GUI editor

Yes, it would help. Most people adding a machine are changing a handful of M-codes and a cycle or two, and a form is easier than getting JSON brackets right. It grows out of the existing **Machine profiles** window:

- **General**: name, process, control, the layer it extends, travel and limits, options (live tooling, Y axis, rotary axes), end of block, private.
- **Words**: a searchable table of every code and address letter with long word, short word, description and the layer it came from. Edited cells are bold; **Reset** goes back to the inherited value. An **Only changed here** filter shows the file's own entries.
- **Cycles**: the list by category; each opens the same layout as the Insert dialog, with required, choice and optional words, help text and example values, and a live preview of the F1 guide.
- **Checks**: every rule with Off / Info / Warning / Error, the inherited setting next to it, and the `lineRules` builder.
- **Try it**: the current program re-checked and re-translated with the unsaved changes, so the effect is visible before saving.

The editor checks as you type: long words over 10 columns and short words over 8, two codes with the same English word (autocomplete needs them unique), malformed code keys, a cycle word listed as both required and optional, and `extends` that can't be found.

Two limits keep it safe. It only writes to personal or shop files, so editing a built-in machine starts with **Make my own copy** (a new file that extends it). And it writes the JSON with one entry per line in a stable key order, so a shop that keeps its machine files in git gets small, readable diffs.

## Migration

1. Add the loader with merge and `extends` in the core, and a converter script that splits today's two files into `machines/base.*`, `machines/fanuc.*`, `machines/haas.*` and `machines/okuma.*`. Check that the resolved Haas, Fanuc and Okuma mill and lathe definitions match today's tables exactly.
2. Move check titles and messages to `data/checks.json`, and point the mockup at the resolved definitions instead of `DICT` and `RULES` (the sync script embeds the resolved machines).
3. Add the `machine` section in place of the mockup's `MACHINES` list, and the shop and personal folders. Today's sample profiles (Haas VF-2, Okuma M560-V…) become example machine profiles that extend a machine type, and **New machine profile…** gets the control tree, Generic entries, limits and option checkboxes.
4. Add `checks`, `lineRules` and the `process` table.
5. The GUI editor.
6. Thin `verified: false` bases for router, laser, plasma, waterjet and EDM, then brand layers as real programs arrive.

Until step 1 lands, keep editing `data/gcode-words.json` and `data/gcode-rules.json` as today.
