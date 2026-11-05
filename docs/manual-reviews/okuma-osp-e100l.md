# Okuma OSP-E100L programming manual (lathe)

| | |
|---|---|
| Manual | Okuma OSP-E100L Programming Manual, Pub No. 4283-E (LE33-011-R2), 2nd edition, January 2000 |
| Copy reviewed | A PDF with a text layer (365 pages), read from a text extract only. No page images were checked. Each page is headed `4283-E P-n`, and the printed page = PDF page − 15 |
| Control | OSP-E100L lathe. It's the generation between the OSP-U10L (1998) and the OSP-P200L (2007) |
| Reviewed | 2026-11-05, against the `okuma` lathe tables in `data/gcode-rules.json` and `okuma.lathe` in `data/gcode-words.json` |
| Result | It's the same lathe language as the P200L and U10L. It's added as its own control, `okumae100l`, which inherits `okuma`. G30 now reads as the skip cycle on every Okuma lathe, and M98/M99 read as tailstock thrust on this control and the OSP700L |

The manual stays out of the repository. This file records what it says in our own words, with printed page numbers.

## Page map
- Program format and address ranges: pp. 1–5. Unit system and numbers without a decimal point: pp. 21–23.
- G codes: Sections 2–5 (pp. 24–50) and the G code table (pp. 335–337). M codes: pp. 51–55 and the table (pp. 338–342).
- Threading: pp. 99–125. Grooving and tapping: pp. 126–131. M-tool cycles: pp. 132–165. LAP: pp. 166–223.
- Contour generation and coordinate conversion: pp. 238–248. Two-saddle and two-turret programming: pp. 249–263.
- User Task (variables, GOTO/IF, CALL/RTS, MODIN): pp. 269–318. System variables: pp. 343–347.

## What matches the existing Okuma lathe tables
- G20 is the home position return and G21 the ATC home return; they aren't inch or metric (p. 335). Inch is a specification chosen by the UNIT parameter (p. 21). This matches `unitCodes: null`.
- G28/G29 cancel and set the torque limit, and G22 is torque skip (p. 37).
- G31/G33 thread along Z, G32 on an end face, G34/G35 are variable-lead threads, and F is the lead (pp. 99–104). G71/G72 are compound thread cycles (pp. 110–113), G73/G74 grooving (pp. 126–129), G75/G76 automatic chamfer and rounding, one-shot (pp. 30, 33), and G77/G78 tapping (p. 130).
- G50 X Z sets a zero shift and G50 S clamps the spindle (pp. 42–43). There's no G54–G59, G53 or G92.
- G64/G65 turn droop control off and on. G65 isn't a macro call here.
- G94 is feed per minute and G95 feed per rev, with G95 the default (p. 45). G96/G97 need an S (p. 47).
- G04 F__ is the only dwell form (p. 41). An L on G02/G03 is the arc radius (p. 28).
- Subprograms are CALL O__ Q__ with local variables in the block, ended by RTS (pp. 287–288). MODIN/MODOUT call one after every move, nested up to 8 deep (pp. 289–291). GOTO N__ and IF [ … ] GOTO N__ jump within a program (pp. 272–274). V1–V200 are the common variables (p. 275).
- Up to 8 M codes per block (p. 48), which matches `mPerBlock: 8`.
- LAP: G81/G82 … G80 define the contour, G83 the blank (LAP4 only), and G85/G86/G87/G88 run it, with G84 changing the conditions (pp. 168–199).
- M-tool cycles G180–G190 are modal until G180, which has to be alone in its block (p. 132).

## What changed in GlossCode
- **G30 is a skip cycle on Okuma lathes**, not a return home (G code table p. 335; the P200L, OSP700L and U10L tables agree). The Okuma brand word read "return to zero point", which is right on Okuma mills (P300M). `okuma.lathe` now reads G30 as SKIPCYC. The manual gives no format for it.
- **M98 and M99 are tailstock thrust low and high** (table p. 340), as on the OSP700L. The English row now says so for the `okumae100l` and `okuma7000l` controls. The P200L table wasn't rechecked, so the base Okuma lathe is unchanged.
- **New control `okumae100l`** ("Okuma OSP-E100L"). It inherits the Okuma lathe tables and words like the U10L and OSP700L controls do, runs Okuma subprograms from the library, and shows up under Lathe in the machine picker.

## Not settled or not added
- **M99 still ends a subprogram in the simulation and checks** on every control (`isReturn` in the mockup, `gc_is_return` in the core), even where the English row says tailstock thrust. Okuma subprograms end with RTS, so a tailstock M99 inside a subprogram called with CALL would end it early. This needs a dialect key such as the existing `subReturn` list, which the return check doesn't read yet.
- **Numbers without a decimal point** follow the unit-system parameter (1 µm, 10 µm or 1 mm), not the decimal point (pp. 22–23). The p. 22 table and the p. 23 examples disagree, and the extract lost the µ signs, so the `missing-decimal` behavior is left as it was. Check pp. 22–23 against the page.
- **T code digit order.** P. 50 lists offset, tool and nose R, while pp. 63 and 93 list them the other way round. The examples (p. 63 T110111, p. 127 T0101) fit "offset last". Check the page image before encoding this.
- **Codes the E100L has that GlossCode doesn't explain yet:** G13/G14 turret select, G62 mirror image, G100, G101–G103 and G132/G133 contour generation, G107/G108 and G178/G179 synchronized tapping, G110/G111 surface speed per turret, G112/G113 circular threading (no format given), G119, G122/G123, G138, G140–G143, G152, G161–G171 and G205–G214 G-code macros, and the many option M codes from M17 upward.
- **M156/M157.** The p. 53 heading and the table on p. 340 disagree about which one turns the center work interlock on. Read together, M156 is the normal state (it's the reset default) and M157 releases the interlock.
- **Errors in the manual** to avoid copying: p. 53 swaps M146/M147 (p. 55 and the table are right), p. 99 says E where K is meant, p. 101 says I where K is meant, p. 163 says G183 for G185, p. 178 says G85 for G88, and p. 193 says G61 for G81.
- **Tables to check against the page image:** the G and M tables (pp. 335–342), where the option stars can land next to the wrong row in the extract (M110, M165, M73–M75 and G13 are the ones to check), the address ranges (p. 5) and the unit table (p. 22).
