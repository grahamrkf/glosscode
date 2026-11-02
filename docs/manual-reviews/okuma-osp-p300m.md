# Okuma OSP-P300M programming manual (machining center)

| | |
|---|---|
| Manual | Okuma OSP-P300S/P300M (and -R) Programming Manual, 2nd edition, Pub. No. 6087-E-R1 (ME33-022-R2), Aug. 2014. Footer "6087-E P-n"; PDF page = printed page + 13 |
| Copy reviewed | A PDF with text, 323 pages |
| Control | OSP-P300M machining centers |
| Reviewed | 2026-11-01, against the `okuma` dialect's mill tables. The mill side hadn't been checked against a manual before |
| Result | Several mill entries were wrong. The mill tables are now checked, so the `okuma` dialect (mill and lathe) is marked verified |

## What was wrong and is now fixed

- **Numbers:** a whole number has its decimal point assumed at the end, so X1 is 1 mm (p. 18). Parameters can change the input unit (pp. 17–19). The dialect now reads numbers as written instead of using the Fanuc least-increment rule.
- **G43/G44 are the 3-D tool offset** cancel/on (p. 274), not tool length. The old warning "use G56, not G43" is now an info note that says what G43 does here.
- **G20/G21 only confirm** inch or metric input, one block at a time; units come from parameters. As on Okuma lathes, `unitCodes` is off and the units group is removed. The editor then treats programs as inch, so a metric feed can get a "feed looks large" note.
- **No G28 or G29.** G30 returns home. The G28 warning is now an error with that wording.
- **G96 is a local coordinate system and G97 recalculates coordinates;** constant surface speed is G196/G197 (p. 277). G96/G97 get info notes, and G196/G197 are the speed-mode group.
- **G68 turns the slope coordinate system off and G69 turns it on**, the opposite of Fanuc rotation. English words added.
- **M98 is the horizontal-spindle oil-mist coolant mode** (p. 290), not a subprogram call, and there's no M99. The warnings now say so.
- **M88/M89 are the dust collector** off/on. They have English words now.
- **No G52, G65, G66 or G67.** A local coordinate system is G96; subprograms are CALL O_ with LA=, LB= arguments; MODIN/MODOUT call after each move.
- **No repeat word on fixed cycles.** K is now an optional shift word on G76/G87/G88, not a repeat count (pp. 112–135).
- **G98/G99 don't set the return level.** It's M52 (upper limit, this cycle only), M53 (the G71 level) or M54 (R level, the default) (p. 116). G98/G99 get a warning, and M52–M54 have English words.
- **Q on G74/G84 is the dwell at the R level**; on G73/G83 it's the peck and on G76/G87 the shift.
- **G79 variable-pitch tapping and G88 multi-step boring** are in the cycle group with English words.
- **Dwell is G04 F or G04 P** (p. 48). The milliseconds check is off, since the unit (1, 0.1, 0.01 or 0.001 s) is a parameter.

English words were also added for G16 (work offset for one line), G57–G59 (4th–6th axis tool length), G62 mirror, G71 return level, G92 work coordinate change, M07, M10/M11 A clamp, M19, M40–M42 and M50/M51 through-tool coolant low/high.

## What matches

- G15 H selects a work offset (modal), 20 sets standard and up to 400; H0 is machine coordinates (p. 51).
- G56 H is the tool length offset and G53 cancels it; G54–G59 are tool length offsets on X, Y, Z and the 4th–6th axes.
- CALL O(name) Q(repeats, up to 9999) and RTS (p. 183).

## Not handled yet

- **"=" before an expression or variable** (X=VC1+VC2, p. 4), hex numbers with an H suffix, "&" to continue a line (p. 184), and blocks up to 158 characters.
- **Names:** O names are up to 4 characters and N sequence names up to 5, letters allowed. The editor treats N and O as numbers.
- **Dwell is modal:** a G04 with no F or P uses the last time (p. 48). The check still asks for F or P.
- **G16 Hn** applies for one block only; the first move after G15 must be absolute (p. 51). Not checked.
- G272–G274 and G281–G284 tapping and drilling variants, G45–G47 5-axis offsets, G464/G465, macro G codes (G100–G120, G300–G349, G501–G580) and the mnemonics (COPY, NCYL, MSG, PRINT, CHFC/CHFR, BHC, LAA, ARC, GRDX, PMIL, FMIL and others, pp. 279–281).
- About 600 M codes, mostly options (pp. 283–294). Only the common ones are added.
- Check the G and M tables (pp. 274–294, merged group cells) and the decimal-point pages (pp. 18–19) against the image.
