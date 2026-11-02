# Mitsubishi M800/M80 and M700/M70 programming

| | |
|---|---|
| Manuals | M800/M80/E80/C80 Series Programming Manual, Machining Center System IB-1501277-P · the same series, Lathe System IB-1501275-U · M700/M70 Series Programming Manual, M2/M0 format (English, filed under a Russian name) |
| Copies reviewed | PDFs with text; printed page numbers from the footer |
| Reviewed | 2026-11-01. This adds the `mitsubishi` dialect for machining centers, which inherits `fanuc` and its words |
| Result | Machining-center cycles checked. The lathe and M2/M0 format are noted, not added |

Neither programming manual defines the builder's M codes; only M98, M99 and M198 are the control's. Mazak's EIA mode is based on Mitsubishi, so several points match [mazak-eia.md](mazak-eia.md).

## Machining center (M800, Fanuc-like format)

| Mitsubishi | Page | In the dialect |
|---|---|---|
| Groups match Fanuc's, with G96/G97 in group 17. In one block, the later code of a group wins | 21–25 | Inherited |
| Fixed cycles repeat with **L** (0–9999; L0 doesn't run) | 352 on | L on every cycle, no K |
| G73 X Y Z Q R F P L; G75 is a **circle cutting cycle** (X Y Z R Q P F L) | 352 on | Added |
| **G76 fine bore and G87 back bore shift with I/J/K**, not Q | 352 on | I/J/K on G76 and G87 |
| G84/G74 tap: Q peck, P dwell, F pitch (or E threads per inch), S, plus comma words | 352 on | Q, P, E and S allowed |
| G12/G13 circular cutting; G34, G35, G36 pattern cycles; G187 thread milling | 21–25 | English words under `mitsubishi.mill` |

## Not handled yet

- **Numbers without a decimal point** are type I (least increment) or type II (whole units), set by parameter #1078 (p. 37). GlossCode assumes type I. D, H, L, M, N, O, P, S and T are integer words; a decimal part is ignored.
- **Dwell** (pp. 224–225): G04 X or P. Without a decimal point X is in ms or s depending on #1078; P takes a decimal only if #8112 allows it, and #19014 can scale it. **In G95 mode G04 counts spindle revolutions.** GlossCode keeps the Fanuc millisecond reading.
- **Comma words** on cycles: ,I and ,J (in-position widths), ,R (synchronous tapping on or off) and ,S (return speed).
- **Subprograms** (pp. 440–441): M98 P(up to 8 digits) H(N number inside it) L(1–9999) ,D(device), or M98 <file name>. Without P it calls within the current program. M99 P returns to an N number. Only M98 P is checked.
- G70–G72 and G77–G79 are user fixed cycles, G100–G225 user macro G codes, G37.1 a pattern cycle. Decimal codes (G02.1–G03.4, G06.2, G10.9, G30.1–G30.6) aren't added.

## Lathe (M800), not added

A parameter (cmdtyp) picks one of six G code lists (pp. 23–26):

- Lists 2, 4 and 6 are close to Fanuc system A, **but absolute/incremental is G190/G191**.
- Lists 3, 5 and 7 are close to system B (G33 threads, G77/G78/G79 cycles, G92 spindle clamp, G94/G95 feeds, G83.2 deep hole).
- Every turning and drilling cycle is in group 09 (G70–G76, G90/G92/G94 or G77–G79, G80–G89). G14/G15 are balance cut off/on, G46 is automatic-direction nose comp, and G68/G69 are the facing tool post mirror.

A Mitsubishi lathe profile gets the Fanuc lathe (system A) tables for now. Check the six-column table on pp. 24–26 against the image.

## M2/M0 format (M700/M70), not added

This is Mitsubishi's own format, not Fanuc-like: G22 calls a subprogram and G23 returns, G22.1/G23.1 are stroke check, G44 cancels the tool length (there's no G49), G62 is mirror image, and G68 is a subprogram return. The subprogram section labels both words "L", but its examples (G22 L2200 P5) use L as the program and P as the repeat count. Check section 13.3.1 against the image. This format would need its own dialect.
