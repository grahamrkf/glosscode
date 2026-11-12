# Gloss words

The gloss words come from a dictionary of consistent abbreviations: [`data/gcode-words.json`](../data/gcode-words.json) for the codes most controls share, and `words` in each control's file in [`data/controls/`](../data/controls/) for that control's own codes. Each code has a full word and a short one. Pick between them under View › Gloss words.

## Full words (the default)

A full word names the group the code belongs to, then the action: `run.rapid` (G00), `run.feed` (G01), `set.inch` (G20), `tlen.on` (G43), `cycle.peck` (G83). Less common codes can have a third part.

There are 21 fixed groups:

- `run` for moves and other things the machine does on that line
- `set` for modes that stay in effect
- `cycle` for canned cycles
- `call` and `flow` for subprograms and jumps
- `prog` for the program itself
- `live` for live tooling and the C axis on lathes (`live.fwd`, `live.drill`, `live.c.on`)
- a feature name for the rest: `spindle`, `cool`, `tool`, `tlen`, `ccomp`, `work`, `axis`, `machine`, `probe`, `thread`, `torch`, `param`, `pattern`, `scale`

Work offsets name the code an operator knows: `work.g54` to `work.g59`, and `work.p7` for an extra offset (Haas G154 P7, or G116, which is the same offset).

### How a full word is built

1. **One idea per part.** A qualifier is its own part: `cycle.bore.dwell`, not `cycle.boredwell`. A thing with a one-word name stays one part (`machine.feedhold`, `machine.holeblast`).
2. **On and off come last**, as their own part: `axis.4.brake.on`.
3. **Opposites use fixed pairs** on every control: on/off, clamp/unclamp, advance/retract, fwd/rev, left/right, cw/ccw.
4. **Direction and side come last**: `cycle.tap.left`, `cycle.pocket.circle.ccw`.
5. **A code that acts on one block only** ends in `.once`: `set.corner.round.once`. No bare numbers as variants.
6. **The same meaning gets the same word** on every control, so a code that means something else on one control gets a different word there.

A word with a value is its name, a colon and the value: `tool:1`, `toffset:01`, `movz:1.0`, `speed:6000`. Full words leave the unit off (`speed:600`); the active-modes panel says whether it's RPM or surface speed.

## Short words

Short words are the compact style: 3 to 8 characters, made from the group's core letters, an optional alternate and the option. For example `SFWD` (spindle forward), `S2FWD` (second spindle), `CON` (coolant on), `TLON`, `WRK54` (G54), `WRKP7` (G154 P7), `LFWD` (live tool forward), `INCH` and `INCR`. Two letters are used only for a standard abbreviation or a two-letter word (`MM`, `XY`, `IF`, `DO`).

In short words the name and value run together (`T1`, `H01`, `Z1.0`, `S6000`), and a small unit follows the active modes, so `S600` reads `S600 rpm` under G97 and `S600 sfm` under G96.

## In both styles

- Codes that only some controls have are underlined with dots.
- N numbers sit in their own column and aren't repeated in the gloss. Comments aren't repeated either.
- Numbers always show their decimal point (`X1.` reads `1.0`). A distance written without one is shown the way the control reads it, so on Haas and Fanuc `X1` reads `0.0001`.
