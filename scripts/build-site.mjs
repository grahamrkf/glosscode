// Puts the website together (published to GitHub Pages by .github/workflows/pages.yml):
//   <out>/index.html      the landing page (site/index.html)
//   <out>/download/       desktop downloads and how to install them (site/download/)
//   <out>/app/            the web app: the UI with the web bridge, the core as WebAssembly, offline copy
//   <out>/try/            the browser demo: the UI on its own, with the sample programs, nothing saved
//
//   node scripts/build-site.mjs --wasm build-web/core.wasm [--out _site]
//   node scripts/build-site.mjs --wasm build-web/core.wasm --app-only --out <folder>   (the self-host package)
//
// core.wasm comes from scripts/build-wasm.sh. The web app is the UI from src/ui with these changes, the same
// ones cmake/bundle-ui.cmake makes for the program: the sample programs (samples.js and the example
// machines between the "/* samples */" marks in js/machines.js) are left out. src/web/bridge-web.js is loaded
// first, so the UI finds window.GlossCodeNative and opens and saves real files, as in the program.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const wasm = opt("--wasm"), out = opt("--out") || "_site", appOnly = args.includes("--app-only");
if (!wasm || !existsSync(wasm)) { console.error("Needs --wasm <core.wasm> (scripts/build-wasm.sh builds it)."); process.exit(1); }
const VERSION = readFileSync(join(ROOT, "VERSION"), "utf8").trim();
const src = p => join(ROOT, p);
const must = (text, find, what) => { if (!text.includes(find)) throw new Error(`${what}: "${find}" not found`); return text; };
function files(dir){   // every file under dir, as paths relative to it, sorted
  const list = [];
  (function walk(d){ for (const n of readdirSync(d).sort()){ const p = join(d, n); statSync(p).isDirectory() ? walk(p) : list.push(relative(dir, p).split("\\").join("/")); } })(dir);
  return list;
}

rmSync(out, { recursive:true, force:true });
mkdirSync(out, { recursive:true });

// The UI copied into a folder, with the logo beside the page instead of two folders up.
function copyUi(dir){
  cpSync(src("src/ui"), dir, { recursive:true });
  mkdirSync(join(dir, "assets"), { recursive:true });
  cpSync(src("assets/logo"), join(dir, "assets/logo"), { recursive:true });
  const page = join(dir, "index.html");
  writeFileSync(page, must(readFileSync(page, "utf8"), '"../../assets/logo/', "index.html logo").split('"../../assets/logo/').join('"assets/logo/'));
}

/* The web app */
const app = appOnly ? out : join(out, "app");
copyUi(app);
rmSync(join(app, "samples.js"));
{
  const page = join(app, "index.html");
  let html = readFileSync(page, "utf8");
  html = must(html, '<script src="samples.js" data-samples></script>\n', "index.html samples").replace('<script src="samples.js" data-samples></script>\n', "");
  html = must(html, '<script src="data.js"></script>', "index.html data.js").replace('<script src="data.js"></script>', '<script src="bridge-web.js"></script>\n<script src="data.js"></script>');
  html = must(html, "<title>GlossCode</title>", "index.html title").replace("<title>GlossCode</title>", [
    "<title>GlossCode</title>",
    '<meta name="description" content="G-code editor with a plain-English gloss above every line of code.">',
    '<meta name="theme-color" content="#f3f4f6">',
    '<link rel="manifest" href="manifest.webmanifest">',
    '<link rel="icon" href="icons/glosscode.svg" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="icons/glosscode-256.png">'].join("\n"));
  writeFileSync(page, html);
  const mj = join(app, "js/machines.js");
  let m = readFileSync(mj, "utf8"), n = 0;
  m = m.replace(/\/\* samples \*\/[\s\S]*?\/\* end samples \*\//g, () => (n++, "null"));
  if (!n) throw new Error("js/machines.js: no /* samples */ marks");
  writeFileSync(mj, m);
}
writeFileSync(join(app, "bridge-web.js"), must(readFileSync(src("src/web/bridge-web.js"), "utf8"), "__GC_VERSION__", "bridge-web.js").replace("__GC_VERSION__", VERSION));
cpSync(wasm, join(app, "core.wasm"));
cpSync(src("src/web/manifest.webmanifest"), join(app, "manifest.webmanifest"));
mkdirSync(join(app, "icons"), { recursive:true });
for (const f of ["glosscode-128.png", "glosscode-256.png", "glosscode-512.png", "glosscode.svg"]) cpSync(src("assets/logo/" + f), join(app, "icons", f));
{
  const list = files(app);
  const hash = createHash("sha256");
  for (const f of list) hash.update(f + "\0").update(readFileSync(join(app, f)));
  const sw = must(must(readFileSync(src("src/web/sw.js"), "utf8"), "__GC_CACHE__", "sw.js"), "__GC_FILES__", "sw.js")
    .replace("__GC_CACHE__", `glosscode-app-${VERSION}-${hash.digest("hex").slice(0, 12)}`)
    .replace("__GC_FILES__", JSON.stringify(["./", ...list], null, 0).split('","').join('",\n  "'));
  writeFileSync(join(app, "sw.js"), sw);
}

if (!appOnly){
  /* The browser demo, unchanged */
  copyUi(join(out, "try"));

  /* The landing page and the download page, with the pictures from the README */
  cpSync(src("site"), out, { recursive:true });
  mkdirSync(join(out, "images"), { recursive:true });
  for (const f of ["editor-overview.png", "simulation.png", "problems.png", "lathe.png", "subprogram-beside.png", "insert-cycle.png", "convert.png"])
    cpSync(src("docs/images/" + f), join(out, "images", f));
  for (const f of ["glosscode.svg", "glosscode-256.png"]) cpSync(src("assets/logo/" + f), join(out, "images", f));
  for (const f of files(out).filter(f => /^(index|download\/index)\.html$/.test(f))){
    const p = join(out, f);
    writeFileSync(p, readFileSync(p, "utf8").split("__GC_VERSION__").join(VERSION));
  }
  // The demo used to be at the site's root; its ?open= links go to /try now.
  writeFileSync(join(out, ".nojekyll"), "");
}
console.log(`${out}: ${files(out).length} files, version ${VERSION}${appOnly ? " (web app only)" : ""}`);
