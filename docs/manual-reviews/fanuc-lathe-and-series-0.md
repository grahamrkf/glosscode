# FANUC 0i-F and 0i-D lathe, and Series 0/00/0-Mate mill

| | |
|---|---|
| Manuals | FANUC Series 0i-MODEL F Operator's Manual, Lathe System, B-64604EN-1/01 (PDF page = printed + 14) · FANUC Series 0i-MODEL D Operator's Manual, Lathe System, B-64304EN-1/02 (printed + 18) · FANUC Series 0/00/0-Mate Operator's Manual, Machining Center, B-61404E/08 (1990s, printed + 21) |
| Copies reviewed | PDFs with text |
| Reviewed | 2026-11-01, against the `fanuc` dialect |
| Result | The lathe cycles were corrected and extended, and Fanuc dwell P is now settled as milliseconds |

## 0i-F and 0i-D lathe

**G code systems.** A Fanuc lathe runs G code system A, B or C, set by parameter 3401 (0i-F pp. 12–15). GlossCode's `fanuc` lathe tables are **system A**:

| | A | B | C |
|---|---|---|---|
| Thread pass | G32 | G33 | G33 |
| Set coordinates / RPM limit | G50 | G92 | G92 |
| Units | G20/G21 | G20/G21 | G70/G71 |
| Repetitive cycles | G70–G76 | G70–G76 | G72–G78 |
| Turn / thread / face cycles | G90/G92/G94 | G77/G78/G79 | G20/G21/G24 |
| Feed per min / per rev | G98/G99 | G94/G95 | G94/G95 |
| Absolute / incremental | X/Z vs U/W | G90/G91 | G90/G91 |

A machine on system B or C needs its own dialect. The existing G91 warning on Fanuc lathes already says so.

**What changed:**

- **G71 and G72 no longer require U, W and F.** F, S and T are optional in the second block (p. 52, p. 62), and the finish allowances U/W can be left out.
- **G73 pattern repeat** (p. 70), **G74 face peck or groove** and **G75 OD/ID peck groove** (pp. 78–80) are now checked cycles. Haas lathes keep their own versions; Okuma lathes switch G75 off (it's auto chamfer there), and LinuxCNC switches all three off.
- **G68/G69 are the turret mirror image** on lathes (group 04), not rotation (rotation is G68.1/G69.1). English words added under `fanuc.lathe`.
- **Dwell:** see the Series 0 section below.

**Matches:** G90 X Z [R] F, G92 X Z [R] F [Q], G94 X Z [R] F (pp. 36–43), G70 P Q (p. 74), G76 two-block form (p. 82), G96/G97, G98/G99, G50 S.

**0i-D vs 0i-F:** the same structure, systems A/B/C included. 0i-F only adds codes (G04.1, G05.1, G10.6, G28.2, G29, G30.2, G35, G37.1/G37.2, G38, G43.7/G44.7, G49/G49.1, G50.1/G51.1, G54.1, G62, G66.1, G68.1/G69.1, G81.1, G83.5/G83.6, G87.5/G87.6). One lathe dialect covers both.

**Not added yet:** the live-tool drilling cycles G83–G89 (face and side drill, tap and bore, with C, K and M as the C-axis clamp; pp. 94–113), polar interpolation G12.1/G13.1, polygon turning G50.2/G51.2, and G36/G37 (their meaning depends on parameter 3405). G74/G75 P and Q are given without a decimal point (in the least increment); that isn't checked. Check the A/B/C table on pp. 13–15 against the image (merged cells).

## Series 0/00/0-Mate machining center (B-61404E)

- **Dwell (p. 63): G04 X takes seconds with a decimal point; G04 P takes no decimal point, in 0.001 s units, so P1000 is 1 second.** The `fanuc` dialect (mill and lathe) now has `dwellNoDecimal: "ms"`, as Haas already did. LinuxCNC, Centroid and Okuma read P differently, so they switch it off.
- The one-shot rule is printed correctly here ("group 00 except G10/G11", p. 28), which confirms the 0i-F sentence on p. 12 is a misprint.
- Differences from 0i-F: no G93; normal direction control is G150–G152 (0i-F uses G40.1–G42.1); G05 is high-speed cycle machining (pp. 29–31).
- **Subprograms (p. 129):** M98 P with a 3-digit count and a 4-digit program number, two levels of nesting. The subprogram starts with O (or ":") and ends with M99.
- **Custom Macro A (pp. 279–296)** uses G65 H(op) P#i Q#j R#k for arithmetic and jumps. GlossCode reads G65 P as a program call, so a Macro A line would be misread. Not handled yet; Macro B is pp. 297–345.
