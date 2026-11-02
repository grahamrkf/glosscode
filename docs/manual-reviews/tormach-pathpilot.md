# Tormach PathPilot (lathe and mill)

| | |
|---|---|
| Manuals | PathPilot User Guide for Lathes UM10751 (Dec. 2020, PathPilot 2.7.1), pp. 129–176 · 15L Slant-PRO Operator's Manual UM10225 (0323A), ch. 6, pp. 107–145 · PathPilot Plasma Guide UM10770 (Jul. 2022, v2.9.0), pp. 104–153 · 1500MX Operator's Manual UM10811 (0423A), ch. 9 · PCNC 1100 Operator's Manual UM10349 (0525A), ch. 7 · PCNC 440 Operator's Manual UM10372 (0124A), ch. 7 |
| Copy reviewed | PDFs with text; printed page = PDF page |
| Control | PathPilot on Tormach lathes (15L and others). PathPilot runs an older LinuxCNC interpreter |
| Reviewed | 2026-11-01. This adds the `tormach` dialect, which inherits `linuxcnc`, with lathe tables only |
| Result | A new dialect. The mill side was added from the PCNC and 1500MX operator's manuals. The dialect stays `verified: false` until the cycle tables are checked against the page images |

Everything in [linuxcnc-2.9.md](linuxcnc-2.9.md) applies: numbers as written, G4 P in seconds, cycles in the motion group, up to 4 M codes, O-word subroutines.

## Differences from LinuxCNC 2.9 (lathe)

- **Always in diameter mode.** There's no G08 (UM10751 p. 141). G08 is an error.
- **No G70–G72, G74, G87, G52, G5.x or G43.1/G43.2** (p. 141–142). These are newer than PathPilot's interpreter. They're errors.
- **G84 X Z R [P] F starts the spindle forward itself**, then reverses at the bottom. Without P the dwell is set automatically (p. 156; UM10225 p. 132). G84 is a checked lathe cycle with `startsSpindle`.
- **A T word alone changes tools.** There's no M06 (p. 164–165), so M06 gets an info note and `toolChange` is off. T is TTWW (T0303); T01–T08 are turret stations and higher numbers are gang tools.
- **M10/M11** unclamp and clamp the collet closer (UM10225 p. 137). English words added, along with M07, M48/M49 and M61.
- **M98 P(n) L(count)** or **M98 P(n) Q(count)** (p. 162). The O(n) block normally comes after M30.

## Differences from LinuxCNC 2.9 (mill)

The mills read G code the way LinuxCNC does: G04 P in seconds, L as the repeat count on canned cycles (1500MX 9.3, the example G91 … R1.8 L3 drills three holes), M06 with T for a tool change, and G28/G30 with .1 to store positions. What's different:

- **G84 tapping** (PCNC 1100 7.4.6, p. 142): G84 X Y Z R [P] F. It starts the spindle itself and reverses at the bottom, as on the lathe. P is optional; without it the dwell is 0.5 s per 1000 rpm. The 1500MX table of supported codes leaves G84 out but describes it elsewhere. In the dialect: `startsSpindle`, so there's no "spindle off" warning before it.
- **G88** (1500MX 9.3): bore, dwell, stop the spindle and wait for the operator to jog out. P is the dwell. LinuxCNC 2.9 accepts G88 without implementing it; PathPilot implements it. In the dialect: a real cycle instead of the LinuxCNC warning.
- **G76** is listed in the 1500MX mill table as multi-pass threading, copied from the lathe. It isn't a fine bore on these mills, and threading isn't available on a mill. In the dialect: an error.
- **G47 engraving** (1500MX 9.2.16): engraves text or a serial number. Z is the depth, R the retract, X Y the start, P and Q the size, D the number of digits. The control rejects it when cutter comp is on, Z or R is missing, or Z is above R. In the dialect: a dictionary word only (see below).
- **G37 and G37.1**: automatic tool length measurement with the tool setter. G37 has a dictionary word.
- **G54.1 P1 to P500** (1500MX 9.2.19): up to 500 work offsets, beyond the nine LinuxCNC has (G54 to G59.3).
- **M codes:** M00, M01, M02, M03 to M05, M06, M07 and M08, M09, M30, M48 to M51, M61, M64 to M66 (the USB I/O kit), M98/M99, M100 to M199 (user M codes), and M301 to M303 for the USB camera.

## Not handled yet

- **U, V and W are A, B and C** on PathPilot (p. 137), not incremental X/Z. A Fanuc-style U or W move would drive a rotary axis. The parser still reads U and W as incremental.
- G76 I, J and K are diameter values, and their signs assume a rear tool post (p. 155). A front-post or gang setup reverses them. Not checked.
- Limits: 256 characters per line, N up to 99,999,999, O labels up to 5 digits (p. 135). Not checked.
- **Plasma** (UM10770): G15 is the workpiece probe and G16 the pierce (p. 124), which clash with Fanuc polar G15/G16. M200–M213 set the torch, heights, delays, volts, amps and gas pressure (p. 140–141). M64/M65 can take several P words on one line. This waits until plasma is in scope; see [plasma-hypertherm-tormach-centroid.md](plasma-hypertherm-tormach-centroid.md).

- **Mill: G47 isn't a cycle in the tables.** A G47 line with a negative Z after a G00 reads as a rapid below Z0, as it does for Haas G47. G47's words aren't checked.
- **Mill: G54.1 P, G37.1 and the decimal codes** need the parser to read decimal G codes. The M301 to M303 camera codes have no dictionary words, since the manuals don't say what each one does.

## Errors in the manuals

- The 1500MX table of supported codes lists G76 as threading on a mill, and leaves out G84 even though the manual describes it.

- UM10225 p. 137 swaps M03 and M04. UM10751 p. 161 (M03 is clockwise) is followed.
- UM10751 p. 167 calls #1–#30 coordinate offsets; p. 168 calls them subroutine arguments, which matches LinuxCNC. p. 168 is followed.
- The group 5 list on p. 140 has only G93/G94, but G95 is supported (p. 159).
- Group 2 lists "G17.1/G17.2/G17.3", probably meaning G17.1/G18.1/G19.1.
- "S0 is OK, but the spindle does turn" should read "does not" (UM10751 p. 164, UM10225 p. 139).
