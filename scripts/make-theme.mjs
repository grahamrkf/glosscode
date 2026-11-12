// Writes src/ui/css/theme.css: the light and dark value of every colour the UI uses.
//
// The UI's CSS and JavaScript never write a colour as #rrggbb. They write var(--c-rrggbb), named after the colour's
// light-mode value, and this script finds every such name and gives it a dark-mode value worked out from the light
// one: in OKLCH, greys and pale tints flip lightness (white paper becomes a dark surface, dark text becomes light
// text) and strong colours keep their hue but are lifted so they read on a dark background. DARK below overrides the
// result for a few colours where the formula isn't the best pick.
//
// Run with --convert to turn the #rrggbb colours in src/ui/css and src/ui/js into var(--c-rrggbb) first (only quoted
// or CSS-value colours: "#110=" macro variables in comments are left alone). tests/test_ui.mjs fails when a raw colour
// is left or theme.css is out of date, and says to run this.
//
// The named colours a user can change in View › Appearance… (--ink-code, --rapid…) are set at the end of each
// block; js/appearance.js puts the user's own choice on the page over them.
//
//   node scripts/make-theme.mjs [--convert]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const UI = path.join(ROOT, "src/ui");
const OUT = path.join(UI, "css/theme.css");
const SKIP = new Set(["fonts.css", "theme.css"]);

// Colours the user can change, with their light-mode default (a --c- name) and their dark one.
export const NAMED = {
  "--ink-code": ["1b1b1b"],
  "--ink-gloss": ["555555"],
  "--ink-n": ["1b1b1b"],
  "--ink-comment": null,          // the code colour unless the user picks one
  "--rapid": ["e8a33d"],
  "--feed": ["0f6cbd"],
  "--arc": ["0e9384"],
  "--cycle": ["c03d9a"]
};
// Hand-picked dark values. The app background, panels and the editor are the Windows 11 dark greys.
const DARK = {
  ffffff: "#1f1f1f",   // the editor, dialogs and buttons
  f3f3f3: "#2b2b2b",   // the window behind them
  fafafa: "#262626",   // the side panels
  "1b1b1b": "#e6e6e6", // text
  "555555": "#a8a8a8"  // the gloss
};

export function sources(){
  const out = [];
  for (const dir of ["css", "js"]) for (const f of fs.readdirSync(path.join(UI, dir)).sort())
    if (!SKIP.has(f) && /\.(css|js)$/.test(f)) out.push(path.join(UI, dir, f));
  out.push(path.join(UI, "index.html"));
  return out;
}
const norm = h => (h.length===3 ? [...h].map(c => c + c).join("") : h).toLowerCase();
// A raw colour in a CSS value, or a quoted one in JavaScript ("#fff", 'stroke="#888"', "1px solid #ddd").
export const RAW = { css:/(?<=[\s:,(])#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g,
                     js:/(?<=["'\s:,(`])#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_=-])/g };
// Lines that are only a comment (JavaScript) can name macro variables (#101) that look like colours.
export const isCommentLine = l => /^\s*(\/\/|\/?\*)/.test(l);

/* Colour maths: sRGB <-> OKLab (Björn Ottosson). */
const toLin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toSrgb = c => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
function hexToOklch(hex){
  const [r, g, b] = [0, 2, 4].map(i => toLin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
  const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
  const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
  const L = 0.2104542553*l + 0.7936177850*m - 0.0040720468*s;
  const A = 1.9779984951*l - 2.4285922050*m + 0.4505937099*s;
  const B = 0.0259040371*l + 0.7827717662*m - 0.8086757660*s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}
function oklchToRgb(L, C, H){
  const A = C * Math.cos(H), B = C * Math.sin(H);
  const l = (L + 0.3963377774*A + 0.2158037573*B) ** 3;
  const m = (L - 0.1055613458*A - 0.0638541728*B) ** 3;
  const s = (L - 0.0894841775*A - 1.2914855480*B) ** 3;
  return [4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
          -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
          -0.0041960863*l - 0.7034186147*m + 1.7076147010*s];
}
function oklchToHex(L, C, H){
  let rgb = oklchToRgb(L, C, H);
  for (let i = 0; i < 40 && rgb.some(v => v < -1e-4 || v > 1 + 1e-4); i++) rgb = oklchToRgb(L, C *= 0.94, H);   // into the sRGB gamut
  return "#" + rgb.map(v => Math.round(Math.min(1, Math.max(0, toSrgb(Math.min(1, Math.max(0, v))))) * 255).toString(16).padStart(2, "0")).join("");
}
export function darkOf(hex){
  if (DARK[hex]) return DARK[hex];
  const [L, C, H] = hexToOklch(hex);
  if (C > 0.06){   // a real colour: keep the hue, lift it to read on dark, a bit less saturated when it was pale
    const L2 = Math.min(0.86, Math.max(0.66, 0.62 + (L - 0.45) * 0.45));
    return oklchToHex(L2, Math.min(C, 0.16) * (L > 0.85 ? 0.7 : 1), H);
  }
  // A grey or a pale tint: white paper becomes the darkest surface, black text the lightest text.
  const L2 = Math.min(0.94, Math.max(0.14, 0.12 + 0.82 * ((1 - L) / 0.8) ** 0.85));
  return oklchToHex(L2, C * 0.8, H);
}

function convert(){
  let n = 0;
  for (const p of sources()){
    const kind = p.endsWith(".css") ? "css" : "js";
    const s = fs.readFileSync(p, "utf8");
    const t = s.split("\n").map(l => kind==="js" && isCommentLine(l) ? l : l.replace(RAW[kind], (m, h) => { n++; return `var(--c-${norm(h)})`; })).join("\n");
    if (t!==s) fs.writeFileSync(p, t);
  }
  console.log(`Converted ${n} colours.`);
}

export function themeCss(){
  const used = new Set();
  for (const p of sources()) for (const m of fs.readFileSync(p, "utf8").matchAll(/var\(--c-([0-9a-f]{6})\)/g)) used.add(m[1]);
  for (const v of Object.values(NAMED)) if (v) used.add(v[0]);
  const names = [...used].sort();
  const named = dark => Object.entries(NAMED).map(([k, v]) => `  ${k}:${v ? `var(--c-${v[0]})` : "var(--ink-code)"};`).join("\n");
  const block = dark => names.map(h => `  --c-${h}:${dark ? darkOf(h) : "#" + h};`).join("\n");
  return `/* Written by scripts/make-theme.mjs: edit and run that, not this file.
   Every colour the UI uses, light first, then dark. data-theme on <html> is "light" or "dark" (js/appearance.js);
   before it's set, the system's light or dark setting decides. */
:root{
  color-scheme:light;
${block(false)}
${named()}
}
:root[data-theme="dark"]{
  color-scheme:dark;
${block(true)}
}
@media (prefers-color-scheme:dark){
:root:not([data-theme]){
  color-scheme:dark;
${block(true)}
}
}
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  if (process.argv.includes("--convert")) convert();
  fs.writeFileSync(OUT, themeCss());
  console.log(`Wrote ${path.relative(ROOT, OUT)}.`);
}
