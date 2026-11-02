# LinuxCNC 2.9 G-code reference

| | |
|---|---|
| Manual | LinuxCNC Documentation V2.9.7, 22 Oct. 2025 (printed page = PDF page − 55). The linuxcnc.org G, M and O code pages are the same text |
| Copy reviewed | The PDF, chapter 11 G-code Programming (pp. 833–951) and 2.6 Lathe user information (pp. 55–62) |
| Control | The LinuxCNC interpreter (rs274ngc). One interpreter serves mills and lathes; G7/G8, G70–G72 and G76 are for lathes |
| Reviewed | 2026-11-01. This adds the new `linuxcnc` dialect, which inherits `fanuc` |
| Result | A new dialect with its own number, dwell, cycle, comment and subprogram rules. Several parser features are still missing (see the end) |

LinuxCNC is GPL software and its documentation is published openly, so this dialect can ship built in.

## How it differs from Fanuc, and what the dialect does about it

| LinuxCNC | Page | In the dialect |
|---|---|---|
| A number means what it says: X1 is one unit, not one least increment | 856 | `numbers.noDecimal: "asWritten"`, so `missing-decimal` doesn't fire |
| G4 P is in seconds and takes a decimal. There's no G4 X. Cycle P words are seconds too | 882 | `dwellWords: ["P"]`; no `dwellNoDecimal` |
| Canned cycles are in the motion group (group 1), so any G0/G1 cancels them, and G1 with G81 on one line is an error | 868, 907 | The cycles moved into `motion`; the separate `canned cycle` group is gone |
| The repeat word is L, not K (L0 is an error) | 908 | Every mill cycle takes L, none takes K |
| G76 is lathe threading (P Z I J K, plus R Q H E L), never fine bore | 904–906 | The mill G76 cycle is removed with an error; the lathe G76 has the LinuxCNC words and help |
| G70–G72 name an O-subroutine with Q for the profile | 901–902 | Lathe G70/G71/G72 require Q, with help text |
| G90/G91 are absolute/incremental on a lathe too; G92 is a coordinate offset; G94/G95 set the feed mode; G98/G99 are the cycle return | 868 | Lathe G90/G92/G94 cycles removed, feed mode is G93–G95, G98/G99 give an info note |
| G74/G84 tap with a floating holder; rigid tapping is G33.1 | 892, 903, 917 | Tap cycles keep P as an optional dwell; M29 is flagged |
| G87 and G88 are accepted but not implemented | 918 | Warning |
| No G50/G51, G68/G69, G15/G16, G65–G67, G31, G12/G13, G44 or G32 | 868–921 | Each one is an error that says what to use instead |
| No G50 on a lathe; G96 D sets the spindle limit | 921 | `speedClamp: null`, so `css-no-clamp` doesn't ask for G50 |
| Up to 4 M words per line | 865 | `mPerBlock: 4` |
| G43 H and G41/G42 D are optional (they default to the current tool) | 840, 885 | The required-word hints are removed |
| M98 P [L] calls O(n) … M99 (Fanuc style, on by default). The O(n) block comes after the call | 936–937 | `subCalls` M98; G65 removed |

English words were added for G7/G8, G10, G33, G52, G61, G64, G93, M07, M19, M48/M49, M61–M68 and M70–M73, plus the lathe meanings of G70–G72, G90–G99 and G76.

## Not handled yet (needs parser work)

- **";" is a comment** on LinuxCNC, but GlossCode splits a line into blocks at ";", as on Fanuc. A dialect key for the comment character is needed.
- **O-word subroutines and flow control:** `o100 sub` / `endsub`, `o100 call [args]`, `return`, `if` / `while` / `do` / `repeat`. The tokenizer only knows the CALL, RTS and GOTO keywords, so `sub` reads as the letters S, U, B.
- **Named parameters and expressions:** `#<name>`, `#<_global>`, `[ ]` expressions and functions.
- **Polar words** `@` and `^`, and the spindle-select word `$`.
- **Decimal codes:** G5.x, G33.1, G38.2–G38.5, G41.1/G42.1, G43.1/G43.2, G59.1–G59.3, G61.1, G64 P Q, G71.1/G71.2, G72.1/G72.2, G90.1/G91.1, G92.1–G92.3. Not added until decimal codes are handled.
- **U, V and W are separate axes** on LinuxCNC, not incremental X/Y/Z. The columns still put U under X and W under Z.
- **Long dwells:** a Fanuc-style `G4 P1000` means about 17 minutes here. There's no check for an unusually long dwell yet.
- **Two codes from one group** are an error on LinuxCNC (Fanuc uses the last one). The modal clash check already reports them; its wording mentions both possibilities.
- **Fixed order of execution** within a line (p. 872–873), not left to right. Not modelled.
- The manual's group table leaves G70–G72, G74 and G5.x out of group 1, though the quick reference lists them. GlossCode follows the quick reference.
