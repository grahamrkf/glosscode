# Hurco WinMax NC programming, mill and lathe (ISNC)

| | |
|---|---|
| Manuals | Hurco WinMax Mill NC Programming 704-0116-310 Rev B (Feb. 2010, WinMax v8), all NC · WinMax Mill Programming 704-0116-501 Rev D (Jun. 2015, v9.1/10.1), chapter 3 NC Programming only · WinMax Lathe NC Programming v546NC (Jan. 2018), all of it (lathe, ISNC only) |
| Copies reviewed | PDFs with text. Pages are chapter-page |
| Not used | The conversational chapters (out of scope). The WinMax lathe NC manual isn't available; the lathe conversational, options and getting-started manuals only have settings |
| Reviewed | 2026-11-01. This adds the `hurco` dialect for ISNC (industry standard NC), which inherits `fanuc` and its words |
| Result | ISNC mill and lathe tables added. Hurco BNC (Basic NC) is not |

The 2015 manual has the same G code list as 2010 and adds M16/M17, M42, M51, M70, M90/M91, M142–M159, M170–M177 and M210–M214.

## Two NC dialects on one control

WinMax runs **ISNC** (Fanuc-like) or **Hurco BNC** (p. 1-9). Some codes mean different things:

| | ISNC | BNC |
|---|---|---|
| Units | G20/G21 | G70/G71 |
| G74 / G75 | Left-hand tap / – | Single / multi-quadrant arcs |
| G86 | Bore, rapid out | Bore with spindle orient |
| G87 | Back bore | Chip breaker |
| G88 | Bore, dwell, manual out | Rigid tap |
| Cycle R and Z | R is an absolute level and required | R is a positive distance from the initial point (G99 only); Z is always positive and incremental |

GlossCode's `hurco` dialect is ISNC. BNC would need its own dialect.

## What the dialect does

| Hurco ISNC | Page | In the dialect |
|---|---|---|
| **Numbers mean what they say** (X1 is one unit). Whole numbers are scaled only in F (BNC), R rotation, P/X dwell and P scaling | 1-10 | `noDecimal: "asWritten"` |
| Dwell G04 P or X in seconds, 0.001–9999.999. A whole-number P is scaled by 0.001 (or 0.0001, by parameter), so P5 is 0.005 s | 2-20 | Inherits Fanuc's millisecond P check |
| **No G95, G96 or G97**; feed mode is G93/G94 (G94.1 too) | 2-4 to 2-7 | G95 and G96 are errors, G97 an info note |
| Groups otherwise match Fanuc: scaling G50/G51, macros G65–G67, G61/G64, rotation G68/G69, polar G15/G16 | 2-4 to 2-7 | Inherited |
| Cycles take **K or L as the repeat count, 1–6** (K0/L0 stores the data only), P dwell, Q peck or shift, I/J shift | 2-99 | L added to every cycle |
| Several M codes per line; M00/M02 should be alone or last | 5-2 | No limit set |
| M05 also turns the coolant off; M07 mist, M08 flood, M09 both off, M10 both on; M12/M13 rotary clamp; M21 lube; M25 Z to tool-change height; M29 rigid tap | 5-2 to 5-4 | English words under `hurco.mill` |

## Lathe (v546NC)

Pages are chapter-page. The lathe manual documents ISNC only; there's no BNC chapter.

- **Numbers mean what they say** (X1 is 1 unit), as on the mill (1-13). Integers are scaled only for F in BNC, R, the P and X dwell, and P scaling. T runs 0–999999999 with T00 cancelling offsets; N takes up to 9 digits (1-9).
- **The G codes mix Fanuc systems A and B** (table 2-4 to 2-5). From system B: G77 OD/ID cycle, G78 threading cycle and G79 facing cycle in group 01, G90/G91 for absolute and incremental, G94/G95 for feed per minute and per rev, and G98/G99 for the return level. From system A: U/W incremental moves on every line (2-6), G50 or G92 to set coordinates or the maximum spindle speed, and G78 or G92 for threading. G92 also sets work offsets (2-87).
- **G07 is radius programming and G08 diameter** (the default), group 21. Neither is on a Fanuc 0i, and LinuxCNC uses them the other way round.
- Other groups: G70–G75 are one-shot (group 00), G76 is group 01, G18 is the default plane, work offsets are G54–G59 plus G54.1–G54.93, G93 is inverse time, G96/G97 are group 02, and G101–G108 map axial and radial surfaces, with G109 for turning mode. G152 moves W. An unknown code stops with an error; two codes from one group on a line: the last wins.
- **Dwell** (2-11 to 2-12): G04 P, X or U. P takes no decimal point and is in milliseconds (P3000 is 3 s). X and U take a decimal, but the page also says "X10 is X10.0", which contradicts the scaling rule on 1-13; needs the page image. In G95 the dwell counts revolutions.
- **Repetitive cycles:** G70 P Q [F S T] (2-46); G71 U R / P Q U W [F S T] (2-48); **G72 U R / P Q U W, where the first block's depth is U, not Fanuc's W** (2-51); G73 U W R / P Q U W (2-54); G74/G75 R / X Z P Q R F S T (2-56, 2-58); G76 P(6 digits) Q R / X(U) Z(W) R0 P Q F (2-60).
- **Single cycles:** G77 X(U) Z(W) [R] F (2-62), G78 X Z [R] F (2-64), G79 X(U) Z(W) [R] (2-65).
- **Drilling cycles** (2-67 to 2-82) have no R plane and no repeat word, and take S: G81 X Z F S; G83, G83.1, G84 and G87 with X Z P Q F S; G84.2 (or G84 with M29) rigid tap; G85, G86 and G88 with X Z P F S; G89 X Z F S.
- **Subprograms:** G65 P with arguments and L (up to 999 times), G66/G67 modal. M98 P packs a count of up to 4 digits in front of the 4-digit program number, as on the mill (2-39).
- **M codes come from a translation list** that can be edited, imported and exported (3-2), so these are defaults: M33/M34/M35 live tool forward, reverse and stop; M103–M105 sub spindle; M12/M13 turret index reverse and forward; M19 orient; M66/M67 chuck pressure, M68/M69 chuck close and open, M60/M61 OD/ID chucking, M168/M169 sub-spindle chuck; M20–M23 bar feed; M24/M25 and M110/M111 conveyors; M57–M59 part catcher; M71/M72 tool setter; M78/M79 tailstock quill; M31/M32 counters; M85/M86 door; M91/M92 single block; M130/M131 turning and milling mode; M41 C clamp; M133 C hold. No limit on M codes per line is stated.

### In the dialect (`hurco.lathe`)

- Numbers as written.
- G90/G91 are distance codes and G94/G95 feed modes, so the editor tracks absolute/incremental and the feed mode from them. G91 isn't flagged.
- G77, G78 and G79 are the single cycles; G90 and G94 are no longer cycles. G92 is left as an ordinary code, since it can be a threading cycle or a coordinate set.
- English words for G07/G08, G77–G79, G90–G95, G98/G99 and the default M codes (turret, live tool, chuck, quill, turning/milling mode). The M words say "Hurco default", since a shop can change the list.

## Not handled yet

- **The repeat range 1–6** isn't checked.
- **Dwell is modal** and carries into the cycles that follow (p. 2-20).
- **M98 P** packs a repeat count (up to 4 digits) in front of a 4-digit program number: M98 P60050 runs program 50 six times (p. 5-12). The O block sits in the same file after M02. Only the plain M98 P check runs.
- **User G and M codes** (G01–G255, M01–M255) can be mapped to subprograms (p. 1-20). Macros are in chapter 6 (option).
- The first Z after a tool change has to be absolute (p. 5-7). Not checked.
- Decimal codes: G02.4/G03.4, G05.1–G05.3, G07.2/G07.3, G08.1/G08.2, G41.2, G43.4, G50.1/G51.1, G54.1, G68.2/G68.3, G94.1.
- The group defaults are shaded in the table on PDF pp. 48–51 and should be checked against the image.
- **Lathe:** the drilling cycles (no R, X Z P Q F S), the G72 first-block U, G92 as a threading cycle, G07/G08 changing how X is read, dwell revolutions in G95, and conflicts between the live tool M codes. The dwell note suggests a decimal on P, which this control doesn't accept on P.
