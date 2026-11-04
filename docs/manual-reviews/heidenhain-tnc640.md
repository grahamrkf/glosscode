# Heidenhain TNC 640 (Klartext)

| | |
|---|---|
| Manuals | TNC 640 User's Manual Klartext Programming, NC software 34059x-18 (10/2023) · TNC 640 User's Manual Programming of Machining Cycles, same software |
| Copy reviewed | PDFs with text. The printed page numbers equal the PDF pages. "KT" is the Klartext manual and "CY" the cycles manual |
| Reviewed | 2026-11-04. Dialect `heidenhain` added the same day, marked unverified |
| Result | Klartext is a different language from G code, not a dialect of it. It has its own block syntax (`blockSyntax: "klartext"`), readings, checks and simulation. The English rows stay on, as for every control |

Klartext is Heidenhain's conversational language. Each block names a function in words (`L` for a line, `CC` for a circle center, `TOOL CALL`, `CYCL DEF`), so it reads more clearly than G code. GlossCode still shows an English row under each line, which spells out the abbreviations and the Q parameters.

## Program structure (KT pp. 93–99)

- The first block is `BEGIN PGM name MM` (or `INCH`) and the last is `END PGM name MM`. Klartext files end in `.H`; ISO programs (`.I`) are G code and aren't covered by this dialect.
- **Block numbers** are bare numbers at the start of the line, from 0, made by the control. There is no N word. `block-number-order` flags a number that isn't higher than the one before.
- `~` at the end of a line carries the block on to the next line. Cycle definitions and `PATTERN DEF` use it: the lines after it have no block number.
- `;` starts a comment, in a block or alone. In a cycle block `;SET-UP CLEARANCE` names the parameter. A `*` block is a heading for the structure view.
- `BLK FORM 0.1 Z X Y Z` and `BLK FORM 0.2 X Y Z` give the blank; `BLK FORM CYLINDER`, `ROTATION` and `FILE` are the other forms.

## Words and path functions (KT pp. 147–196)

- Axes take a signed value (`X+100`); `IX+20` is incremental. `PR` and `PA` are polar radius and angle from the pole `CC`, `IPA` and `IPR` their incremental forms. A Q parameter can take the place of a number (`L X +Q10`, printed with a space).
- `R0`, `RL` and `RR` are no compensation, left and right. `F200` is the feed, `FMAX` rapid for this block, `FAUTO` the feed from the TOOL CALL. `DR+` and `DR-` are counterclockwise and clockwise.
- `L` line, `LP` polar line, `C` arc around `CC` (`CC` doesn't move the tool), `CR` arc with a radius (`R` over 0 is the short arc, under 0 the long one), `CT` tangent arc, `CP` and `CTP` polar arcs, `RND R` round corner, `CHF` chamfer.
- `APPR` and `DEP` with `LT`, `LN`, `CT` and `LCT` (and the polar `PLT`, `PLN`, `PCT`, `PLCT`) approach and depart a contour.
- FK free contours (`FL`, `FLT`, `FC`, `FCT`, `FPOL`) are read but not solved.

## Tools and M functions (KT pp. 128–135, 232–250)

- `TOOL CALL 5 Z S4000 F350 DL+0.2 DR-0.1 DR2+0.05` changes the tool (5, or 5.2 for an index, a name in quotes, or QS5), sets the tool axis, speed and feed, and the oversizes. There's no T word and no M06. `TOOL DEF` preselects the next tool.
- M3/M4/M5 and M8/M9 as in G code, M13/M14 spindle and coolant together, M2/M30 end. M89 and M99 call cycles (below). M91 and M92 give machine coordinates for one block. M101 to M148 are in the dictionary as the manual describes them; machine builders can change M functions.

## Labels and calls (KT pp. 252–261)

- `LBL 1` or `LBL "NAME"` is a label; `LBL 0` ends a subprogram. `CALL LBL 1` runs the subprogram and comes back. Subprograms go after M2 or M30.
- `CALL LBL 1 REP 4` repeats the section from LBL 1 to this block, so it runs 5 times in all.
- `CALL PGM` runs another program; `SEL PGM` and `CALL SELECTED` pick one to run later.
- `missing-label` checks CALL LBL and the FN 9 to 12 jumps.

## Cycles (CY pp. 47–71, 78–255)

- `CYCL DEF 200 DRILLING` defines a cycle, with its Q parameters one to a line (`Q200=+2 ;SET-UP CLEARANCE ~`). It doesn't run it. `CYCL CALL` runs it once where the tool is, `CYCL CALL POS X Y Z` once at that position, `CYCL CALL PAT` at every `PATTERN DEF` point, `M99` once at the end of a move, and `M89` after every move until M99 or a new CYCL DEF. `cycle-call-no-def` flags a call before any CYCL DEF.
- The Q parameters GlossCode names (`qParams`) come from cycles 200 to 209, 240, 251 and 252: Q200 set-up clearance, Q201 depth (its sign is the direction), Q203 surface coordinate, Q204 2nd set-up clearance, and so on.
- Cycles 7 (datum shift), 8, 10, 11, 26 and 247 take effect where they're defined. Cycle 7 uses `CYCL DEF 7.0 DATUM SHIFT`, then `7.1 X+60` and so on.
- `PATTERN DEF` points: `POS1(X Y Z)` up to POS9, `ROW1`, `PAT1`, `FRAME1`, `CIRC1` and `PITCHCIRC1`. Z is the surface at that point.

## Q parameters (KT pp. 276–300)

- `FN 0` to `FN 8` set a Q parameter (assign, add, subtract, multiply, `DIV`, `SQRT`, `SIN`, `COS`, `LEN`). `FN 9` to `FN 12` jump to a label when the two values are equal, not equal, greater or less. `FN 14` raises an error, `FN 16` prints and `FN 18` reads system data.
- A formula can set one directly: `Q1 = 5 * 3 + 2 * 10`. The simulation works these out with `+ - * /`, parentheses and SQRT, SIN, COS, TAN, ABS; `^`, `SQ`, `LN` and the others leave the value unknown.

## What the simulation draws

Lines, arcs around CC, CR arcs, CT tangent arcs, polar lines and arcs, and APPR/DEP drawn straight to their end points. Drilling cycles plunge from the set-up clearance to the depth and come back to the 2nd set-up clearance; pockets and studs (251 to 257) draw their outline at the depth. It follows CALL LBL, REP repeats, FN 9 to 12 jumps and cycle 7 datum shifts. It doesn't draw RND or CHF corners or FK contours, and blocks with M91 or M92 aren't drawn.

## Still to check

- The whole dialect against a machine's own programs, before it's marked verified.
- `CYCL CALL POS`: the manual requires all three axes; GlossCode uses X and Y and the cycle's own surface (Q203).
- The cycle 202 heading says REAMING but the cycle table says BORING (CY pp. 84, 790); GlossCode uses Boring.
- The DEP CT text gives "opposite to the radius compensation" for both signs of R (KT p. 159); one is a misprint.
