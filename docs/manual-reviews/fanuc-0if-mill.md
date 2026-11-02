# FANUC Series 0i-MODEL F, machining center

| | |
|---|---|
| Manual | FANUC Series 0i-MODEL F Operator's Manual, Machining Center System, B-64604EN-2/01, 1st edition (PDF dated Dec. 2015) |
| Copy reviewed | A PDF with a text layer, 488 pages (PDF page = printed page + 14). It's a free re-upload, and its printed page numbers stop around 400, so some appendices may be missing |
| Control | 0i-MF mill |
| Reviewed | 2026-11-01, against the `fanuc` dialect's mill tables in `data/gcode-rules.json` |
| Result | The core tables matched. Six modal groups, the G88 cycle, P on G87 and 26 English words were added. The dialect now has a `source` |

This is the mill-only volume. The common volume (B-64604EN, with no -1 or -2) holds the program format, decimal point and dwell rules, and Custom Macro B. It wasn't available, so those items stay as they were.

## Page map

| Pages | Section | Use |
|---|---|---|
| 12–15 | G code list with modal groups | **High** (check the table against the image: the group numbers sit in merged cells) |
| 16–37 | Interpolation, coordinates | Medium |
| 38–180 | Canned cycles, rigid tapping, corner chamfer and round, other shortcuts | **High** |
| 181–288 | Tool length, cutter and other compensation | Medium |
| 289 | Series 10/11 program format | Medium |
| 290 onward | Axis control | Low |
| Part III | Operation | Skip |
| 393 onward | Parameters | Notes only |

## What matches

- Groups for motion, plane, distance, feed mode (G93/G94/G95), units, cutter comp, tool length, canned cycles, cycle return (G98/G99), CSS (G96/G97) and work offsets G54–G59 (p. 13–15).
- The canned cycles and their words: G73, G74, G76, G81–G86 and G89 (p. 38–74). K is the repeat count, used only in its own block (p. 41). In Series 10/11 format the repeat word is L (p. 289).
- Any group 01 motion code cancels a canned cycle, as G80 does (p. 12, p. 41).
- M98 P calls a program and M99 returns. G65 calls a macro once (p. 289).
- A number with no decimal point is in the least input increment unless parameter 3401 is set for calculator-style input (p. 273).

## What was added

- **Modal groups:** stroke check G22/G23, scaling G50/G51, modal macro call G66/G67, exact stop and cutting modes G61–G64, rotation G68/G69, and polar coordinates G15/G16. Haas inherits these; its own 1995 dialect already had the scaling, exact stop and rotation groups.
- **G88**, boring with a dwell, then a spindle stop and a manual jog out. It needs P. Haas and Okuma mills switch it off, since their manuals don't list it.
- **G87 takes P** (the dwell), as well as Q (the shift).
- **English words** under `fanuc.mill`, so they only show on Fanuc-style mills: G09, G10, G15/G16, G22/G23, G27, G29, G31, G33, G44, G51, G52, G60–G64, G66/G67, G68/G69, G87, G88, G93 and M29 (rigid tap, p. 75).

## Not settled or not added

- **Dwell units.** The examples use P1000 for 1 second (p. 66, p. 70), so P is in milliseconds, but the rule is in the common volume. `dwellNoDecimal` isn't set for Fanuc yet.
- **Corner chamfer and round:** ",C" and ",R" at the end of a G01–G03 line (p. 89–91). The parser doesn't read comma words yet.
- **Decimal codes:** G49.1, G54.1 P, G84.2/G84.3, G40.1–G42.1, G50.1/G51.1, G66.1 and G68.2–G68.4 aren't added. Built-in files only take decimal codes once they've been checked, and the table needs checking against the image.
- **One-shot codes** (group 00, such as G04, G09, G10, G27–G31, G52, G53, G65, G92). They're not modelled as a group. G60 can be made modal by a parameter.
- **G75 and G77–G79** are grinding cycles on this control, not drilling cycles. They aren't added.
- **M codes** come from the machine builder; this volume lists only M98/M99, M29 and the small-hole peck M code. The fanuc M tables are unchanged.
- **Misprint:** p. 12 says every code other than G10 and G11 is one-shot. It means the group 00 codes.
