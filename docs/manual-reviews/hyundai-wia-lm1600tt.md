# Hyundai WIA LM1600/1800TT (FANUC 18i twin-turret lathe)

| | |
|---|---|
| Manual | Hyundai WIA LM1600TT/LM1800TT instruction manual extract 1025EN18iBIN1, 2011, 80 pages. Codes on pp. 2-24 to 2-42 (PDF 26–44) |
| Reviewed | 2026-11-01 |
| Result | No data change. The G codes are Fanuc system A; the M codes are builder-specific and belong in a machine definition |

## G codes (pp. 2-24 to 2-26)

The machine uses Fanuc G code **system A**, so the `fanuc` lathe tables apply. The list is a subset of the 0i lathe list (see [fanuc-lathe-and-series-0.md](fanuc-lathe-and-series-0.md)), including G68/G69 as the double-turret mirror image, the live-tool cycles G80–G89 in group 10, G96/G97 and G98/G99.

Two probable errors to check against the page image: G65 is shown in group 06 (Fanuc has it in group 00), and face boring is listed as G86 where the 0i lathe uses G85.

## M codes (pp. 2-27 to 2-42)

These are the builder's own codes and clash with other machines:

- M10/M11 bar feed (not a clamp), M13/M14/M15 live tool CW/CCW/stop
- M33/M34 spindle and coolant on together, M35 both stop
- M68/M69 chuck close/open, M66/M67 chuck pressure
- M128/M129 rigid tap off/on (not M29), M130/M131 reverse rigid tap
- M103–M191 the other spindle's functions, M160–M162 spindle sync, M180–M189 sync and superimposed control

Turret 2's list (pp. 2-35 to 2-42) is the same with the spindles swapped. In the turret 1 list, M168 and M169 are both "chuck close", and M130/M131 are swapped between the two lists.

This is the case for builder M codes living in a machine definition rather than the `fanuc` dialect. The extract has no 2-path wait codes, so it isn't enough for twin-turret programs.
