# Mazak EIA/ISO programming (machining centers and lathes, with mill-turn notes)

| | |
|---|---|
| Manuals | Mazak EIA/ISO Programming Manual C735PBT019E, for Mazatrol M1, M2, M32, M Plus and Fusion 640M 5X/Nexus machining centers (2001) · Mazak EIA/ISO Programming Manual for Mazatrol Matrix, INTEGREX IV, H740PB0030E (mill-turn) · Mazak EIA/ISO Programming Manual C734PBT018E, for Mazatrol turning (T-Plus, Fusion 640T Nexus and others) |
| Copies reviewed | PDFs with text. Pages are chapter-page (C735: 3-10 = PDF 32, 8-1 = PDF 103, 13-1 = PDF 185) |
| Not used | The Mazatrol conversational manual (out of scope) and the 1980s CAM M-2 manual (a poor scan) |
| Reviewed | 2026-11-01. This adds the `mazak` dialect, which inherits `fanuc` and its words |
| Result | Machining-center cycles checked; a lathe side added from C734 (G code system A, standard mode); mill-turn left for later |

## Machining center (C735)

| Mazak | Page | In the dialect |
|---|---|---|
| G75, G78 and G79 are boring cycles, G76 fine boring, G77 back spot facing, G85 reaming. On Fanuc mills G75 and G77–G79 are grinding cycles | 3-10, 13-1 | All are checked cycles in the canned cycle group, with English words |
| Cycles take X Y Z Q R P D K I J E H F L. **L is the repeat count** (L0 stores the data without drilling); D is the depth below R where the rapid ends; I/J slow the last cut; E is a second feed; H picks synchronous tapping | 13-1 to 13-4 | Each cycle lists its words; K is not a repeat count here |
| **F is required on every cycle** | 13-2 | F is in `requires` |
| G04 X in seconds, or P in 0.001 s | 8-1 | Inherits Fanuc's millisecond P check |
| G92.5 rotation, G54.2 dynamic offset, G61.1 shape correction, G40.1–G42.1 shaping, G71.1/G72.1 chamfering-cutter cycles, G02.1/G03.1 spiral, G06.1/G06.2 splines | 3-10 | Not added (decimal codes) |
| Groups otherwise match Fanuc | 3-10 | Inherited |
| M codes (p. 3-11, "machines differ"): M06 tool change, M07 mist, M09 all coolant and air off, M10/M11 tool clamp/unclamp, M19 orient, M48/M49 overrides, M50 air blast, M51 through-spindle coolant, M52 tapping coolant | 3-11 | English words under `mazak.mill` |

## Lathe (C734)

Pages are chapter-page. Everything here is lathe.

**Two parameters renumber the G codes** (3-10 to 3-12). P16 bit 3 picks "T32 compatible" or "standard" mode, and P9 bits 2–3 pick G code system A, B or C. **With both bits at 0 the system is B, not A.** How the systems differ (A / B / C):

| | A | B | C |
|---|---|---|---|
| Thread cutting | G32 | G33 | G33 |
| Coordinate set, spindle clamp | G50 | G92 | G92 |
| Units | G20/G21 | G20/G21 | G70/G71 |
| Repetitive cycles | G70–G76 | G70–G76 | G72–G78 |
| Turning, threading, facing cycles | G90/G92/G94 | G77/G78/G79 | G20/G21/G24 |
| Feed per minute, per rev | G98/G99 | G94/G95 | G94/G95 |
| G90/G91 absolute, incremental | no | yes | yes |

**Codes that change with the mode:** G52/G53 are Mazatrol coordinates in T32 mode and local/machine coordinates in standard mode (where Mazatrol coordinates move to G52.5/G53.5). G36/G37 are measurement in T32 mode and automatic tool compensation in standard mode (measurement moves to G36.5/G37.5). G12.1/G13.1 turn milling mode on and off in T32 mode and polar interpolation in standard mode; G07.1 is only in standard mode.

**Groups:** every turning cycle (G70–G76, G90/G92/G94) is in group 09 with the hole cycles, and G96/G97 are group 17. G68/G69 mirror for the opposite turret, G68.5/G69.5 rotate. Mazak extras include G01.1 C-axis threading, G46 automatic nose radius direction, G109–G112 multi-system and cross machining, G113/G114.3 hobbing, G120/G121 Swiss mode, G122/G123 polar input and G130 Tornado tapping. An unknown code is alarm 708.

**Numbers** (5-3): a value with no decimal point is the least increment or whole units, depending on P9 bit 5.

**Dwell** (8-1 to 8-2): G04 X or U in seconds, or P in 0.001 s. **A decimal point on P is an alarm on the lathe** (the mill manual drops the fraction instead). In G99 the dwell counts spindle revolutions. Inside hole cycles P takes a decimal (P.2 in the samples).

**M codes** (9-1): up to 4 per line; a fifth replaces an earlier one. Their meanings come from the machine's specification.

**Repetitive cycles** (13-2, comparison table 13-8):
- Standard mode uses Fanuc's two blocks: G71 U R / G71 A P Q U W F S T, the same for G72 (W R first) and G73 (U W R first), G74/G75 R / X(U) Z(W) P Q R F, and G76 P(mm rr aa) Q R / X(U) Z(W) R P Q F.
- T32 mode uses one block: G71/G72 A P Q U W D F S T with D as the depth and no decimal point allowed (13-9); G73 A P Q I K U W D F S T; G74/G75 X(U) Z(W) I K D F S T; G76 X(U) Z(W) I K D A F S T (and E).
- **A names the program that holds the finish shape**, so the profile can be in another program in memory. Fanuc has no A word. Up to 100 shape blocks and 32 recesses.
- The standard-mode G74 sample writes P5. Q7. with decimal points (13-25), unlike Fanuc. Needs checking against the image.

**Turning cycles** G90/G92/G94 (13-1 to 13-7) are written with system A numbers.

**Hole cycles** (13-38 to 13-47): G83/G84/G84.2/G85 on the face and G87/G88/G88.2/G89 on the side, cancelled by G80. In the sample G83 X50. H30. Z-20. R5. Q5000 P.2 F200 L3, H is the C-axis step, L the repeat count, P the dwell and F the pitch when tapping.

**Subprograms** (13-48 to 13-49): M98 P(program) Q(N number in it) L(repeats), where the mill uses H for the N number. M99 P(N) L returns. Up to 15 levels (the mill allows 8). M99 goes on its own line before the %.

G65/G66/G67 macros are in chapter 14, and G65 can call a Mazatrol program (14-10). The T word has a decimal suffix on the 640MT (11-1); not read in detail.

### In the dialect (`mazak.lathe`)

- Tables are G code system A in standard mode, the same as `fanuc.lathe`. A machine left at the default system B, or set to C, uses the `mazaklb` or `mazaklc` control (2026-11-04), which renumber these tables.
- Up to 4 M codes per line.
- G70–G73 take A. G71/G72/G73 take D, and G73–G75 take I and K, so T32 one-block cycles don't raise missing-word errors.
- G76 needs only X, Z and F, so both the two-block and the T32 one-block forms pass.

## Not handled yet

- **Numbers without a decimal point** are either the least increment ("type I", the Fanuc reading) or whole units ("type II"), set by parameter F91 bit 5 (pp. 5-4, 5-5). GlossCode assumes type I. A machine profile setting would cover type II.
- **Dwell details:** a decimal part on P is ignored (P12.345 = 0.012 s), and in G95 mode G04 counts spindle revolutions (p. 8-2).
- **Subprograms:** M98 P(program) H(N number inside it) L(repeats). Without P it calls an N number in the current program, like Haas M97. M99 P(return N) L(new count). Up to 8 levels (pp. 13-26, 13-27). Only M98 P is checked.
- Corner ",C" and ",R" (p. 13-14), macros G65/G66/G66.1/G67 with #variables (13-9), and macro G codes (up to 10 codes in 01–255).
- The missing-F message appears twice on a cycle line (once for the cycle's words and once for the feed check).

- **Lathe:** G code systems B and C and T32 mode as machine settings. The first block of a two-block G71/G72 (G71 U R) is flagged for missing P and Q, as it is on `fanuc.lathe`. A (the shape's program) shows as an unknown word, and P/Q labels in another program show as missing. The dwell note suggests a decimal on P, which is an alarm on Mazak lathes. Groups 09 and 17, the hole cycles' H and L, and M98 Q aren't modeled.

## Mill-turn (Matrix INTEGREX IV), not added

Mill-turn programs use one of two G code series, which renumber the turning cycles:

- **T series**, close to Fanuc lathe system A: G50, G98/G99 feeds, G70–G76, G83–G89 face and side drilling, G90/G92/G94 cycles.
- **M series:** G92, G94/G95, G90/G91, and the turning cycles moved to G270–G276, G283–G289 and G290/G292/G294, plus the machining-center cycles above.
- All turning cycles are in group 09 with the drilling cycles. G96/G97 are group 17. Codes from different groups in one block run in group order (p. 3-13).

A Mazak lathe or mill-turn profile currently gets the Fanuc lathe (system A) tables, which fits the T series. The M series needs its own tables.
