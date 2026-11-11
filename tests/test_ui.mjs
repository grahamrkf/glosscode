// Checks of the UI's gloss and checks on a few controls that the sample programs don't cover, run with
//   node tests/test_ui.mjs
// (from the repo root; CI runs it next to the golden files check).
import { loadPage } from "./ui-page.mjs";

const A = loadPage();
let failed = 0;
const eq = (got, want, what) => {
  if (JSON.stringify(got)===JSON.stringify(want)) return;
  failed++; console.error(`FAIL ${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

// The older Okuma lathe controls read Okuma's language: no G54 work offset, and G91 G50 Z-V1 is a zero shift.
let r = A.run("N10 G50 S2000\nN20 G00 X2. Z0.1\nN30 G91 G50 Z-V1\nN40 M30", "gen.lathe.okumau10l", "words");
eq(r.modes[1].wcs, null, "an OSP-U10L lathe has no G54 work offset");
eq(r.words[2], ["N30", "set.incr", "set.coords", "incz:-V1"], "G91 G50 Z-V1 on an OSP-U10L lathe");

// A router reads like its control's mill.
r = A.run("N10 G00 X2. Z0.1\nN20 M30", "gen.router.generic", "words");
eq(r.words[0][1], "run.rapid", "a generic router reads G00");

// On the OSP-E100L (and every Okuma lathe) G30 is a skip cycle, and M99 is tailstock thrust high.
r = A.run("N10 G30\nN20 M99", "gen.lathe.okumae100l", "words");
eq(r.words[0][1], "cycle.skip", "G30 is the skip cycle on an Okuma lathe");
eq(r.words[1][1], "machine.tailstock.thrusthigh", "M99 is tailstock thrust high on an OSP-E100L");

// X1 with no decimal point is the least increment on a Haas, and is flagged.
r = A.run("N10 G20 G90\nN20 G00 X1 Y0.\nN30 M30", "gen.mill.haas", "words");
eq(r.words[1][2], "movx:0.0001", "X1 is 0.0001 in on a Haas");
eq(r.problems.map(p => p.id), ["missing-decimal"], "X1 is flagged");

if (failed){ console.error(`test_ui: ${failed} failed`); process.exit(1); }
console.log("test_ui: all passed");
