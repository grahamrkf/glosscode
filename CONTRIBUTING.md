# Contributing to GlossCode

Thanks for helping. This page covers how to get going and the few rules that keep GlossCode trustworthy at the machine.

## Getting started

1. **Try a change without building anything.** Open `src/ui/index.html` in a browser. It's the whole screen with the sample programs built in; `?open=POCKET_2X1.nc` opens one straight away. Almost everything you see (the gloss, the checks, the simulation, the menus) is the JavaScript in `src/ui/js/`.
2. **Find the file.** [docs/where-to-change.md](docs/where-to-change.md) maps the usual jobs to their files. [docs/architecture.md](docs/architecture.md) explains how the parts fit together. Every file in `src/` starts with a comment saying what it holds.
3. **Build the program** only when you change the C core, the platform files or the app: see [docs/building.md](docs/building.md). You need Node 22 for the scripts and tests either way.

## The test loop

```
node scripts/make-ui-data.mjs     # after changing data/, examples/ or VERSION
node scripts/make-goldens.mjs     # records what the UI shows for every test program
git diff tests/golden             # read it before you commit
node tests/test_ui.mjs
ctest --test-dir build            # when you changed C code
```

The golden files in `tests/golden/` record every gloss word, every problem and every toolpath move for each program in `examples/` and `tests/cases/`. A change that alters any of them shows up in the diff, so you can see exactly what changed on screen. If the change is what you meant, commit the new golden files with it. If you fix a bug or add a check, add a short program to `tests/cases/` that shows it and list its machines in `tests/machines.json`.

CI runs all of these, plus the Windows and Linux builds, on every pull request.

## Rules

**Only what a manual says.** Don't add a G or M code, a cycle word or a limit for a control unless you've checked it against that control's programming manual, and say which manual and page in the review (`docs/manual-reviews/`). A table written from general knowledge is marked `"verified": false` and shows a banner in the Problems panel. When manuals disagree, keep both readings with their sources rather than picking one quietly. See [docs/manual-reviews/README.md](docs/manual-reviews/README.md).

**Manuals never go in the repository.** Write facts in your own words; never copy text, tables or drawings from a manual. If a manual's terms say it's confidential, the definition stays private (see [docs/machine-definitions.md](docs/machine-definitions.md#definitions-written-from-manuals)). `manuals/` is in `.gitignore` as a local place for them.

**No shop programs.** Real part programs belong to the shop that made them. Test programs in `examples/` and `tests/cases/` are written for the purpose.

**Words.** Use standard CNC terms (canned cycle, work offset, tool length offset, cutter comp, block delete). In the screen and the docs, the G-code rows are the **code** and the plain-language rows above them are the **gloss**. Gloss words follow the patterns in [docs/gloss-words.md](docs/gloss-words.md): lower case `group.action` full words (`run.rapid`, `spindle.fwd`), values after a colon (`speed:2100`), and short words of 3 to 8 characters.

**Keep docs general.** Describe what GlossCode does, not whose computer it ran on or which outside tools were used to get there.

**Keep it portable.** The core in `src/core/` is standard C only (no `windows.h`, no compiler extensions); anything that differs between Windows and Linux goes in `src/platform/`.

## Pull requests

- One subject per pull request, with a short description of what changes for someone using GlossCode.
- Say what a user will notice in the description; it goes into `CHANGELOG.md` when the next version is released (see [docs/releasing.md](docs/releasing.md)).
- Update the docs page that describes what you changed, and `docs/where-to-change.md` if you add or move a file.
