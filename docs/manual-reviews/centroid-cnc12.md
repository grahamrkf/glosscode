# Centroid CNC12 (mill, router and lathe)

| | |
|---|---|
| Manuals | Centroid CNC12 Mill Operator's Manual, Lathe Operator's Manual and Router Operator's Manual, all for v5.42 and later (PDF page = printed page + 1). Lathe also compared with v4.20 (2021), v4.14 (2019) and CNC11 v3.16 (2016) |
| Copies reviewed | PDFs with text. Mill codes pp. 191–301, lathe codes pp. 155–258 |
| Control | Centroid CNC12 (Acorn, Oak, Allin1DC, M400/T400) |
| Reviewed | 2026-11-01. This adds the new `centroid` dialect, which inherits `fanuc` |
| Result | One dialect for current CNC12. Older versions use the same language, so they're listed below instead of getting their own |

The router manual's programming chapters match the mill's: the same G codes, and only M299 differs. Use the mill tables for routers.

## Versions

v3.16 (CNC11) through v5.42 share one G-code language. Newer versions only add codes:

- v4.x adds M17 (prepare for tool change).
- v5.42 adds, on the lathe: G17/G19 (G18 is the default), G37, G61, G64, M06, M38, M221/M222, M291, M294/M295 and M297/M298.

On an older control those codes would be unknown to the control, not different. A machine profile on an older version can note it.

## How it differs from Fanuc

| Centroid | Page | In the dialect |
|---|---|---|
| **M02 ends and restarts** the program (homes Z, rewinds, waits for Cycle Start). **M30 is a custom M code** that does nothing by default. M99 in the main program ends the job | mill 278, 281, 287 | `programEnds` M02/M99; M30 gets an info note and the English "CUSTOM30" |
| G4 P is in seconds (0.01 to 327.67); X is used if P is missing | mill 243, lathe 207 | Already how Fanuc dwell reads; no milliseconds check |
| Mill: no G95. G93 is inverse time and G94 turns it off; F is always per minute | mill 191, 239 | Feed mode group is G93/G94; G95 is an error |
| Mill: no G86, G87 or G88; G76 is fine bore with Q as the pull-off | mill 260–274 | Those three are errors; G76 takes Q |
| Mill cycles have no K or L repeat word | mill 260–274 | K removed from the cycles |
| Rigid tapping G84/G74: Q is the pitch, on every line | mill 268 | Q allowed on G74/G84 |
| Mill groups: scaling G50/G51, rotation G68/G69, envelope G22/G23, path G61/G64 | mill 238–239 | Inherited from Fanuc; polar, G66 and CSS removed |
| Lathe: Fanuc group A. G90/G92/G94 are cycles, G98/G99 feed per min/rev, G50 sets coordinates or the RPM limit, U/W are incremental, X is a diameter | lathe 155–158, 203–204 | Inherited from Fanuc |
| Lathe G71/G72 take the Fanuc two-line form or a one-line form (P Q D U W I K A); G76 the two-line form or a one-line form (X Z K D A I F) | lathe 219–227 | Cycles accept both forms |
| Lathe G90 takes P (return feed length) and L (dwell) | lathe 232 | Added as optional |
| Lathe threads take the lead in E or F | lathe 155 | E allowed on G76 |

English words were added for the Centroid M codes (M02, M10/M11, M17, M19, M25, M29, M30, M39, M41–M43, M50/M51, M91–M95, M100/M101) and for G09, G10, G22/G23, G51, G52, G61, G64, G68/G69, G93 and G94.

## Not handled yet

- **Comments:** ";" runs to the end of the line, and ":" at the start makes a comment line the operator sees (mill pp. 193–194). **Parentheses aren't comments**; they group inside expressions. GlossCode treats ( ) as comments and ";" as an end of block. A dialect key for comment characters is needed (LinuxCNC needs it too).
- **"/" after an M code separates its arguments** (M26 /X, M94 /5/6), and isn't block delete (mill pp. 281, 285).
- **Implied decimals in lathe cycles:** D, P and Q in G71/G72/G74/G75/G76 use an implied decimal when they have a leading 0 or are above the threshold in parameters 245/246 (Q500 = 0.0500 in) (p. 362–363). Not checked. Whether other whole numbers are read as written isn't stated, so the Fanuc least-increment rule is kept for now.
- **Work offsets E1–E18** beside G54–G59 (mill p. 191). The E word isn't in the address list yet.
- **Subprograms:** M98 P9100–P9999 [L], or M98 "file.cnc". An embedded O9xxx … M99 block has to come **before** the first call (the opposite of LinuxCNC), and it's moved into its own file, not run in place (pp. 192, 285–287). Not checked.
- **G65** takes arguments A–Z except G, L, N, O and P, read as #A or #1 (pp. 253–254). Macro lines: GOTO, IF … THEN … ELSE, INPUT "prompt" #var, DEFINE (pp. 235–236). Not parsed.
- **Lathe T word** is ttoo: a new tt changes the tool and oo = 00 cancels the offset. Before v5.42 there's no M06 (p. 158).
- **L sets the move rate** on G28/G30/G53/M91/M92 (F is ignored on those moves), and is the repeat count on M98/G65 (pp. 155–156).
- **Rigid tapping with Q** shouldn't need F, but the no-feed check still asks for one.

## Errors in the manuals

- The mill G83 page (p. 266) carries lathe text ("X should be X0 unless C-axis", an L dwell).
- The lathe G00 page (p. 204) says positions can be absolute "(G90)" or incremental "(G91)", which contradicts G90 being a turning cycle on the lathe.
