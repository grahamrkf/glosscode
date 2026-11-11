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

// #72: a bolt circle ends back at its center, so the next G70 with no X Y is about the same center.
A.run("G20 G90\nT1 M06\nG00 X0 Y0 Z1.\nG81 Z-0.66 R0.1 L0 F26.\nG70 I0.5 J90. L2\nG70 I1. J90. L2\nG80\nM30", "gen.mill.haas");
let e = A.interpret();
eq(e.segs.filter(s => s.hole).map(s => [Math.round(s.a.x*1e4)/1e4 + 0, Math.round(s.a.y*1e4)/1e4 + 0]), [[0, 0.5], [0, -0.5], [0, 1], [0, -1]], "the second G70 is about the first one's center");

// Move times: feed per minute, a dwell (P without a decimal is milliseconds on Haas), rapids at 1000 in/min.
A.run("G20 G90 G94\nS1000 M03\nG00 X0 Y0 Z1.\nG01 Z0 F10.\nG01 X10. F20.\nG04 P2000\nG00 Z1.\nM30", "gen.mill.haas");
e = A.interpret();
eq(e.steps.map(s => Math.round(s.t*100)/100), [0, 0, 0, 6, 30, 2, 0.06, 0], "move and dwell times on a mill");
// G96 on a lathe: per rev × the speed worked out at the diameter, capped by G50 S.
A.run("G20\nG99\nG50 S1000\nG96 S500 M03\nG00 X1. Z0.1\nG01 Z-1.9 F0.01\nM30", "gen.lathe.haas");
e = A.interpret();
eq(Math.round(e.steps[5].t*100)/100, 12, "G96 at Ø1.0 is 1910 rpm, clamped to 1000: 2 in at 10 in/min");

// Call nesting: the Haas 1995 control allows 9 levels of M97/M98 and alarms (307) on the 10th.
const nest = n => { let t = "G20 G90\nG00 X0 Y0 Z1.\nM97 P1000\nM30\n"; for (let k = 0; k < n; k++) t += `N${1000 + k*10} G00 X${k + 1}.\n` + (k < n - 1 ? `M97 P${1010 + k*10}\n` : "") + "M99\n"; return t; };
A.run(nest(9), "gen.mill.haas1995"); eq(A.interpret().alarm, null, "9 levels run on a Haas 1995 control");
A.run(nest(10), "gen.mill.haas1995"); e = A.interpret();
eq([e.alarm?.code, e.steps[e.steps.length-1].alarm!=null], ["307 Subroutine nesting too deep", true], "the 10th level alarms on a Haas 1995 control");
// No limit in the manual (Haas NGC subprograms): followed 8 deep, with a note
A.run(nest(10), "gen.mill.haas"); e = A.interpret();
eq([e.alarm, e.notes.length], [null, 1], "no known limit: a note, no alarm");

if (failed){ console.error(`test_ui: ${failed} failed`); process.exit(1); }
console.log("test_ui: all passed");
