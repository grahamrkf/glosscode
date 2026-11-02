# Plasma cutting: Hypertherm Phoenix, Tormach and Centroid Acorn

| | |
|---|---|
| Source | Hypertherm Phoenix 9.1 and EDGE Connect R6.1 programmer's references, the Tormach plasma section of the PathPilot documentation, and the Centroid Acorn plasma notes |
| Reviewed | 2026-11-01. No dialect yet; this review records what a plasma machine type would need |
| Result | Plasma needs its own machine type (not mill, not lathe) with per-control M codes and no spindle checks |

## Why it isn't a dialect yet

GlossCode's checks assume a mill or a lathe: a spindle that must be on before cutting, S speeds, tool length offsets, Z depths and canned drilling cycles. A plasma program has none of those. The torch is turned on and off with M codes, the "tool" is a kerf width, and height is handled by the torch height control (THC), not by Z words in most programs. Adding plasma as a dialect of the mill would raise false "spindle off" and "tool length missing" warnings on every cut.

The M codes also differ by control, more than they do between mill brands, so a single generic plasma table would be wrong on most machines.

## What each control uses

**Hypertherm Phoenix and EDGE Connect** (the most common plasma CNC in small fabrication shops):

- G04 X dwell, in seconds.
- G08 repeat, G97/G98 loop start and end.
- G40/G41/G42 kerf compensation, with D naming the kerf value; G43 X sets a kerf directly.
- G59 sets variables. Not a work offset, unlike every Fanuc-style mill.
- G82/G83 oxyfuel mode, G84/G85 plasma mode.
- M07 cut on, M08 cut off. On a mill these are coolant, so the meaning flips completely.
- M09/M10 marker on and off, M36 selects the process, M40/M41 call and end a subroutine, M50/M51 THC off and on.
- Through code mapping, M03/M04 can be set to mean cut on and M05/M06 cut off, so the same program may use either set.
- G94/G95 aren't supported.

**Tormach plasma** (PathPilot plasma, LinuxCNC-based):

- G15 probe for material height, G16 pierce.
- M200–M213 for torch and THC control (pierce, cut height, THC on and off, and similar).
- Otherwise reads G code the way LinuxCNC does.

**Centroid Acorn plasma** (CNC12-based):

- M61 touch off and pierce, M62 torch off and raise, M65 selects a material profile.
- Otherwise reads G code the way Centroid CNC12 does.

## What a plasma machine type would need

- A `plasma` table next to `mill` and `lathe` in each dialect, so the per-control M meanings stay separate.
- A "cut on" and "cut off" code list per control, used in place of the spindle checks: warn when a G01/G02/G03 cut runs with the torch off, and when a program ends with the torch on.
- No checks for S, spindle direction, tool length offsets, or canned drilling cycles.
- Kerf compensation (G41/G42 with D) checked like cutter compensation, without the tool radius.
- Hypertherm's G59 marked as "variables", not a work offset.

## Not handled yet

- Everything above. Plasma programs open today as mill programs and will show spindle and tool warnings.
- Lasers and waterjets were ranked below plasma; Omax waterjets don't use G code.
