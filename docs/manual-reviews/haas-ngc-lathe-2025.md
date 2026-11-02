# Haas NGC lathe manual, 2025 edition

| | |
|---|---|
| Manual | Haas Lathe Operator's Manual, Next Generation Control, 19" LCD, 96-8910 Rev V (December 2025) |
| Copy reviewed | PDF with a text layer, 592 pages. Printed page = PDF page − 34 |
| Compared with | Rev N (December 2020), which the Haas lathe tables were built from (see [haas-ngc.md](haas-ngc.md)) |
| Control | Haas NGC lathe. Some pages cover the VMT (vertical mill-turn) |
| Reviewed | 2026-11-01, programming chapters only (5 Programming, 6 Options Programming, 7 G-codes, 8 M-codes, 9 Settings) |
| Result | Six open questions from 2020 settled or confirmed, G84 R made optional, G184 added, C required on radial live-tool cycles, 42 new dictionary words, five new lathe modal groups |

Like the 2020 edition, this manual says "Copy by Permission Only", so it stays out of the repository. Page numbers below are the 2025 printed pages.

## Which parts matter

| Pages | Section | Use |
|---|---|---|
| 161–222 | Programming: block format, work offsets, subprograms, macros | **High** |
| 223–314 | Options programming: live tooling, C and Y axes, sub spindle, bar feeder | Medium |
| 315–430 | G-code list (315–320) and G-code pages, canned cycles | **High** |
| 431–458 | M-code list and pages | **High** |
| 461–560 | Settings | Low, except 285 (X radius or diameter), 426, 434 |

## Open questions from 2020, now settled

- **G71/G72 depth word.** D, as a radius, in the one-block form (pp. 357–360). In the older two-block Fanuc form the first block holds the depth (U on G71, W on G72) and R for retract, and the second block's U and W are finish allowances, which is why the 2020 list showed U or W twice. The 2025 G71 page only shows the one-block form; G72 still shows both. The tables keep D required. The two-block form isn't supported.
- **G241–G246 radial live-tool cycles.** C, F, R and X required, Y and Z optional, as in 2020 (pp. 416–422). G242 and G249 also need P (dwell); G243 takes I, J, K, P and Q. **Changed:** C is now required on G241 and G243. F stays optional in the tables because it's modal and the feed check already covers it.
- **M110/M111** are the sub-spindle chuck clamp and unclamp (pp. 433, 448). The dictionary already says so.
- **G04 P** without a decimal point is milliseconds, with one it's seconds (p. 332). G82 works the same way (p. 377). No change.
- **G84** starts the spindle itself, F is the lead under G99, and S must be given before the cycle (pp. 379–380). It can't be used with live tooling (p. 430). No change.
- **G114–G129** are still contradictory: p. 396 says G154 P3–P18, while the note on the same page and the table on p. 397 say G110–G129 are P1–P20. The p. 397 table also lists P3/P4 as G112/G113, which are XC interpolation on a lathe, so it looks copied from the mill manual. The dictionary keeps G114 = P5.

## What changed and is now in the tables

- **G84 R is optional** (p. 379): required words are F, Z and S before the cycle. R moved to optional.
- **Q peck depth** is a new optional word on G84 (p. 379), G184 (p. 405), G95 (p. 388), G186 (p. 406) and G195/G196 (p. 408). Added to G84 and G184.
- **G184 left-hand tap** (p. 405) is now a cycle in the tables, with its own help text and in the Insert menu's Tapping group. It starts the spindle in reverse itself and takes F as the lead.
- **New dictionary words**, all under `haas.lathe`:
  - G12/G13 circular pocket and G47 engraving with a live tool (pp. 333, 343).
  - G66/G67 modal macro call (p. 352), G68/G69 rotation (p. 354), G250/G251 scaling (p. 424). Rotation and scaling need that option.
  - G170/G171/G172: cancel, radius, or diameter override for X (p. 405).
  - G268/G269 feature coordinate system (p. 427), G280/G281 Safe Run off and on, G390/G391 absolute and incremental position mode (p. 428).
  - The live-tool tapping and radial cycles G184, G186, G195, G196, G241–G246, G249, which had no English words before.
  - M170/M171 4th-axis brake (p. 453), M174/M175 chuck pressure (p. 453), M183/M184 air hole blast (p. 454), M214/M215 live tool brake (p. 455), M299 APL load or program end and M300 APL sequence (pp. 455–456), M321/M322 quill on tow-along tailstocks (p. 456), M334/M335 P-Cool (p. 457).
- **New modal groups** on the lathe: X mode (G170–G172), position mode (G390/G391), rotation, scaling and feature coordinates.

## What matches

- No G or M code was removed and no existing code changed group.
- One M code per line (pp. 181, 185, 431).
- Work offsets G54–G59, G110/G111, G154 P1–P99 (pp. 350, 394–398).
- M97, M98, M99 and M99 P (pp. 443–445). M98 paths are now case sensitive.
- G70, G73, G75, G76, G90, G92, G94, G198/G199 words.

## Not settled or not added

- **G74 I** is now described as a diameter (p. 365); 2020 said radius. Check on a machine before changing the help text.
- **G71 two-block form** is no longer on the G71 page. Left unsupported.
- **G247/G248** (radial bore with manual retract) are still in the G-code list but no longer have a page. Left out.
- **G105 bar feed**: R was replaced by Q (only Q0 and Q13). G105 isn't in our tables yet.
- **G32 Q** start angle is in 0.001° with no decimal point and isn't modal (p. 341). No check for it yet.
- **G65 with an M code** on the same line: the M code has to come after G65, or the control alarms (pp. 308, 351). A possible new check.
- **Tool length offsets** are always applied unless the program calls Txx00 (p. 342, software 100.21.000.1100). Setting 426 can alarm on a tool with no geometry (p. 514). Neither changes the program text.
- **VMT-only codes** (G234 TCPC, G254/G255 dynamic work offsets, M373/M374 tool air blast, M388/M389 through-spindle coolant) are left out until there's a mill-turn machine type.
- Changes to existing M codes that depend on options: M08 P needs Variable Flow Coolant (p. 435), M12 in G14 mode is the sub-spindle air blast (p. 449), M146/M147 take P for a tow-along steady rest (p. 452), and M85/M86 need a robot cell-safe signal or light curtain (p. 442).
- **Option tags.** Most new codes depend on an option or model: live tooling and C axis, Y axis, sub spindle, rotation and scaling, APL, P-Cool, hole blast, chuck pressure hardware, boxway lathes with a tow-along tailstock. They'll get `needs` tags when machine profiles have options (see [Controls and machine profiles](../machine-definitions.md#controls-and-machine-profiles)).
