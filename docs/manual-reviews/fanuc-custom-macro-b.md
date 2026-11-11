# Fanuc Custom Macro B (Series 21i-MB and 21i-TB)

| | |
|---|---|
| Manuals | FANUC Series 21i/210i-MB Operator's Manual B-63614EN/01 (2001), chapter 15 Custom Macro · FANUC Series 21i/210i-TB Operator's Manual B-63604EN/01 (2002), chapter 15, for the lathe differences only |
| Copy reviewed | PDFs with a text layer, read from a text extract. No page images were checked. In chapter 15 the printed page = PDF page − 21 (MB) and − 24 (TB). The MB offset drifts outside chapter 15 (− 15 in the alarm list) |
| Why these | The common volume of the 0i-F manual (B-64604EN), which holds Custom Macro B for the control GlossCode's `fanuc` dialect follows, isn't available. The 21i chapter is the closest Fanuc source we have. It's an older generation, so anything the 0i-F added (SETVN, for one) isn't in it |
| Reviewed | 2026-11-05, against the macro reader (`evalExpr` and `expand`, now in `src/ui/js/library.js`), which the simulation and the subprogram library share |
| Result | Six fixes in the expression reader. Everything else matched, or is noted below |

Page numbers below are MB printed pages unless marked TB.

## What changed in GlossCode
- **`ATAN[a]/[b]`** is the only arctangent form in this manual (p. 299). GlossCode read it as the one-argument ATAN of a, divided by b, which gives a wrong angle. It now gives the angle of the point (b, a) from 0 to 360 degrees, which is the control's range with parameter NAT (6004#0) off. With NAT on the range is −180 to 180, so `ATAN[-1]/[-1]` gives 225 or −135. Machines with NAT on aren't covered yet. A one-argument `ATAN[x]` is still read, for other controls.
- **`ROUND`, `FIX` and `FUP` work on the size of the number** (p. 300): FUP[−1.2] is −2 and FIX[−1.2] is −1. GlossCode had FIX and FUP right, but ROUND used JavaScript's rounding, which makes ROUND[−1.5] −1. It's now −2.
- **New functions:** ASIN, ACOS, LN, EXP, BIN and BCD (pp. 298–300). The ones that alarm on the control (ASIN or ACOS outside ±1, LN of 0 or less, SQRT or BCD of a negative number, BIN of a digit above 9) now stop the expansion with that reason. ASIN returns −90 to 90 degrees. On the control it's 270 to 90 with NAT off (so a negative angle reads as 360 minus it), which only matters if the result is used as a position.
- **`AND`, `OR` and `XOR` work bit by bit** (p. 298). For conditions written as `[#1 GT 0] AND [#2 LT 5]`, each side is 1 or 0, so the result is the same as before. XOR is new.
- **`#[expression]`** reads the variable whose number the expression gives (p. 285), as in `#[#1+#2-12]`. Assigning to one (`#[500+#4120]=…`) isn't supported yet.

## What matches
- **Variables** (pp. 285–288): #0 is always null; #1–#33 are local; #100–#149 (optionally to #199) are common and cleared at power-off; #500–#531 (optionally to #999) are kept; #1000 and up are system variables.
- **Null in arithmetic and comparisons** (pp. 287, 307): null counts as 0 in arithmetic, except that `#2=#1` keeps it null. Null differs from 0 only in EQ and NE. So `#1 GT 0` is false and `#1 GE #0` is true with #1 null. GlossCode already behaves this way.
- **Null in a word** (p. 286): `X#2` with #2 null drops the whole word rather than reading as X0. GlossCode already leaves the word out.
- **Rounding a word** (p. 286): a value used in an address rounds to that address's least increment. GlossCode writes 0.0001 in or 0.001 mm.
- **Control statements** (pp. 304–307): `GOTO n`, `IF [ ] GOTO n`, `IF [ ] THEN` with one statement, and `WHILE [ ] DOm … ENDm` with m from 1 to 3. The comparisons are EQ, NE, GT, GE, LT and LE, with no symbols.
- **G65 argument specification I** (p. 310): matches `ARG_VAR`. G, L, N, O and P can't be passed.
- **Alarm** (p. 290): `#3000=n (MESSAGE)` raises alarm 3000+n with the message, which is what GlossCode shows.

## Not settled or not added
- **Precedence** (p. 300): on the control AND sits with `*` and `/`, and OR and XOR with `+` and `−`. A condition only works there when each comparison has its own brackets: an unbracketed `[#1 GT 0 AND #2 LT 5]` reads as `#1 GT [0 AND #2] LT 5`. GlossCode still reads the unbracketed form as two comparisons. A check that flags it would help, since it misbehaves on the machine.
- **Limits not checked yet:** five levels of brackets, counting function brackets (alarm 118, p. 301); WHILE loops nested deeper than three or crossing each other (alarm 124, p. 307); a jump into a loop (prohibited, p. 307); macro calls nested more than four deep (p. 309); `O#1`, `N#3` and `/#2` (p. 288); and GOTO to an expression (`GOTO#10`, p. 304), which GlossCode doesn't follow.
- **Argument specification II** (p. 311): A, B and C, then up to ten I/J/K sets filling #4–#33. GlossCode reads only specification I, so a second I on a G65 line isn't understood.
- **Calls other than G65:** G66/G67 modal calls (p. 314), G-code and M-code macro calls set by parameters 6050–6059 and 6080–6089, M-code subprogram calls 6071–6079, T-code calls (pp. 316–319), and the interrupt macro M96/M97 (pp. 333–342).
- **Subprograms** (pp. 128–131): `M98 P51002` runs O1002 five times (the repeat count goes in the leading digits; an L word only appears in the Series 10/11 tape format, p. 356). `M99 Pn` returns to sequence number n. `M99` in a main program loops back to its start.
- **System variables** (pp. 289–297) aren't read. The ones programs most often use: #3001/#3002 clocks, #3003/#3004 single-block and feed-hold control, #3006 stop with message, #3901/#3902 parts count, #4001–#4022 and #4102–#4130 modal information, #5001–#5104 positions, and #5201–#5324 work offsets (G54 is #5221–#5224). Several numbers mean different things on mills and lathes (TB p. 256 onward): #4002 is the plane on a mill but G96/G97 on a lathe, and #2501/#2601 are G54 X/Y on a mill but the work shift on a lathe. Any table of them has to depend on the machine type.
- **External output** (pp. 329–332): POPEN, BPRNT, DPRNT and PCLOS aren't read.
- **Timing** (pp. 322–325): macro statements run as they enter the buffer, so #3000, #3003, #3004 and #3006 can take effect up to two blocks early, and position variables read during motion are uncertain. A non-buffered M code or `G53` just before fixes it. This is a candidate check.
- **MOD** appears only in the TB precedence list, with no format (TB p. 265), and not at all in MB. It's left out.

## Pages to check against the image
The text extract garbled: the comparison symbols on p. 305; the evaluation-order markers on p. 300; the formula table on p. 301; the nesting diagrams on p. 307; the timing diagrams on pp. 312 and 322–324; the merged cells of the position table on p. 295; and TB tool-offset table 15.2(c) on p. 256, which repeats #12001 in two columns. The argument tables (pp. 310–311), the parameter tables (pp. 316–318), the modal table (p. 294), the work offsets (pp. 296–297) and alarms 110–129 (pp. 768–769) came through cleanly.

Apparent errors in the manual: alarm 128 gives the GOTO range as 0–9999 (p. 769) where chapter 15 says 1–99999 (p. 304); and p. 331 labels the second DPRNT case PRT=0, where TB p. 293 says 1.
