// Writes the UI's two data files from the files they come from, so the page never holds a copy of its own:
//   src/ui/data.js     the dictionary (data/gcode-words.json), the rules (data/gcode-rules.json), each control's
//                      own file (data/controls/<id>.json, joined into the two), the built-in subprogram library
//                      (data/library/*.json) and the version (VERSION, for Help › About)
//   src/ui/samples.js  the sample programs (examples/) and a shop's example library
//                      (docs/subprogram-library/examples/*.json), which only the page opened in a browser shows:
//                      the program's build leaves this file out (cmake/bundle-ui.cmake)
// Run from the repo root after changing any of them:
//   node scripts/make-ui-data.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const json = file => JSON.parse(readFileSync(file, "utf8"));
const libDir = (dir, source) => readdirSync(dir).filter(f => f.endsWith(".json")).sort().map(f => ({ ...json(`${dir}/${f}`), source }));
const version = readFileSync("VERSION", "utf8").trim();
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`VERSION "${version}" isn't MAJOR.MINOR.PATCH`);

// Each control's file holds what the page reads in three places: its dialect table (RULES.dialects.<id>), its gloss
// words (DICT.machineOverrides["<id>"], ["<id>.mill"]…) and its canned cycle guide text (RULES.cycleHelp["<id>.lathe"]…).
// "controls" in gcode-rules.json lists the files; RULES.dialects keeps that order.
function withControls(){
  const words = json("data/gcode-words.json"), base = json("data/gcode-rules.json"), rules = {}, overrides = {};
  const files = new Set(readdirSync("data/controls").filter(f => f.endsWith(".json")));
  for (const [k, v] of Object.entries(base)){
    if (k !== "controls"){ rules[k] = v; continue; }
    rules.dialects = {};
    for (const id of v){
      if (!files.delete(`${id}.json`)) throw new Error(`"controls" in data/gcode-rules.json names ${id}, but there's no data/controls/${id}.json`);
      const c = json(`data/controls/${id}.json`);
      const own = o => Object.keys(o || {}).every(key => key === id || key.startsWith(id + "."));
      if (!own(c.words) || !own(c.cycleHelp)) throw new Error(`data/controls/${id}.json: words and cycleHelp keys must be "${id}" or "${id}.<type>"`);
      rules.dialects[id] = c.dialect;
      Object.assign(overrides, c.words);
      Object.assign(base.cycleHelp, c.cycleHelp);
    }
  }
  if (files.size) throw new Error(`Add ${[...files].map(f => f.replace(/\.json$/, "")).join(", ")} to "controls" in data/gcode-rules.json`);
  return { DICT:{ ...words, machineOverrides:overrides }, RULES:rules };
}
const { DICT, RULES } = withControls();

const head = what => `// ${what}\n// Written by scripts/make-ui-data.mjs: edit the files named there and run it, not this file.\n`;
writeFileSync("src/ui/data.js", head("The UI's built-in data: dictionary, rules, built-in subprogram library and version.") + [
  `const DICT = ${JSON.stringify(DICT)};`,
  `const RULES = ${JSON.stringify(RULES)};`,
  `const BUILTIN_LIBRARY = ${JSON.stringify(libDir("data/library", "builtin"))};`,
  `const APP_VERSION = ${JSON.stringify(version)};`, ""].join("\n"));

// The sample programs, in the order the home page lists them, with the machine each was written for (one of the
// example user's machines in js/machines.js) and the subprogram call to show expanded when it opens.
const SAMPLE_FILES = [
  ["POCKET_2X1.nc", "haas_vf2", "N100"], ["FLANGE_OP1.nc", "haas_vf2"], ["SHAFT_OD.nc", "haas_st10"],
  ["CHECKS_DEMO.nc", "haas_vf2"], ["LATHE_CHECKS.nc", "haas_st10"], ["OKUMA_PLATE.MIN", "okuma_m560", "N100"],
  ["BRACKET_0MC.nc", "fanuc_0mc"], ["PLASMA_BRACKET.nc", "hyp_plasma"], ["SLOTS_PLATE.nc", "haas_vf2", "N60"],
  ["NAMEPLATE.nc", "haas_vf2"]];
const listed = new Set(SAMPLE_FILES.map(f => f[0]));
const missing = readdirSync("examples").filter(f => !listed.has(f) && !f.startsWith("."));
if (missing.length) throw new Error(`Add ${missing.join(", ")} to SAMPLE_FILES in scripts/make-ui-data.mjs (machine, expand)`);
const files = SAMPLE_FILES.map(([name, machine, expand]) => {
  // The "%" tape marks are left out, as the sample programs always were in the page.
  const src = readFileSync(`examples/${name}`, "utf8").split(/\r\n|\n|\r/).filter(l => l !== "%");
  while (src.length && src.at(-1) === "") src.pop();
  const meta = `machine:${JSON.stringify(machine)}` + (expand ? `, expand:${JSON.stringify(expand)}` : "");
  return `    ${JSON.stringify(name)}: { ${meta}, src:[\n${src.map(l => "      " + JSON.stringify(l)).join(",\n")}]}`;
});
writeFileSync("src/ui/samples.js", head("The sample programs (examples/) and a shop's example subprogram library, for the page opened in a browser.") + [
  "const SAMPLES = {",
  "  files: {", files.join(",\n"), "  },",
  `  library: ${JSON.stringify(libDir("docs/subprogram-library/examples", "shop"))}`,
  "};", ""].join("\n"));
console.log("Wrote src/ui/data.js and src/ui/samples.js");
