// Copies data/gcode-words.json, data/gcode-rules.json and the subprogram library into the mockup,
// which embeds them so it works as a single file. The library is data/library/*.json (built in) plus
// docs/subprogram-library/examples/*.json, which the mockup shows as a shop's library (the program leaves
// those out, like the sample programs). Also copies the
// VERSION file into the About window's APP_VERSION. Run from the repo root:
//   node scripts/sync-mockup-data.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const page = "src/ui/index.html";
let html = readFileSync(page, "utf8");
const embed = (name, file) => {
  const json = JSON.stringify(JSON.parse(readFileSync(file, "utf8")));
  const re = new RegExp(`^const ${name} = .*;$`, "m");
  if (!re.test(html)) throw new Error(`No "const ${name} = ...;" line in ${page}`);
  html = html.replace(re, () => `const ${name} = ${json};`);
};
embed("DICT", "data/gcode-words.json");
embed("RULES", "data/gcode-rules.json");

const libDir = (dir, source) => readdirSync(dir).filter(f => f.endsWith(".json")).sort().map(f => ({ ...JSON.parse(readFileSync(`${dir}/${f}`, "utf8")), source }));
// The shop examples sit between sample markers: the program's build drops them (cmake/strip-samples.cmake).
const libRe = /^const LIBRARY = .*;$/m;
if (!libRe.test(html)) throw new Error(`No "const LIBRARY = ...;" line in ${page}`);
html = html.replace(libRe, () => `const LIBRARY = ${JSON.stringify(libDir("data/library", "builtin"))}.concat(/* samples */${JSON.stringify(libDir("docs/subprogram-library/examples", "shop"))}/* end samples */ ?? []);`);
const version = readFileSync("VERSION", "utf8").trim();
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`VERSION "${version}" isn't MAJOR.MINOR.PATCH`);
const verRe = /^const APP_VERSION = .*;$/m;
if (!verRe.test(html)) throw new Error(`No "const APP_VERSION = ...;" line in ${page}`);
html = html.replace(verRe, () => `const APP_VERSION = ${JSON.stringify(version)};`);
writeFileSync(page, html);
console.log("Updated", page);
