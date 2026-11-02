# Okuma OSP7000L/OSP700L and OSP-U100L/U10L programming manuals (lathe)

| | |
|---|---|
| Manuals | Okuma OSP7000L/OSP700L Programming, Pub No. 3812-E (LE33-008-R1), 1st edition, July 1994 · Okuma CNC Systems OSP-U100L/OSP-U10L Programming Manual, Pub No. EEL3-101-R1, 1st edition, Oct. 1998 |
| Copies reviewed | Scanned PDFs (316 and 344 pages), OCR'd with tesseract at 300 dpi. The G and M code appendix tables were read against the page images. |
| Controls | OSP700L, OSP7000L, OSP-U10L, OSP-U100L lathes: the generation before the OSP-P200L |
| Reviewed | 2026-11-01, against the `okuma` dialect's lathe tables in `data/gcode-rules.json` and `okuma.lathe` in `data/gcode-words.json` |
| Result | The core codes match what the P200L review found. Missing English words and M-code conflicts were added. No separate dialect yet |

These are the controls on the Okuma lathes in the shops Graham knows (not yet confirmed which lathe has which). No confidentiality notice was found. The manuals stay out of the repository; this file records what they say in our own words, with printed page numbers.

## Page map

| Manual | G code table | M code table | System variables | PDF page = printed + |
|---|---|---|---|---|
| OSP7000L/700L | pp. 275–280 | pp. 281–288 | pp. 289–294 | 18 |
| OSP-U100L/U10L | pp. 315–318 | pp. 319–321 | pp. 322–328 | 14 |

The U10L also has an EIA/ISO code table on pp. 313–314. Both manuals cover the same chapters as the P200L: coordinates and word format, G00–G03, threading (G31–G35), nose radius compensation, the compound cycles (G71–G78), LAP (G80–G88), contour generation, User Task and schedule programs. The OSP700L also has two-turret programming, barrier and interference checks, and turret unclamp.

## What matches the existing Okuma lathe tables

- G20 is the home return, G28/G29 are torque limit off/on, G22 is torque skip and G30 is the skip cycle. None of these mean what they mean on Fanuc.
- G31–G35 are thread cycles. G71/G72 are compound thread cycles, G73/G74 grooving, G75/G76 auto chamfer and rounding, G77/G78 tapping.
- G40–G42 nose radius compensation, G50 zero shift and spindle limit, G64/G65 droop control, G90/G91, G94/G95, G96/G97.
- G80–G88 are LAP contour codes. G80 does not cancel a canned cycle here.
- No G54–G59 and no G43 in either table, which agrees with the P200L.
- M83/M84 chuck clamp/unclamp and M88/M89 air blower (OSP700L).

## What was added

- **English words** for codes in both manuals that the dictionary didn't have: turret select G13/G14 (two-turret, OSP700L only), coordinate conversion G136/G137, synchronized tapping G178/G179, the M-tool (live tool) cycles G180–G190, C-axis positioning M15/M16, spindle orientation M19, tailstock and chuck barriers M20/M21 and M24/M25, thread lead axis M26/M27, thread infeed M32–M34 and M73–M75, gear ranges M40–M44, M85 (no return after LAP roughing), reverse turret indexing M86/M87, C-axis connect M109/M110, and C-axis clamp M146/M147.
- **M146/M147.** Both manuals give M146 as unclamp and M147 as clamp. The P200L contradicted itself, so two manuals settle it.
- **M-code conflicts** for those on/off pairs, so `M146 M147` on one line is an error.

## Differences between the two manuals

- The U10L table gives each G code a modal group number and marks one-shot codes. The OSP700L table has no groups but marks optional codes.
- The OSP700L table has codes the U10L doesn't: G13/G14, G17–G19, G62 mirror image, G100, G110/G111, G122/G123, G138, G140–G143 and G152. Most are two-turret or multi-spindle options.
- The U10L M table leaves out M06, M08/M09 and M83/M84 and says the machine builder sets the M-code numbers, with only M02 and M30 fixed. The OSP700L table has them. GlossCode keeps them, since a builder may still use the usual numbers.
- The earlier OSP7000L check (see [okuma-osp-p200l.md](okuma-osp-p200l.md#later-check-2026-11-01-more-manuals)) found codes the P200L has and the OSP7000L doesn't, such as G21, G24/G25 and G124–G129. A program for these older controls that uses one would still read as if the control had it.

## Not settled or not added

- **A separate dialect for the older controls.** It would flag the P200L-only codes and could carry the U10L modal groups. That's worth adding once programs from the shop lathes show what is actually used.
- **Modal groups.** The U10L puts G20, G30, G101–G103, G112/G113 and G132/G133 in the motion group, and G71–G74, G77 and G78 in a modal cycle group. Our tables treat those cycles as one-shot, as the P200L review did. Check the cycle pages before changing that.
- **M codes per line.** Neither table gives a limit. The `okuma` lathe tables keep the P200L's eight.
- **M-tool cycles G181–G190** have English words only. Their words, the G94/G95 rule and the G180 cancel aren't checked yet.
- **Feed plausibility on metric programs.** The mockup assumes inch until the profile sets units, so `F0.1` reads as a large per-rev feed.
