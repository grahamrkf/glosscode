# Siemens SINUMERIK ISO mode (840D sl, 828D, ONE)

| | |
|---|---|
| Manuals | SINUMERIK ONE / 840D sl / 828D ISO Milling Programming Manual, 07/2021 (CNC 4.95/6.15), the main source · SINUMERIK 840D sl/840Di sl/828D/802D sl ISO Turning Programming Manual, 06/2009 · SINUMERIK 840D sl/828D ISO Turning Programming Manual, 02/2012 (CNC 4.5), the lathe source · the ISO Dialects function manuals (09/2009, 12/2019, 07/2021), setup only |
| Not used | The 828D NC Programming Manual and Basic Functions manual, and the 808D ADVANCED ISO turning and milling manuals (08/2013, 07/2018), which are for the smaller 808D control. Native Siemens programs aren't covered |
| Reviewed | 2026-11-01, lathe 2026-11-02. This adds the `siemensiso` dialect, which inherits `fanuc` and its words |
| Result | ISO milling and ISO turning (G code system B) added |

The ISO mode is a Fanuc-compatible interpreter inside the Siemens control. Its G code groups match the Fanuc 0i MC (appendix B), so most of the `fanuc` tables apply.

## In the dialect

- **Up to 5 M codes per line** (5.5.7): `mPerBlock: 5`.
- **G290 switches to Siemens mode and G291 to ISO mode** (3.1.2–3.1.3). Each goes alone on its line. English words added.
- **M29 puts the spindle in axis mode** for rigid tapping. English word added.
- Fixed cycles use the Fanuc formats with K repeats (6.1), and dwell P is in internal units without a decimal point (5.3.1), as in the `fanuc` tables.

## Not handled yet

- **Numbers without a decimal point:** machine data MD10884 picks "standard" (Fanuc-like, X1000 = 1 mm on IS-B) or "pocket calculator" (X1000 = 1000 mm) (3.1.6). GlossCode assumes standard.
- **Comments:** ";" is a comment as well as ( ), and brackets nest: `N15 (a(b) X100) Y100` runs only Y100 (3.1.7).
- **"/" block skip can appear anywhere** in a line and skips to the end of it; /1–/9 are separate levels (3.1.8).
- **G04 must be alone on its line** (5.3.1). An option (MD20734 bit 2) makes G04 count revolutions in G95.
- Fixed cycles need a tool length offset active first (6.1.1). Not checked.
- **Subprograms:** M98 P packs a count in front of a 4-digit program number (M98 P30021 runs 0021.mpf three times), or M98 P L. Up to 16 levels. M99 P returns to that N. Up to 10 M codes can be mapped to macros (6.2–6.3, 5.5.6). Only the plain M98 P check runs.
- **G54 P1–P48** extended offsets, G54.1, G05.1 (calls CYCLE305), G72.1/G72.2 contour repetition.
- No ISO and Siemens commands mixed in one block.
- **Manual error:** the printed formats for G73, G76 and G82 leave out Z.

## ISO turning (PGT 02/2012)

The 02/2012 edition has the same G code set and rules as 06/2009. It adds a section on G35/G36 convex (arc) threads and drops "fixed feedrates F0–F9" from the contents.

- **G code system B is the default.** MD10881 picks the system: 0 is B, 1 is A, 2 is C. Fanuc lathes are usually A.
- **The G code table (appendix B) uses system B numbers**, with the A and C equivalents beside them. Motion: G00–G03, G33 threading, G34 variable lead, G35/G36 arc threads, and the G77/G78/G79 single cycles (G90/G92/G94 in A, G20/G21/G24 in C). G96/G97 are group 2. G90/G91 are absolute and incremental (not in A). G68/G69 are the double turret. G94/G95 are the feed modes (G98/G99 in A). G20/G21 are units (G70/G71 in C). Drilling cycles are G80, G83–G85 on the face and G87–G89 on the side (group 10), with G98/G99 for the return level (not in A). Work offsets are G54–G59 and G54 P1–P48, and the default plane is G18. One-shot codes: G04, G05, G05.1, G07.1, G10, G10.6, G28, G30, G30.1, G31, G52, G53, G60, G65, G70–G76 (G72–G78 in C), and G92 to set coordinates or the spindle limit (G50 in A). Also G50.2/G51.2 polygon turning, G12.1/G13.1 TRANSMIT and G290/G291.
- **Numbers:** MD10884 picks standard notation (Fanuc-like) or calculator notation (a number with no decimal point is in mm).
- **Comments** are in nested ( ) or after `;`. A `/` skip works anywhere in a line.
- **Dwell:** G04 X (a decimal is allowed) or P (no decimal), alone on its line. It can count revolutions in G95. In G94, G04 X1000 is 1 s in standard notation and 1000 s in calculator notation.
- **Up to 5 M codes per line.**
- **Subprograms:** M98 P packs a count in front of a 4-digit program number (P30021 runs 0021.mpf three times), with nesting up to 16. M99 Pnnnn returns to that N. An 8-digit option switches to the P/L form.
- **Cycles G70–G76** use Fanuc's two-block formats: G71 U R / P Q U W F S T; G72 W R / P Q U W F S T; G73 U W R / P Q U W F S T; G70 P Q; G74 and G75 R / X(U) Z(W) P Q R F; G76 P(m r a) Q R / X(U) Z(W) R P Q F (example G76 P012055 Q4 R0.5).
- **To check against the image:** appendix B group numbers. The table lists G33 under system A too, where Fanuc uses G32, and has typos ("GG87", and G67 in the C column for G66).

### In the dialect (`siemensiso.lathe`)

- System B: G33 threads (G32 is an error), G77/G78/G79 are the single cycles, G90/G91 are distance and G94/G95 feed modes, and G92 S is the spindle limit (G50 is a warning). G98/G99 get a note that they're the return level here.
- Up to 5 M codes per line.
- English words for the system B codes, G34–G36 and the G68/G69 double turret.
- **A machine set to system A or C reads wrongly**, since GlossCode can't yet pick the system by machine setting. The drilling cycles, calculator notation, the dwell-alone rule and nesting depth aren't checked.

## Native Siemens language (not ISO mode), mapped only

The manuals here are Programming Manual Fundamentals (12/2018, 614 pp; also 03/2013) and Job Planning (12/2018, 962 pp; also 07/2010 V4.3). The older editions have the same chapters on shifted pages, so the pages below are from 12/2018. Native Siemens is a separate language from ISO mode and would need its own dialect and parser work. It isn't planned.

**Fundamentals 12/2018:** block rules, up to 512 characters per block (pp. 40–43); `;` comments and `/` skip (p. 44); tool offsets with D only, no H (pp. 67–90); work offsets G54–G57 and G505–G599, with G500, G53 and G153 (p. 151); tapping G331/G332 (p. 252); CHF/RND (p. 258); frames TRANS, ROT, SCALE and MIRROR, where G58/G59 are programmable offsets and not work offsets (pp. 323–364); M functions (p. 369); G4 dwell with F in seconds or S in revolutions (p. 393); address letters (p. 408, table p. 508); G code table with groups (pp. 519–536).

**Job Planning 12/2018:** variables (p. 21); GOTOF, GOTOB and IF (p. 101); REPEAT (p. 107); loops (p. 113); subprograms with PROC (p. 162), return with M17, RET or RETB (pp. 176–187), and calls by name with P repeats, MCALL, CALL, ISOCALL, PCALL and EXTCALL (pp. 188–207); G290/G291 to switch between Siemens and ISO mode (p. 671); named cycles CYCLE81 (p. 736), CYCLE82 (p. 737), CYCLE83 (p. 740), CYCLE84 (p. 743), CYCLE85 (p. 746), CYCLE86 (p. 747), CYCLE830 (p. 772) and CYCLE840 (p. 781), plus pockets, slots, patterns and turning cycles (pp. 695–822).

**What a native dialect would need:**
- `;` comments.
- D offsets without H.
- G505–G599 work offsets.
- Cycles called by name with parameter lists (`CYCLE81(…)`) instead of G81 with words.
- Subprograms by name with PROC and RET/M17 instead of M98.
- G4 with F or S.
- Frames.
- Typed variables, and GOTOF/GOTOB jumps.
