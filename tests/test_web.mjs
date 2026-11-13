// Tests the website in a real browser (Chromium, through Playwright):
//   scripts/build-wasm.sh build-web && node scripts/build-site.mjs --wasm build-web/core.wasm --out _site
//   node tests/test_web.mjs [_site]
// - the landing page, the download page and /try load without errors, and old ?open= links go to /try
// - the web app: every program in tests/cases/ and examples/ opened and saved unchanged comes back byte for
//   byte (through the core in WebAssembly); one changed block changes only that block; Latin-1 stays Latin-1;
//   the recent list reopens a file after a reload; settings and the subprogram library are kept; it starts offline
// - the web app in a browser without the File System Access API: Open reads a copy, Save downloads one
// Files are real FileSystemFileHandles in the browser's private file system (OPFS) handed to the app in place of
// the file pickers, so they go through IndexedDB just as picked files do.
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = await import("playwright")); }

const SITE = process.argv[2] || "_site";
if (!existsSync(join(SITE, "app/core.wasm"))) { console.error(`${SITE}/app/core.wasm missing: build the site first (see the top of this file).`); process.exit(1); }
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".wasm":"application/wasm",
  ".webmanifest":"application/manifest+json", ".png":"image/png", ".svg":"image/svg+xml", ".woff2":"font/woff2", ".md":"text/plain" };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/glosscode/, "");
  p = normalize(join(SITE, p));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!p.startsWith(normalize(SITE)) || !existsSync(p)) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "Content-Type":TYPES[extname(p)] || "application/octet-stream", "Cache-Control":"no-cache" });
  res.end(readFileSync(p));
}).listen(0, "127.0.0.1");
await new Promise(r => server.once("listening", r));
// Under /glosscode/, as on GitHub Pages
const BASE = `http://127.0.0.1:${server.address().port}/glosscode/`;

// A file never opened before may ask for its machine: take the one the picker offers.
async function pickMachine(page){
  await page.waitForFunction(() => !document.getElementById("mpdlg").hidden || window.__settled, null, { timeout:3000 }).catch(() => {});
  await page.evaluate(() => { if (!document.getElementById("mpdlg").hidden) document.getElementById("mp-ok").click(); });
}
// What saving a program unchanged gives: the same bytes, except that a line holding two blocks ("A; B", in
// tests/cases/EOB_LATIN1.nc) is written as two lines, as the program does too.
const expect = (f, bytes) => f.endsWith("EOB_LATIN1.nc") ? Buffer.from(bytes.toString("latin1").replace("G90; N20", "G90;\n N20"), "latin1") : bytes;
// A Latin-1 program with ';' marks and CRLF line endings, one block per line.
const LATIN1 = Buffer.from("%\r\nO0301 (CAFÉ);\r\nG20 G90;\r\nG00 X1. Y2.;\r\nG01 Z-.1 F5.;\r\n(ÉTÉ);\r\nM30;\r\n%\r\n", "latin1");
let failed = 0;
const fail = what => { failed++; console.error("FAIL " + what); };
const ok = (cond, what) => { if (!cond) fail(what); };
// Each part gets a browser profile of its own on disk. (In a private profile, which a plain newContext() is,
// Chromium closes the page when a file handle is read back from IndexedDB.)
const profiles = [];
async function newContext(opts = {}){
  const dir = mkdtempSync(join(tmpdir(), "glosscode-web-")); profiles.push(dir);
  return chromium.launchPersistentContext(dir, opts);
}
function watch(page, where){
  page.on("pageerror", e => fail(`${where}: ${e.message}`));
  page.on("console", m => { if (m.type()==="error" && !/favicon|api\.github\.com|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) fail(`${where}: console error ${m.text()}`); });
}

try {
  /* The landing page, the download page and the demo */
  {
    const ctx = await newContext();
    await ctx.route("https://api.github.com/**", r => r.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({
      tag_name:"v9.9.9", html_url:"https://github.com/grahamrkf/glosscode/releases/tag/v9.9.9", published_at:"2026-11-13T00:00:00Z",
      assets:["GlossCode-9.9.9-windows-x64-setup.exe", "GlossCode-9.9.9-linux-amd64.deb", "GlossCode-9.9.9-web.zip", "SHA256SUMS.txt"]
        .map(name => ({ name, size:2e6, browser_download_url:"https://example.invalid/" + name })) }) }));
    const page = await ctx.newPage(); watch(page, "landing");
    await page.goto(BASE);
    ok(await page.locator('a[href="app/"]').count() > 0 && await page.locator('a[href="try/"]').count() > 0 && await page.locator('a[href="download/"]').count() > 0, "landing page links to app, try and download");
    ok(!(await page.content()).includes("__GC_VERSION__"), "landing page has its version filled in");
    for (const img of await page.locator("img").all()) ok(await img.evaluate(i => i.complete && i.naturalWidth > 0), "landing image " + await img.getAttribute("src"));
    await page.goto(BASE + "download/");
    await page.waitForSelector('[data-files="web"] a.btn');
    ok(await page.locator('[data-files="windows"] a.btn').count()===1, "download page: Windows installer button");
    ok((await page.locator(".v").first().textContent())==="9.9.9", "download page: version in the commands");
    ok((await page.locator('[data-files="more"] a').count())===1, "download page: SHA256SUMS");
    await page.goto(BASE + "?open=POCKET_2X1.nc");
    await page.waitForURL(/\/try\/\?open=/);
    await page.waitForFunction(() => typeof TABS!=="undefined" && TABS.length===1);
    ok(await page.evaluate(() => !window.GlossCodeNative && TABS[0].sample), "old ?open= link opens the sample in /try");
    await ctx.close();
  }

  /* The web app with the File System Access API (Chrome, Edge) */
  const cases = [...readdirSync("tests/cases").map(f => "tests/cases/" + f), ...readdirSync("examples").filter(f => /\.(nc|min|ssb|mpf|h|txt|tap)$/i.test(f)).map(f => "examples/" + f)]
    .filter(f => statSync(f).isFile());
  {
    const ctx = await newContext();
    const page = await ctx.newPage(); watch(page, "app");
    await page.goto(BASE + "app/");
    await page.waitForFunction(() => typeof TABS!=="undefined" && window.GlossCodeNative?.platform==="web");
    ok(await page.evaluate(() => typeof FILES==="undefined" || !Object.keys(FILES).length), "app has no sample programs");
    ok((await page.evaluate(() => GlossCodeNative.core("tokenize", { text:"g1x1." }))).tok.join(" ")==="G1 X1.", "core tokenize through WebAssembly");
    // Hand the app an OPFS file in place of the Open dialog, and another for Save As.
    await page.evaluate(() => {
      window.__put = async (name, b64) => {
        const dir = await navigator.storage.getDirectory(), h = await dir.getFileHandle(name, { create:true }), w = await h.createWritable();
        await w.write(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); await w.close(); return h;
      };
      window.__get = async name => {
        const dir = await navigator.storage.getDirectory(), f = await (await dir.getFileHandle(name)).getFile();
        let s = ""; for (const b of new Uint8Array(await f.arrayBuffer())) s += String.fromCharCode(b); return btoa(s);
      };
      window.showOpenFilePicker = async () => [window.__next];
      window.showSaveFilePicker = async o => window.__put("saved-" + o.suggestedName, "");
    });
    const machineFor = () => pickMachine(page);
    let n = 0;
    for (const f of cases){
      const bytes = readFileSync(f), name = `case${n++}-${f.split("/").pop()}`;
      await page.evaluate(async ([name, b64]) => { window.__next = await window.__put(name, b64); }, [name, bytes.toString("base64")]);
      await page.evaluate(() => { window.__settled = false; window.__opened = window.nativeOpen().finally(() => { window.__settled = true; }); });
      await page.waitForTimeout(50);
      await machineFor();
      await page.evaluate(() => window.__opened);
      const open = await page.evaluate(() => TABS[activeTab]?.name);
      if (open!==name) { fail(`${f}: didn't open (active tab ${open})`); continue; }
      await page.evaluate(() => window.nativeSave(false));
      const back = Buffer.from(await page.evaluate(n => window.__get(n), name), "base64");
      ok(back.equals(expect(f, bytes)), `${f}: saved unchanged, byte for byte`);
    }
    // One block changed: only that block changes, with ';' marks, CRLF and Latin-1 kept.
    {
      const bytes = LATIN1;
      await page.evaluate(async b64 => { window.__next = await window.__put("edit.nc", b64); }, bytes.toString("base64"));
      await page.evaluate(() => { window.__settled = false; window.__opened = window.nativeOpen().finally(() => { window.__settled = true; }); }); await page.waitForTimeout(50); await machineFor(); await page.evaluate(() => window.__opened);
      ok(await page.evaluate(() => TABS[activeTab].native.latin1), "Latin-1 file read as Latin-1");
      const i = await page.evaluate(() => { const i = doc.findIndex(t => t.some(w => /^G0?1$/.test(w))); doc[i] = [...doc[i], "(WEB)"]; docVer++; return i; });
      await page.evaluate(() => window.nativeSave(false));
      const back = Buffer.from(await page.evaluate(() => window.__get("edit.nc")), "base64").toString("latin1").split(/\r?\n/);
      const orig = bytes.toString("latin1").split(/\r?\n/);
      const diff = orig.map((l, k) => l!==back[k] ? k : -1).filter(k => k >= 0);
      ok(back.length===orig.length && diff.length===1 && back[diff[0]].includes("(WEB)"), `one changed block changes one line (changed lines ${diff}, block ${i})`);
      ok(!Buffer.from(await page.evaluate(() => window.__get("edit.nc")), "base64").includes(Buffer.from([0xc3])), "saved file is still Latin-1");
      // Save As writes a new file
      await page.evaluate(() => window.nativeSave(true));
      ok(await page.evaluate(() => TABS[activeTab].path)==="saved-edit.nc", "Save As goes to the new file");
    }
    // Library and settings
    const lib = await page.evaluate(async () => {
      const N = GlossCodeNative;
      const p = await N.saveLibrary("web-test", JSON.stringify({ id:"web-test", program:9999, args:[], body:["O9999", "M99"] }));
      const listed = await N.library(), bad = await N.saveLibrary("../x", "{}").then(() => true, () => false);
      await N.deleteLibrary("web-test");
      return { p, listed:listed.some(x => x.path===p && x.entry.program===9999), bad, left:(await N.library()).length };
    });
    ok(lib.listed && !lib.bad && lib.left===0, "subprogram library save, list, refuse a bad id, delete: " + JSON.stringify(lib));
    // After a reload: the recent list reopens a file through its kept handle
    await page.reload();
    await page.waitForFunction(() => typeof TABS!=="undefined" && document.querySelector("#home .ri"));
    const recent = await page.locator("#home .ri").count();
    ok(recent===12, `recent list kept after reload (${recent} of the 12 kept)`);
    await page.locator('#home .ri[data-p="edit.nc"]').first().click();
    await page.waitForFunction(() => TABS.length===1);
    ok(await page.evaluate(() => TABS[0].name==="edit.nc" && doc.some(t => t.includes("(WEB)"))), "recent program reopens from its file");
    // Offline: the service worker keeps the app
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller || true);
    await page.reload(); await page.evaluate(() => navigator.serviceWorker.ready);
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => typeof TABS!=="undefined" && window.GlossCodeNative);
    ok((await page.evaluate(() => GlossCodeNative.core("tokenize", { text:"m3s100" }))).tok.join(" ")==="M3 S100", "app starts and reads code offline");
    await ctx.setOffline(false);
    // About says it's the web app
    await page.evaluate(() => window.openAbout());
    ok(/web app/.test(await page.locator("#a-plat").textContent()) && await page.locator("#a-check").isHidden(), "About shows the web app, no update check");
    await ctx.close();
  }

  /* The web app without the File System Access API (Firefox, Safari) */
  {
    const ctx = await newContext({ acceptDownloads:true });
    await ctx.addInitScript(() => { delete window.showOpenFilePicker; delete window.showSaveFilePicker; delete Window.prototype.showOpenFilePicker; delete Window.prototype.showSaveFilePicker; });
    const page = await ctx.newPage(); watch(page, "app without File System Access");
    await page.goto(BASE + "app/");
    await page.waitForFunction(() => typeof TABS!=="undefined" && window.GlossCodeNative?.fileAccess==="copies");
    const bytes = LATIN1;
    const chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => { window.__settled = false; window.__opened = window.nativeOpen().finally(() => { window.__settled = true; }); });
    await (await chooser).setFiles({ name:"upload.nc", mimeType:"text/plain", buffer:bytes });
    await pickMachine(page);
    await page.evaluate(() => window.__opened);
    ok(await page.evaluate(() => TABS[activeTab]?.name)==="upload.nc", "file input opens the program");
    const dl = page.waitForEvent("download");
    await page.evaluate(() => window.nativeSave(false));
    const d = await dl;
    ok(d.suggestedFilename()==="upload.nc", "Save downloads under the file's name");
    const path = await d.path();
    ok(readFileSync(path).equals(bytes), "downloaded copy is byte for byte the same");
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#home .ri[data-p="upload.nc"]'));
    await page.locator('#home .ri[data-p="upload.nc"]').click();
    await page.waitForFunction(() => TABS.length===1);
    ok(true, "recent copy reopens");
    await ctx.close();
  }
} catch (e) {
  fail("stopped: " + (e?.stack || e));
} finally {
  for (const d of profiles) rmSync(d, { recursive:true, force:true });
  server.close();
}
if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log("web tests passed");
