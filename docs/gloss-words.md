# Gloss words

The gloss words come from a dictionary of consistent abbreviations: [`data/gcode-words.json`](../data/gcode-words.json) for the codes most controls share, and `words` in each control's file in [`data/controls/`](../data/controls/) for that control's own codes. Each code has a full word and a short one. Pick between them under View › Gloss words.

## Full words (the default)

A full word names the group the code belongs to, then the action: `run.rapid` (G00), `run.feed` (G01), `set.inch` (G20), `tlen.on` (G43), `cycle.peck` (G83). Less common codes can have a third part.

There are 20 fixed groups:

- `run` for moves and other things the machine does on that line
- `set` for modes that stay in effect
- `cycle` for canned cycles
- `call` and `flow` for subprograms and jumps
- `prog` for the program itself
- a feature name for the rest: `spindle`, `cool`, `tool`, `tlen`, `ccomp`, `work`, `axis`, `machine`, `probe`, `thread`, `torch`, `param`, `pattern`, `scale`

A word with a value is its name, a colon and the value: `tool:1`, `toffset:01`, `movz:1.0`, `speed:6000`. Full words leave the unit off (`speed:600`); the active-modes panel says whether it's RPM or surface speed.

## Short words

Short words are the compact style: 3 to 8 characters, made from the group's core letters, an optional alternate and the option. For example `SFWD` (spindle forward), `S2FWD` (second spindle), `CON` (coolant on), `TLON`, `WRK1` (G54), `INCH` and `INCR`. Two letters are used only for a standard abbreviation or a two-letter word (`MM`, `XY`, `IF`, `DO`).

In short words the name and value run together (`T1`, `H01`, `Z1.0`, `S6000`), and a small unit follows the active modes, so `S600` reads `S600 rpm` under G97 and `S600 sfm` under G96.

## In both styles

- Codes that only some controls have are underlined with dots.
- N numbers sit in their own column and aren't repeated in the gloss. Comments aren't repeated either.
- Numbers always show their decimal point (`X1.` reads `1.0`). A distance written without one is shown the way the control reads it, so on Haas and Fanuc `X1` reads `0.0001`.
