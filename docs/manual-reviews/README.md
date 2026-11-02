# Checking GlossCode against a programming manual

Use this procedure whenever a programming manual for a control or machine arrives. Each review gets a file here named after the manual (`haas-vf-1995.md`), or one file for a family of manuals reviewed together (`haas-ngc.md`).

Don't skip a manual because of its title. Haas puts its whole programming reference inside the operator's manual; read those chapters and skip the rest. The manual itself never goes in the repository; see [machine-definitions.md](../machine-definitions.md#definitions-written-from-manuals).

## 1. Get readable text

- **A PDF with a text layer:** `pdftotext -layout`.
- **A scanned PDF** (pdftotext comes back nearly empty): OCR it. Run `pdftoppm -r 200 -gray -png` on each page, then `tesseract page.png out --psm 6`. Set `OMP_THREAD_LIMIT=1` and run four pages at a time, or tesseract crawls. It can take anywhere from a few minutes to over an hour for a few hundred pages, depending on the computer. OCR the high-priority chapters first (step 2) so a stopped run still leaves something useful.
- **No tesseract and no admin rights:** download the `tesseract-ocr`, `tesseract-ocr-eng` and library packages with `apt-get download`, unpack them with `dpkg -x` into a folder in `/tmp`, and point `PATH`, `LD_LIBRARY_PATH` and `TESSDATA_PREFIX` at it.
- **Ruled tables** (G and M code lists with grid lines) come out as noise at 200 dpi. Redo those pages at 300 dpi with `--psm 4`.
- **A text extract** (from a manuals site, or a `.txt` someone made): use it as it is. Look for the page footer the manual prints (Okuma's is `5238-E P-n`) and write a small helper that prints a range of printed pages, so you can cite them.
- Find the offset between the PDF page and the manual's printed page number, so findings can cite the printed number. Each manual has its own footer pattern. OCR misses some footers, but the offset usually stays constant, so work it out from a few pages and use it. Front matter often repeats page labels (i, ii, or 1–n per chapter), so cite the chapter too when that happens.
- `pdftotext -layout` keeps columns side by side but can split a word list across columns; plain `pdftotext` keeps lists together but merges table columns. Try both on cycle pages.
- **Tables and figures don't survive well.** OCR and text extracts scramble table columns and drop figures entirely. Anything that comes from a table (number formats, modal groups, word lists laid out in columns) needs checking against the page image before it's marked verified. If you can't see the page, say so and leave that item unverified.
- Note the manual's edition and the exact control model. If it's a different generation from the dialect you're checking (P200L against a dialect labeled P300), say so in the review and decide whether the differences belong in the existing dialect or a new one.

## 2. Map the manual

Read the table of contents and sort every section into one of these:

| Priority | What to look for | Feeds |
|---|---|---|
| **High** | Address letter list (meanings, ranges, no-decimal behavior) | `numbers`, `addresses`, `missing-decimal` |
| **High** | G-code summary with modal groups and defaults | `modalGroups`, dictionary, `unknown-word`, `foreign` |
| **High** | Canned cycle pages (words, which are optional, alternatives) | `cycles`, `cycleHelp`, word hints |
| **High** | M-code summary (and how many M-codes a line can hold) | dictionary, `mConflicts`, `mPerBlock`, `programEnds` |
| **High** | Subprograms and local calls. On some controls these are under macros (Okuma's CALL and RTS are in User Task) | `subCalls`, `subReturn`, `missing-label` |
| Medium | Dwell, units, work offsets, tool length and cutter comp details | `dwellWords`, `dwellNoDecimal`, `toolLength`, comp checks |
| Medium | Settings or parameters that change how codes behave | notes for the machine definition |
| Low | Macros, programming tutorials, example programs | later parser work; test programs |
| None | Conversational programming, operation, installation, electrical, parts | skip |

Write the map into the review file with page ranges.

## 3. Compare, table by table

Resolve the dialect the machine would use (base plus every layer it inherits), then check each item against the manual:

1. **Every G code in the summary.** Is it in the dictionary? Is its modal group right? Is anything in our tables missing from the manual (flag it in `foreign`, or remove it)?
2. **Every canned cycle.** Required words, optional words, alternatives (`choices`), whether it starts the spindle, and whether it's modal.
3. **Every M code.** Dictionary entry, conflicts, and the M-codes-per-line limit.
4. **Address letters.** What a number with no decimal point means for each letter, ranges, and letters with more than one meaning.
5. **Subprograms.** Call codes, what P names (an O program or an N label), repeat words, return codes.
6. **The checks.** Go through the rule list in [checks.md](../checks.md) and ask for each one whether this control behaves the way the rule assumes. G28, dwell units and feed modes are the usual surprises.
7. **Codes the dialect inherits.** Walk the resolved tables (every modal group, foreign entry and dictionary word the dialect inherits from its base), not only the manual's list. A base code can mean something completely different on this control: on Okuma lathes G20/G21 are home returns, G28 is torque limit cancel and M88/M89 are the air blower.
8. **Words that look like feeds but aren't.** F can be a dwell time (Okuma G04 F), a thread lead (G32, G33, G76) or a pitch; P can be milliseconds. Check every check that reads F, S or P.
9. **Hard-coded codes in the editor.** Search `docs/mockup/index.html` for codes written into the logic (`"G20"`, `"G94"`, `"M06"`). If the control uses that code differently, turn it into a dialect key (as `unitCodes` and `leadCodes` were) rather than special-casing the brand.

Note each difference with its page number. Mark anything the manual doesn't settle as unverified rather than guessing.

**Mill, lathe or option.** Mark each finding as mill, lathe, or depending on an option (live tooling, Y axis, sub spindle, a parameter or setting). The same brand can use one code differently on its mills and lathes: on Haas, M88/M89 are through-spindle coolant on a mill and high-pressure coolant on a lathe, G95 is feed per rev on a mill and a live-tool tap on a lathe, and M10/M11 are a rotary brake on a mill and the chuck on a lathe. Put those words under `<brand>.mill` or `<brand>.lathe` in `machineOverrides`, not under `<brand>`. Don't assume a feature follows the machine type, either: work offsets G54–G59 are on every Haas lathe but on no Okuma lathe, even with live tooling.

**The manuals have errors.** Pages contradict each other, editions disagree, and a workbook can reverse a rule. When two sources disagree, follow the newest manual for that control, write the conflict in the review, and don't mark the item verified on the strength of the losing page.

**When the manuals are on another computer.** Extraction and note-taking can run there, but the compare step needs this repository. Have the notes sent back per manual, covering: the manual and control, G codes that differ from Fanuc, units and no-decimal numbers, work offsets, dwell and M codes per line, subprograms, cycles that differ, M codes that differ, and pages that need checking against the image. Keep the notes in our own words with page numbers.

## 4. Record and apply

- Write the review file: the manual and revision, the map, what differs, what matches, and what's left out. Use our own words. No copied text, tables or drawings.
- Put the differences in the data. Today that means a dialect in `data/gcode-rules.json` (with `inherits`, `verified: true` and `source`), entries in `machineOverrides` in `data/gcode-words.json`, and `cycleHelp` text. Once the loader exists, it means a machine definition file. Run `node scripts/sync-mockup-data.mjs` afterwards.
- A difference that needs new check logic gets a data key (like `mPerBlock`) and a rule in `checks.md`, so other controls can use it.
- Cycles need three things to read well: the entry in `cycles` (with `meaning` for the words a missing-word message should explain), English words for any letters the base dictionary doesn't know (in `cycleHelp` words), and help text in `cycleHelp` under `<brand>.<type>`. Without the `cycleHelp` override, the base help text shows, and it may describe a different cycle with the same number.
- Try the result in the mockup on a short program that hits each difference, and on the old dialect to make sure nothing changed there. Load every example file too. A new check can rightly flag a sample (the Haas one-M-code rule caught `M05 M09` in SHAFT_OD); fix the sample in both `examples/` and the mockup rather than weakening the check.
- A letter the dictionary doesn't know (Haas E on G81/G82) can't be made valid by listing it as an optional cycle word; it needs an address entry first.
- The dictionary overrides don't follow dialect inheritance unless the dialect sets `"inheritWords": true`: then a dialect that inherits `haas` also gets the `haas` and `haas.mill` words, with its own words winning. Use it for a close relative (an older edition, a fork like Tormach on LinuxCNC). Leave it off when the parent's words would hide codes the control doesn't have (Haas and Okuma don't take the `fanuc.mill` words).
- If the manual's terms say it's confidential, the definition goes somewhere private instead (see machine-definitions.md).
