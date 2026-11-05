# Converting a program to another control

**Program › Convert to another control…** turns the open program into a program for a different control. For example, it can convert a program from a Haas VF-2 to a Fanuc 0i-MF mill. The converted program opens in a new tab with the target machine, and the source program is left as it was.

A converted program is a draft. Two comment lines at the top say what it was converted from and that it isn't proven. A `proven by` comment from the source is changed to `(WAS proven by … - NOT RUN SINCE CONVERSION)`. Dry run the converted program on the machine before cutting.

## How it works

1. **Read.** The program is read the way its own control reads it, with the same modes and subprogram calls as the editor and simulation.
2. **Lift to meanings.** Each code becomes its full gloss word (`M03` is `spindle.fwd`, Haas `M97` is `call.local`). Each value becomes the number the source control reads. `X1` on a Haas or Fanuc means 0.0001 in, so it is written `X0.0001`. A dwell becomes seconds. Line and program numbers (`P1000`, the `P` and `Q` of `G71`) stay as written.
3. **Write for the target.** Each meaning is written as the target's code for it. If the code number is different, the new number is used: an Okuma `G56 H5` becomes `G43 H5` on a Fanuc. A dwell is written in the target's units. Comments, N numbers and the order of words are kept.
4. **Check.** The result is read by the target control, which flags any word it doesn't know. The result is then checked in three ways:
   - The target's own checks are run. Only problems the source line didn't already have are reported.
   - Each canned cycle's words are compared with the words the target's cycle lists.
   - The two programs are simulated and compared move by move. The first place where the toolpaths differ is marked.

## Levels

Each line gets one of three colours in the review:

| Level | Meaning |
|---|---|
| Green | The same meaning, written directly, and the toolpath matches. |
| Amber | Converted, but worth a look. The reasons include: a builder's M code (check that the target machine has it), a code that only the source control has, a cycle that changes number, a Fanuc-style lathe cycle from G70 to G78 (one-block or two-block forms, set by a parameter), a macro system variable, a problem the target's checks find, or the first move where the toolpaths differ. If either control's tables are still a first draft, no line is green. |
| Red | The target has no code with this meaning. You choose what to do with the line. |

The choices for a red line are:

- **Leave out the code and convert the rest of the line.** This is only offered for M codes and mode settings (`set.*`), because other G codes give the line's other words their meaning. A `(M88 NOT CONVERTED)` comment marks the line.
- **Write the subprogram's lines in here.** This is offered for a local subprogram call such as Haas `M97`, which Fanuc doesn't have. The lines the call runs replace it, once for each repeat (`L`). When every call to a subprogram is written in, the subprogram itself is left out.
- **Comment the line out and finish it by hand.** The whole line becomes `(CONVERT BY HAND: …)`.
- **Keep the words as written.**

GlossCode remembers your choices for each pair of controls (Haas to Fanuc, for example), so the next program starts with the same answers.

## The middle format

Every conversion goes through one readable form, called the middle format. It has one line per block. Codes are written as full gloss words and values as real numbers. The source block follows `|`:

```
N40 spindle.fwd set.rpm S=6000   | N40 M03 G97 S6000
N50 tlen.on H=01 Z=1.0 cool.on   | N50 G43 H01 Z1.0 M08
N100 call.local P1000 (RECT PASS)   | N100 M97 P1000 (RECT PASS)
```

To see it, pick **Middle format** in the review's view list. **Copy middle format** copies it. Because every control only needs a reader into this form and a writer out of it, a new control works with all the others as soon as it has both.

## What it covers so far

- Any pair of controls that write Fanuc-style blocks and are for the same machine type. That covers Haas, Fanuc, Okuma, Mazak, Mitsubishi, Hurco, Centroid, LinuxCNC, PathPilot and GRBL, both mills and lathes. Fagor and Heidenhain Klartext programs can't be converted yet.
- Codes are matched by their full gloss word, so the converter can only be as precise as those words. For example, `cycle.thread` currently covers both the single-pass threading cycle (Fanuc lathe G92) and multi-pass threading cycles. Because of that, a threading cycle that changes number is always amber.
- Okuma `CALL` and `RTS`, and Okuma names for programs and variables, are red for now. A later step will renumber them to `M98 P` and `M99`.
- Builder M codes come from the target machine's file. Without one, they are amber or red.
- Conversion runs in the program's screen code for now. Moving it into the C core, with golden-file tests for each reader and writer, comes later.
