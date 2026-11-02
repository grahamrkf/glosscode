# GRBL 1.1

| | |
|---|---|
| Source | The GRBL v1.1 README ("List of Supported G-Codes in Grbl v1.1") and the parser in `grbl/gcode.c`, from github.com/gnea/grbl (master). GRBL is GPL software |
| Reviewed | 2026-11-01. This adds the `grbl` dialect, which inherits `linuxcnc` and its words |
| Result | A new dialect for hobby mills, routers and lasers running GRBL |

GRBL follows LinuxCNC's reading of G code (numbers as written, G4 P in seconds, one code per modal group per line), with a much smaller set of codes:

- **G codes:** G0–G3, G4, G10 L2/L20, G17–G19, G20/G21, G28/G28.1, G30/G30.1, G38.2–G38.5, G40, G43.1/G49, G53, G54–G59, G61, G80, G90/G91, G91.1, G92/G92.1, G93/G94.
- **M codes:** M0, M1 (accepted but ignored), M2, M30, M3–M5, M7 (if compiled in), M8, M9, and M56 (if compiled in).
- **Words:** F I J K L N P R S T X Y Z.

## In the dialect

- No canned cycles: G73, G74, G76 and G81–G89 are errors. G80 is accepted.
- G41/G42, G43 H, G64, G95 and G96 are errors, each saying what GRBL has instead.
- M6 is a warning (GRBL rejects it, but most senders pause on it or strip it). There's no tool change code, so there's no "tool length offset missing" check.
- No subprograms: M98/M99 are errors.
- No limit on M codes per line beyond one per group.
- English words were added for G43.1 (dynamic tool length) and G38.2 (probe), which LinuxCNC shares.

## Not handled yet

- `$` system commands (`$H`, `$X`, `$J=`) and real-time characters (`?`, `~`, `!`). They're sent by the sender, not part of a program.
- Laser mode (M4 dynamic power with `$32=1`). GRBL laser programs read as spindle programs.
