# Fagor 8055, 8055i, 8060 and 8065 (mill and lathe)

| | |
|---|---|
| Manuals | 8055/8055i M Programming Manual Ref. 1501, Soft V01.6x (main mill source) · 8055 Programming Manual Ref. 1402 and 8055 M Ref. 1110 (earlier mill editions) · 8055 ·T· Programming Manual Ref. 1110, Soft V01.3x (lathe) · a Portuguese 8055/8055i M Ref. 0706 was not used |
| Copy reviewed | PDFs with text. Page numbers are the manuals' printed "·n·" footers |
| Reviewed | 2026-11-01. Mill dialects `fagor8060` (8060/8065) and `fagor8055` (8055/8055i) added 2026-11-04 |
| Result | Fagor looks like Fanuc but renumbers many G codes, uses different cycle words and has its own block format. It needs its own dialect, and the parser needs work first |

Fagor was last in the suggested order. This review records what a `fagor` dialect would need, so it can be built when a Fagor machine is a target.

## Block format (mill pp. 33–36)

A line is: optional block skip (`/`, `/1`, `/2`, `/3`), an optional N label of up to 8 digits, ISO words or a high-level statement, an optional **N repeat count of up to 4 digits at the end of the line**, and an optional `;` comment.

- **N means two things.** At the start of a line it's a label; at the end it's how many times to repeat the line. N0 at the end makes the move without running the active cycle.
- **Comments start with `;`.** Parentheses don't hold comments. They hold high-level statements, such as `(SUB 12)`, `(RET)`, `(CALL 3)` and `(IF …)`.
- Empty lines aren't allowed, and a program starts with a `%name,attributes,` line.

Today's parser would read every parenthesised statement as a comment and the end-of-line N as a second label, so the block format comes first.

## Mill G codes that differ from Fanuc (pp. 62–64)

The modal and default columns of these tables need checking against the page images.

- **Units:** G70 inch, G71 metric. G20/G21 are work zone limits and G22 turns zones on and off.
- **Tool length:** G43 on, **G44 off**. G49 is the inclined plane, not a cancel.
- **Work offsets:** G54–G57 absolute, **G58/G59 additive**, G159 extended.
- **Mirror image:** G10–G14. G15 sets the longitudinal axis, G16 the plane from two addresses.
- **Corners and arcs:** G05 round corner, G07 square corner, G06 arc center in absolute, G08 tangent arc, G09 three-point arc, G36 rounding, G37/G38 tangential entry and exit, G39 chamfer.
- **G28/G29** select the spindle or swap axes, G30 synchronizes spindles. **G32** is inverse time feed.
- G47 tool coordinates, G48 TCP, G50 rounding, G51 look-ahead, **G52 move to contact**.
- **Patterns and pockets:** G60–G65 multiple machining patterns, G66–G68 irregular pocket, G69 variable peck drilling, G87 rectangular pocket, G88 circular pocket.
- G72 scaling, G73 rotation, **G74 home search**, G75/G76 probing, G77/G78 axis slaving, G79 changes cycle parameters.
- **Cycles:** G81 drill, G82 drill with dwell, G83 deep hole, G84 tap, **G85 ream**, G86 bore, G89 bore with dwell. G210 bore milling, G211/G212 thread milling.
- **G92** presets coordinates or limits spindle speed, **G93** sets the polar origin, G94/G95 feed modes, **G97** constant tool center speed, G98/G99 return level.

## Mill canned cycles (pp. 144–145, 158)

- The words aren't Fanuc's: `G81 G98/G99 X Y Z I K`, where **Z is the reference plane, I the depth and K the dwell in hundredths of a second**. There's no R.
- A cycle can't be defined while G02, G03, G08, G09, G33 or G34 is active.
- A defined cycle runs after every move, and the N count at the end of a line repeats it.

## Dwell (pp. 107–108)

- **G04 K, in hundredths of a second** (K50 is 0.5 s).
- G04 K0 stops block preparation instead of dwelling.

## Lathe (8055 ·T·)

The lathe numbers its cycles differently again:

- G60/G61 face and side drilling and tapping, G62/G63 slot milling.
- G66 pattern repeat, G68 roughing along X, G69 roughing along Z.
- G81/G82 straight turning and facing, G83 drilling, G84/G85 curved turning and facing, G86/G87 threading, G88/G89 grooving.
- G151/G152 X as diameter or radius, G233 thread withdrawal on interrupt, G15 the C axis.

## Subroutines (p. 391)

- A subroutine is `(SUB n)` … `(RET)`. It's called with `(CALL n)`, `(PCALL n, …)` with local parameters, or `(MCALL n)` modal.
- Numbers 0–9999 are general and 10000–20000 belong to the machine builder. A number must be unique across the whole control memory, not just the program.
- Only subroutines in RAM run; others need EXEC.
- There's no M98/M99 in the core language.

## M codes (chapter 5, about pp. 66–80)

Apart from the usual M00–M06, M08/M09 and M30, Fagor leaves M codes to the machine builder. They weren't extracted.

## What a `fagor` dialect would need

1. Parser: `;` comments, parenthesised statements kept as statements, N at the end of a line read as a repeat count.
2. Its own G tables (not inheriting `fanuc`): G70/G71 as units (`unitCodes`), G44 as tool length off, the renumbered cycles, and every Fanuc meaning above in `foreign`.
3. Cycle words Z/I/K with no R, and `dwellWords` K in hundredths.
4. `subCalls` for CALL/PCALL/MCALL and `subReturn` RET, which needs statement parsing.

## Fagor 8060 and 8065 (the current control), mapped only

Programming Manual Ref. 2008 (498 pp) is the main source. Ref. 1402 (750 pp) is older and numbers its chapters differently. The M examples manuals (Ref. 2102 and 1402) and the MC operating manual (Ref. 2102) are of little use here. **The canned cycles aren't in the programming manual.** Its G80–G89 rows point to a separate M/T cycles manual, which we don't have.

**Chapter map (Ref. 2008, printed pages):** block structure 1.3 (p. 43); G list 1.5 (pp. 48–50); M list 1.6 (p. 51); statements 1.7 (p. 52); labels 1.8 (p. 55); comments 1.9 (p. 56); units G70/G71 (p. 71); planes ch. 4 (p. 84); zero offsets ch. 5 (p. 92); feed ch. 6 (p. 107); spindle ch. 7 (p. 130); path control ch. 8 (p. 147); threading and rigid tapping ch. 10 (p. 189); geometric assistance ch. 11 (p. 205); dwell 12.1 (p. 245); radius compensation ch. 13 (p. 261); block skip, NR repetition, #RPT, $GOTO, $FOR and $WHILE ch. 14 (pp. 285–307); subroutines ch. 15 (pp. 311–334); C axis, kinematics and HSC chs. 17–22; statements ch. 26; variables ch. 27.

**How it differs from the 8055:**
1. **Comments can use `( )` or `;`**, and #COMMENT BEGIN/END marks a block of them (p. 56). On the 8055, parentheses hold statements.
2. **High-level statements start with $ or #** ($IF, $GOTO, $FOR, #CALL, #MSG, #TIME), not parentheses. Empty lines are allowed (p. 43).
3. **Repeats use NR** (… F150 NR4; NR0 runs the line once), not an N count at the end of the line (p. 289).
4. **Dwell is in seconds:** G04 K0.5, or the time alone (G04 8.5). #TIME does the same (p. 245). The 8055 counts in hundredths.
5. **Subroutines** start with `%L name` (local) or `%name` (global) and end with M17, M29 or #RET. They're called with LL, #CALL, #PCALL or #MCALL, and G500–G599 can be user subroutines (pp. 312–324).
6. **G codes that changed** (pp. 48–50): work zones moved to G120–G123, and G20 sets the plane from two directions; G30/G31 set the polar origin; G93 is machining time (the 8055 uses G32 for inverse time); G58/G59 are absolute offsets 5 and 6 (additive on the 8055); G60/G61 are one-block corner modes (patterns on the 8055); G63 is rigid tapping; G100–G104 are probing; G151 is diameter mode. G43/G44 aren't listed. G05/G07, G06/G08/G09, G10–G14, G36, G38, G50, G70/G71, G72, G73 and G74 mean the same as on the 8055, and the cycle numbers match too.

**For a Fagor dialect:** build it for the 8060/8065, since that's the current control. Its G codes are close to the 8055's, but the syntax (comments, $ and # statements, NR, dwell in seconds, %L and #CALL subroutines) is different. Checking cycle words needs the 8060/8065 canned cycles manual.

**Built (2026-11-04):** the `fagor8060` mill dialect, with the cycle words from the 8060/8065 M canned cycles manual (Ref. 1807): G81 to G88 and G210 to G212 take Z as the reference plane and I as the depth, with no R; G87/G88 are the rectangular and circular pockets. G160 to G165 (multiple machining) and the lathe aren't done. Its block syntax is described in [machine-definitions.md](../machine-definitions.md).

**Built (2026-11-04), 8055:** the `fagor8055` mill dialect from Ref. 1501, with its own block syntax (statements in parentheses, `;` comments, the N repeat count at the end of a line; see machine-definitions.md). Corrections to the notes above from a closer read: the header line is `%comment ,attributes,` with no name (the program number is the file name); G43 stays on through a tool change and the length comes from the tool's D; and the cycles are G69 (variable peck), G81 drill, G82 drill with dwell, G83 deep hole (J pecks of I), G84 tap (R0 normal, R1/R2 rigid), G85 ream, G86 bore, G87/G88 pockets, G89 bore with dwell and G210 to G212. Not done then: the lathe, G60 to G65 pattern words, G66 to G68 irregular pockets, and simulating the N repeat count.

**Built (2026-11-04), patterns and pockets:** the N repeat count runs the line that many times in the simulation (N0 makes the move without the cycle). G60 to G68 read through `codeWords`: G60 linear (A, and two of X length, I step, K count), G61 rectangle and G62 grid (A, B, two of X I K and two of Y J D), G63 circle (X Y to the center, I angle step or K count, C how the tool moves between points, F), G64 arc (adds B, the angle covered), G65 chord (A bisector angle or I chord length), with P to V as points to skip (P10.013 is points 10 to 13). G66 names the labels of its drilling (D H), roughing (R I) and finishing (F K) blocks and its profile (S E); G67 roughing needs B, I, R and T, and G68 finishing needs T. The simulation machines the active cycle at each pattern point after point 0 (G61 goes around the sides counterclockwise, G62 row by row back and forth), and G66 traces its profile and returns. G79 changes the active cycle's words. G63 was wrongly flagged as an 8060-only code; it's the 8055's circular pattern.

**What the 8055 entry needed (planning notes):** the 8055 reads `( )` as statements, not comments, so it needs its own block syntax: `(SUB n)`, `(RET)`, `(CALL n)`, `(PCALL n, …)`, `(MCALL n)`, `(IF …)` and `(P100 = …)` as one word each, `;` comments, an N at the end of a line as a repeat count, P parameters, and its own G table (G43/G44 tool length, G58/G59 additive offsets, G60 to G65 patterns, G32 inverse time, G04 K in hundredths). Calls and returns would use the same mechanism as the 8060's.

**Built (2026-11-04), lathe:** the `fagor8055` lathe table from the 8055 T programming manual (Ref. 1110), with the same block syntax as the mill. Its G list differs from the mill's: G15 turns the C axis on, G16 picks the plane by two axes, G60 to G63 are live tool drilling and slot cycles, G66 is pattern repeat, G68/G69 rough along a profile, G81 to G89 are turning, facing, drilling, threading and grooving cycles, G96 is constant surface speed (on the mill it's the feed at the cutting point), G151/G152 pick diameter or radius, and G233 sets the thread withdraw. There is no G43, G80, G98 or G99. Cycles aren't modal. S on G66/G68/G69 is a profile label and S on G60 to G63 the live tool speed; M on the roughing and threading cycles is a stock or a pitch change, not an M code. Not checked: X in radius (G152) is drawn as a diameter, and G84/G85 arcs are drawn straight. The manual has a few small slips (G34 has no modal mark in the table but the text says modal; a G33 example on p. 94 reads `Z160 Z60`).

**Built (2026-11-04), 8060/8065 lathe, unverified:** a `fagor8060` lathe table. The G list and block format come from the programming manual (Ref. 2008); the lathe cycle words come only from the T quick reference (Ref. 1402), because the lathe canned cycles manual needs a Fagor customer login. The cycles follow the 8055 lathe's numbers and words, with G66/G68/G69 also taking P (the profile's subroutine) and Q (its program), and the live tool cycles at G160 to G163 with N as the live tool spindle. G192 S limits the spindle speed, G92 presets the coordinates (`coordSet`), and G33 takes the pitch as K (or I, J). Checked against the 8065 T canned cycles manual on 2026-11-04 (below).

## Fagor 8065 T canned cycles (Ref. 1209)

| | |
|---|---|
| Manual | CNC 8065 ·T· Canned cycles, Ref. 1209, software V04.24. The printed page numbers equal the PDF pages |
| Reviewed | 2026-11-04, against the `fagor8060` lathe table built from the quick reference. The manual names only the 8065; GlossCode applies it to the 8060 too |
| Result | The cycle numbers and most words were right. The fixes are below; the dialect stays marked unverified until it's checked against a machine |

**Fixed:**
- G66, G68 and G69 don't always need S and E. The profile can be between labels S and E in this program, in a local subroutine P (S and E are then ignored), in a global subroutine Q, or between labels S and E in Q (pp. 51, 57, 63). The cycles now need one of S/E, P or Q, and labels with Q aren't looked for in this file (`labelProgram`).
- G66, G68 and G69 leave G00, G40 and G90 active (pp. 52, 57, 63); G83, G86 to G89 and G160 to G163 leave G40. The cycle's `after` list sets these modes, so the next line reads as a rapid.
- G160 to G163: S, the live tool speed, is optional; without it the live tool doesn't start (pp. 69, 72, 74, 76). The main spindle is stopped on purpose, so no spindle-off warning (`startsSpindle`).
- G160 to G163 in G95 alarm (1039) when no G94 feed was programmed before (pp. 70, 73, 75, 77). The new `cycle-needs-feed-per-min` check flags it (`needsFeedPerMin`), and the G94 feed isn't flagged as changed under G95.
- G162/G163 F is the slot feed; the feed from before the cycle stays active, so F is now one of the cycle's own words.
- G84/G85 I and K are the arc center along X (incremental, radius) and along Z (incremental) (pp. 35, 38). G86/G87 C is the thread pitch (pp. 41, 45).
- Help texts: K on G83, G88/G89 and G160/G161 is in hundredths of a second; G83 D is the approach distance; R0 is clutch tapping (the default) and R1 rigid; G86/G87 A defaults to 30° and W with K is the spindle angle at the measure point; the signs of the thread depth and pass give the direction; M defaults to L on G66/G68/G69 and to 0 on G81 to G85.

**Still to check:**
- G87 K: this manual (p. 44) gives the measure point as a Z coordinate, worded as for G86 K, while the quick reference (Ref. 1402, p. 36) gives X. GlossCode reads it as X, since Z stays the same along a face thread and the p. 44 text looks copied from G86. A test on a control would settle it.
- G192, G92, G33 and G34 aren't in this manual; they come from the programming manual.
- `#MILLCY` and `#LATHECY` (switching cycle sets) and `#DINDIST` read as unknown words, and a subroutine name in quotes (`P"NAME"`) isn't read.
- Whether the 8060 has every cycle the 8065 manual describes.
