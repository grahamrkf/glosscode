# Okuma OSP-P200L Programming Manual (lathe)

| | |
|---|---|
| Manual | Okuma OSP-P200L Programming Manual, Pub No. 5238-E-R2 (LE33-013-R3), 3rd edition, Aug. 2007 |
| Copy reviewed | A text extract from manualslib.com (about 350 pages, no figures, tables partly scrambled) |
| Control | OSP-P200L lathe |
| Reviewed | 2026-11-01, against the `okuma` dialect's lathe tables in `data/gcode-rules.json` and `okuma.lathe` in `data/gcode-words.json` |
| Result | Several lathe codes were wrong. The lathe tables are now checked; the `okuma` dialect stays `verified: false` because the mill side and P300 differences aren't checked yet |

No confidentiality notice was found in the extract. The manual still stays out of the repository; this file records what it says in our own words, with the manual's printed page numbers (`5238-E P-n`).

## Which parts matter

| Pages | Section | Use for GlossCode |
|---|---|---|
| 1–5 | Program types, program and sequence names, word format, address ranges | **High** |
| 20–23 | Inch system, decimal point position, G90/G91, diameter X | **High** (but the decimal table is scrambled in the extract; see below) |
| 24–39 | G00–G03, chamfer and round (G75/G76), torque limit and skip (G22, G28, G29) | **High** |
| 40–44 | Dwell, G50 zero shift and max RPM, droop control, G94/G95, G96/G97 | **High** |
| 45–55 | S, T and M functions, M-tool spindle | **High** |
| 56–95 | Nose radius and cutter radius compensation | Medium |
| 96–131 | Thread cycles (G31–G35, G71, G72), grooving (G73, G74), tapping (G77, G78) | **High** |
| 132–166 | M-tool compound cycles (G181–G190) | Medium: live tooling, later |
| 167–234 | LAP (G80–G88) | Medium: needs contour support first |
| 235–264 | Contour generation, coordinate conversion, 2-turret programming | Low |
| 265–314 | User Task (GOTO, IF, CALL, RTS, variables) | **High** for CALL/RTS (pp. 287–289); the rest later |
| 315–320 | Schedule programs | Low |
| 331–339 | G-code and M-code tables | **High** |
| 345 onward | System variables | Low |
| Safety pages, 321–330 | Other functions | None |

## What was wrong and is now fixed

- **G20 and G21 aren't inch and metric** (p. 331). G20 is home position return and G21 is ATC home. Units come from a parameter (p. 20). The `units` modal group is removed for Okuma lathes, and a new dialect key `unitCodes: null` stops the editor treating G20/G21 as unit changes.
- **G28 is torque limit cancel** and G29 sets it (pp. 36, 331). The old warning said Okuma returns home with G30; on the P200L G30 is a skip cycle. The warning now says G20 is the return home.
- **G33 is a thread-cutting cycle**, not a single thread pass (p. 97). G31 is the same cycle, G32 is the face version (p. 99), and G34/G35 are variable-lead versions (p. 102). All five are now in the motion group, with F read as the lead, not a feed (new dialect key `leadCodes`).
- **G54–G59 aren't in the P200L lathe's G-code table** (p. 332). They're a mill work-offset feature; a lathe sets its work zero with the zero offset or G50. They're flagged as info, not an error, since a live-tool or Y-axis lathe might differ (not checked).
- **M88/M89 are the air blower** (p. 339), not coolant. They have English words now and conflict with each other.
- **G71 and G72 are compound thread cycles** (pp. 109–111), and **G73/G74 are grooving cycles** (pp. 126–129). They were reference-only before; now they're checked, with their words, hints and help text.
- **G77/G78 are tapping cycles** that start the spindle themselves and leave it stopped (pp. 130–131).
- **G04 takes F** for the dwell (p. 40). That was already right. The feed-rate checks now skip that F.
- English words for G20–G22, G28/G29, G31–G35, G64/G65, G73–G78, the LAP codes, M12–M14, M22/M23, M83/M84 and M88/M89.

## What matches

- G90/G91 for absolute and incremental, with X as a diameter (pp. 22–23).
- G94 feed per minute and G95 feed per revolution, with G95 the default (p. 43).
- G96/G97, and G50 S as the RPM clamp (pp. 42, 44).
- Subprograms: `CALL O____` with an optional Q repeat count and named variables; the subprogram ends with RTS (pp. 287–288). GOTO and IF branch to a sequence name in the same program (pp. 270–271).
- Program files: .MIN main programs, .SUB user subprograms, .SSB system subprograms, .SDF schedule programs (p. 1).

## Not settled or not added

- **No-decimal numbers.** Pp. 20–21 say what a whole number means depends on the unit-system parameter (1 µm, 10 µm or 1 mm; 1/10000 in or 1 in). The table in the extract is scrambled, so it isn't clear which reading is the usual one. The `missing-decimal` behavior is left as it was; check pp. 20–21 in the PDF.
- **Units.** Since G20/G21 don't set units, the editor needs the units from the machine profile. Profiles don't have a units setting yet, so Okuma lathe programs are treated as inch.
- **Names.** Sequence and program names can be up to four letters or digits, and `N0123` and `N123` are different names (pp. 2–3). The editor still treats N and O labels as numbers.
- **U and W** are LAP allowances on Okuma, not incremental moves (p. 5). The English still reads them as incremental.
- **Two-letter words** like DA, SB, QA and SA (pp. 5, 45, 126) aren't parsed yet.
- G181–G190 M-tool cycles, LAP checking, contour generation, the 2-turret P codes, User Task variables and schedule programs.
- The G-code modal group table on p. 40 is a figure that didn't survive the extract.

## Later check (2026-11-01): more manuals

A second pass compared these tables with more Okuma and Haas manuals (see [haas-ngc.md](haas-ngc.md) for the Haas side):

- **M codes per line.** P200L allows eight M codes in one block (p. 45). The `okuma` lathe tables now have `mPerBlock: 8`.
- **G77/G78** were rechecked on p. 130: the cycle turns the spindle on at the speed already set, and won't feed if no speed was set. That matches `startsSpindle` plus `speed`, so they stay as they are.
- **Work offsets.** Neither the P200L nor the older OSP7000L has G54–G59, even with live tooling or a Y axis. Work zero comes from the stored zero offset plus a one-block G50 shift. Haas lathes do have G54–G59, so this is decided by dialect, not by mill or lathe.
- **OSP7000L** (Pub 3812-E, 1st edition 1994, scanned): the same core as the P200L, but it lacks G21, G24/G25, G124–G129, G144–G149, G153–G171, G191 and G205–G214, and documents only User Task 1. It allows more than one M code per block without giving a number. If someone programs an OSP7000L, it needs its own dialect that removes those codes.
- **Not added yet:** checking of the live-tool cycles G181–G190 and G178/G179 (they have English words since the [OSP7000L/U10L review](okuma-osp7000l-u10l.md)) (modal, cancelled by G180 on its own line, G181–G184/G189/G190 only in G94 and G185–G188 only in G95), G138 Y axis, G128/G129 M/C mode, and M146/M147 (the manual contradicts itself on which is clamp; the OSP7000L and U10L tables both say M146 is unclamp, so that's what GlossCode uses now).
