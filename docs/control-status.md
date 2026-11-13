# What's incomplete or uncertain, per control

Last updated 2026-11-13. This lists, for each control, what GlossCode doesn't handle yet (**Incomplete**) and what it handles but isn't sure of (**Uncertain**). How sure we are of each control overall is in [control-confidence.md](manual-reviews/control-confidence.md); the details and page numbers are in each control's [manual review](manual-reviews/README.md).

**Can you help?** Each control has an open issue where you can add what your manual says or what your machine did; they're linked below and gathered in [#114](https://github.com/grahamrkf/glosscode/issues/114). Please post only short excerpts, never whole shop programs.

Whatever this list says, run every program through the machine's own graphics and a dry run before cutting. GlossCode is new and largely untested.

## Waiting for a manual

These need the manuals, which aren't reachable right now. They're set aside until they are.

| Control | What's waiting |
| --- | --- |
| Haas NGC lathe ([#88](https://github.com/grahamrkf/glosscode/issues/88)) | G47 engraving with a live tool isn't drawn in the simulation, and its words read with their generic meanings (J as an arc center). Needs the manual's pages on which faces it engraves (2025 manual pp. 333, 343) and a decision on how to show text on the face, which the X–Z view can't show. |
| Tormach PathPilot mill ([#99](https://github.com/grahamrkf/glosscode/issues/99)) | G47 engraving isn't drawn, and its words aren't checked. Needs the 1500MX manual (9.2.16) for which of P and Q is the text height and where the text comes from. |
| Okuma OSP500L-G / 5000L-G lathe ([#92](https://github.com/grahamrkf/glosscode/issues/92)) | No code table. The manual is a 1987 scan with slashed zeros that OCR can't read reliably. |
| Okuma OSP-E100L lathe ([#91](https://github.com/grahamrkf/glosscode/issues/91)) | Reviewed from the text layer only; its code tables haven't been checked against page images. M157 means something different on the E100L and the OSP500L-G. |
| Brother TC-32B, GSK 218M ([#108](https://github.com/grahamrkf/glosscode/issues/108)) | No control files. Notes from their manuals (Brother G18 = YZ and G19 = ZX as printed, GSK M03 = counterclockwise as printed) are unverified OCR readings. |
| All controls marked unverified ([#111](https://github.com/grahamrkf/glosscode/issues/111)) | Code tables to check against page images, a few pages at a time (see the list below). |

## Haas

**Haas NGC mill** ([#87](https://github.com/grahamrkf/glosscode/issues/87))
- Uncertain: G47 engraving draws each line of text as one box, an estimated 1.0 × J per character long (letter widths aren't published). Curved text isn't drawn.
- Uncertain: bolt patterns G70–G72 end back at the pattern's centre (#72); whether the real control moves back there between patterns isn't confirmed.
- Uncertain: G12/G13 circular pockets and G107 cylindrical mapping (G107 Q0 takes the diameter from Setting 34; the simulation leaves it flat).
- Uncertain: how deep M97/M98 calls can nest isn't in the manual; G65 is 9 levels. The simulation follows 8 and notes it.

**Haas NGC lathe** ([#88](https://github.com/grahamrkf/glosscode/issues/88))
- Incomplete: G47 engraving (above).
- Uncertain: G114–G129 contradict each other in the manual (G154 P3–P18 on one page, P1–P20 on the next). GlossCode follows P1–P20, so G116 reads `work.p7`.
- Uncertain: G74 I and G105 Q readings.

**Haas classic (2008–2016) and Haas 1995 VF** ([#89](https://github.com/grahamrkf/glosscode/issues/89)): no known gaps beyond the NGC ones above.

## Okuma

**OSP-U10L / U100L lathe** ([#90](https://github.com/grahamrkf/glosscode/issues/90)) (Graham's): highest confidence. It still uses the P200L tables apart from the differences the review found.
- Uncertain: metric programs time rapids as inches, since Okuma has no units code the simulation can read.
- Uncertain: how deep CALL can nest isn't in the manual; the simulation follows 8 and notes it.

**OSP-E100L lathe** ([#91](https://github.com/grahamrkf/glosscode/issues/91)): see "Waiting for a manual".

**OSP700L / 7000L lathe** ([#94](https://github.com/grahamrkf/glosscode/issues/94)): M98/M99 are tailstock thrust here, not calls.

**OSP-P200L lathe and P300M mill** ([#93](https://github.com/grahamrkf/glosscode/issues/93))
- Incomplete: "=" expressions (X=VC1+VC2), hex numbers, "&" line continuation, letter O and N names, about 600 option M codes, the mnemonics (COPY, NCYL, BHC, GRDX and others), and the live-tool cycles G181–G190 and G178/G179 aren't checked.
- Uncertain: part of the P200L number/decimal table was scrambled in the text extract. Modal dwell (G04 with no F or P) is still flagged.

## Fanuc family

**Fanuc 0i-F mill** ([#95](https://github.com/grahamrkf/glosscode/issues/95)) (the base most controls inherit)
- Uncertain: the peck retract amounts for G73/G83 are parameters; the simulation assumes 0.01 in / 0.039 in.
- Uncertain: Custom Macro B rules come from the 21i manual, since the 0i-F common volume is missing.

**Fanuc lathe (system A) and systems B and C** ([#96](https://github.com/grahamrkf/glosscode/issues/96)): marked unverified. Systems B and C were renumbered from the system table, not reviewed in full.

**Fanuc Series 0 / 0-Mate mill** ([#96](https://github.com/grahamrkf/glosscode/issues/96)): marked unverified; older manual with the differences noted.

## Other ISO controls

**Centroid CNC12** ([#97](https://github.com/grahamrkf/glosscode/issues/97))
- Incomplete: ";" and ":" comments (parentheses group expressions here), "/" after an M code as an argument separator, E1–E18 work offsets, M98 "file" calls and the O9xxx-first rule, G65 arguments and INPUT/DEFINE, L as the move rate on G28/G30/G53.
- Uncertain: implied decimals on lathe cycle D, P and Q; the 20-level call depth.

**LinuxCNC 2.9** ([#98](https://github.com/grahamrkf/glosscode/issues/98))
- Incomplete: ";" comments, O-word subroutines and flow control, named parameters, the @ ^ $ words, decimal G codes, U V W as separate axes, the fixed order of execution within a line, long dwells.

**Tormach PathPilot** ([#99](https://github.com/grahamrkf/glosscode/issues/99)) (inherits LinuxCNC)
- Incomplete: U V W are A B C here; G76 I J K signs on a front-post or gang setup; line and N/O limits; G54.1 P, G37.1 and the decimal codes; G47 (see "Waiting for a manual"); plasma torch codes (M200–M213 aren't told apart, so torch checks are off).

**Hurco WinMax NC** ([#100](https://github.com/grahamrkf/glosscode/issues/100))
- Incomplete: the 1–6 repeat range, modal dwell, M98 P with a packed repeat count, user G and M codes, the absolute first Z after a tool change, decimal codes, and on the lathe the drilling cycles, G72 first-block U, G92 threading and G07/G08.
- Uncertain: group defaults shaded in the manual's table; dwell units on the lathe.

**Mazak EIA/ISO** ([#101](https://github.com/grahamrkf/glosscode/issues/101)): marked unverified.
- Incomplete: type II numbers (whole units without a decimal point), dwell revolutions in G95, M98 H and L, ",C" ",R" and macro G codes, lathe systems B and C as settings, mill-turn.

**Mitsubishi M800/M80 and M700/M70 (M2/M0 format)** ([#102](https://github.com/grahamrkf/glosscode/issues/102)): marked unverified.
- Incomplete: type II numbers, dwell in G95 and its parameters, comma words on cycles (,I ,J ,R ,S), M98 H L and file calls, user fixed cycles and macro G codes, decimal codes, builder M codes.

**Siemens SINUMERIK ISO mode** ([#103](https://github.com/grahamrkf/glosscode/issues/103)): marked unverified.
- Incomplete: "pocket calculator" numbers, ";" comments and nested brackets, "/" anywhere in a line with levels /1–/9, G04 alone on its line, tool length needed before a fixed cycle, M98 P with a packed count, G54 P1–P48, G54.1, G05.1 and G72.1/G72.2. Native Siemens programs aren't covered.
- Uncertain: whether the 16 call levels are shared between calls and macros.

**Fagor 8055 / 8055i** ([#104](https://github.com/grahamrkf/glosscode/issues/104)): marked unverified; the pattern and pocket cycles are new.
- Uncertain: the 15-level call depth.

**Fagor 8060 / 8065** ([#104](https://github.com/grahamrkf/glosscode/issues/104)): marked unverified. The mill cycle words come from the cycles manual; the lathe started from the quick reference and some readings are disputed (G87 K).

**GRBL 1.1** ([#105](https://github.com/grahamrkf/glosscode/issues/105))
- Incomplete: $ system commands and real-time characters (sent by the sender, not the program); laser mode reads as a spindle.

## Other languages and machine types

**Heidenhain TNC 640 Klartext** ([#106](https://github.com/grahamrkf/glosscode/issues/106)): first draft, marked unverified.
- Incomplete: RND, CHF and FK aren't drawn.
- Uncertain: CYCL CALL POS uses X and Y only; cycle 202 is called Boring (the manual says both); one sign of DEP CT R is a misprint in the manual.

**Hypertherm Phoenix / EDGE, Centroid and Tormach plasma** ([#107](https://github.com/grahamrkf/glosscode/issues/107)): marked unverified.
- Incomplete: Hypertherm's full code list (units codes, program end, M36/M40 arguments, G82 vs G83), Tormach's torch codes. Lasers and waterjets aren't covered.

**Generic** (each machine type): deliberately loose, only the common ISO codes.

## Simulation, for every control

- Run time ([#109](https://github.com/grahamrkf/glosscode/issues/109)) counts feeds, rapids and dwells, but not acceleration, tool changes or spindle start, so a real run takes a bit longer.
- Call depth: where the manual gives no limit, calls are followed 8 deep with a note instead of an alarm.
