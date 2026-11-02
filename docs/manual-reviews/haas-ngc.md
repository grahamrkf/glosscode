# Haas NGC mill and lathe manuals, and the Haas lathe workbook

| | |
|---|---|
| Manuals | Haas Mill Operator's Manual 96-8210 Rev V (Dec 2025) and Rev N (2020); Haas Lathe Operator's Manual 96-8910 Rev N (2020); Haas lathe programming workbook (ST/TL, classic control, © 2015) |
| Copies reviewed | PDFs with a text layer. Printed page = PDF page − 34 for the 2025 mill manual and − 22 for the 2020 one |
| Controls | Haas NGC mill and lathe (live tooling, C axis, Y axis and sub spindle are options on the lathe). The workbook is the classic control |
| Reviewed | 2026-11-01, against the `haas` dialect in `data/gcode-rules.json` and the `haas` overrides in `data/gcode-words.json` |
| Result | Work offsets, the M-code limit, dwell units and several mill-or-lathe codes were missing or wrong; fixed below |

The NGC manuals say "Copy by Permission Only", and the workbook allows copying for teaching but not for profit. None of them go in the repository. This file records what they say in our own words, with printed page numbers.

The operator's manuals hold full programming chapters, so they were reviewed as programming manuals. Only those chapters were read.

## Which parts matter

| Manual | Pages | Section | Use |
|---|---|---|---|
| Mill 2025 | 207–231 | Work offsets, subprograms (M97, M98, M99) | **High** |
| Mill 2025 | 272 | Macro argument table (no-decimal scaling) | Medium |
| Mill 2025 | 317–388 | G-code list with groups, G-code pages, canned cycles | **High** |
| Mill 2025 | 407, 433–453 | G154, M-code list and pages | **High** |
| Lathe 2020 | 207, 292–362 | Subprograms, G-code pages, cycles, work offsets | **High** |
| Lathe 2020 | 391–403 | M-code list and pages, subprogram calls | **High** |
| Workbook | 25–50, 78–142 | Block format, settings, cycles, subprograms | Medium (older control) |

## What was wrong and is now fixed

Mill and lathe both:

- **Work offsets.** Both have G54–G59 and G154 P1–P99, and the lathe has them even without live tooling. The mill also has G110–G129; the lathe has G110, G111 and G114–G129, because G112/G113 are XY-to-XC interpolation there (mill pp. 209, 407; lathe pp. 322, 361–362). The work offset group now lists them, and the dictionary names G110–G129 as work offsets 7–26.
- **One M code per line** (mill p. 433, lathe p. 391). `mPerBlock: 1` moved up from the 1995 dialect to `haas`. This flagged `M05 M09` in the SHAFT_OD sample, so that line is now two lines.
- **G04 P without a decimal point is milliseconds** (mill p. 332, lathe p. 313). `dwellNoDecimal: "ms"` moved up to `haas` too.

Mill only:

- **G73** accepts K with Q as a third way to set the pecks (pp. 369–388). K is now an optional word.
- **M88/M89, G77 back bore** are mill meanings, so they moved from `haas` to `haas.mill` in the dictionary.
- **New dictionary words:** G12/G13 circular pocket, G47 engraving, G70/G71/G72 bolt hole patterns (p. 319), G187 smoothness, M10–M13 4th and 5th axis brakes.

Lathe only:

- **M88/M89 are high-pressure coolant** on the lathe, not through-spindle coolant (lathe M-code list).
- **G95 is a live-tool rigid tap**, not feed per rev. The lathe's feed modes are G98/G99, which the Fanuc lathe base already had.
- **G84 starts the spindle itself**, and F is the lead (lathe G84 page; workbook p. 120). It's now `startsSpindle` and `leadF`, so a coarse tap lead doesn't trip the feed plausibility check.
- **New dictionary words:** G14/G15 spindle swap, G112/G113 XY-to-XC interpolation, M10/M11 chuck, M14/M15 spindle brake, M21/M22 tailstock, M23/M24 chamfer out of thread, M110/M111 sub-spindle chuck, M133–M135 live tool, M219 live tool orient.

## What matches

- M97 P (local N label), M98 P (program), L repeats, M99 return. G65 macro calls.
- Mill cycles G73–G89: required and optional words, G74/G84 starting the spindle, L repeats.
- Lathe one-block G71/G72/G73/G76, G70 finish, G90/G92/G94, G50 speed clamp, X as a diameter, U/W incremental.
- G20/G21: Haas only checks them against Setting 9 and alarms on a mismatch (mill p. 337, lathe p. 316), so treating them as setting the units is close enough for the editor.

## Not settled or not added

- **M99 P** jumps to that N in the current program instead of returning (mill p. 453, 1995 p. 97). The editor doesn't follow jumps.
- **E on G81/G82** (chip-clean RPM) needs an address-letter entry before it can be an optional word, so it still reads as unknown.
- **Lathe G71/G72 depth word**: settled by the 2025 lathe manual (D in the one-block form). See [haas-ngc-lathe-2025.md](haas-ngc-lathe-2025.md).
- **Lathe G241–G246** radial cycles: confirmed by the 2025 lathe manual; C is now required on G241 and G243. See [haas-ngc-lathe-2025.md](haas-ngc-lathe-2025.md).
- **M39** rotates the side-mount changer in the 2020 mill manual (p. 417) and the umbrella changer in the 2025 one (p. 444). One of them is wrong.
- **Model differences.** None of these manuals mention the VF-3 or any Super Speed (SS) model, and none has a travel, RPM or tool count table for VF models. They describe hardware differences only in general terms: gearbox or not (M41/M42), umbrella or side-mount tool changer (tool pre-call, heavy tools, broken tool detection), VR-only G143, and option-locked codes. Which machine has what is set by the user in their machine profile; see [Controls and machine profiles](../machine-definitions.md#controls-and-machine-profiles).
- **G268/G269** are group 14 in the 2025 mill manual and group 02 in 2020. One of them is wrong.
- **G114–G129 on the lathe**: p. 361 maps them to G154 P3–P18, which contradicts p. 362 (G110–G129 = P1–P20). The dictionary follows p. 362, which the workbook also matches (G114 is offset 11). The 2025 lathe manual has the same contradiction (pp. 396–397).
- **The workbook says a fraction on G04 P is milliseconds** (p. 47), the reverse of every other Haas manual. Treated as an error in the workbook.
- **Workbook M110/M111** are the tailstock chuck on the classic lathe but the sub-spindle chuck on NGC. The dictionary uses NGC.
- **The dictionary doesn't follow dialect inheritance**, so `haas1995` doesn't get the `haas.mill` words (it has its own list).
- Live-tool cycles (G95, G186, G195/G196), Y-axis G28 mapping, G150 pocketing, G234/G254 5-axis, and the rest of the mill codes that aren't Fanuc-shaped.
