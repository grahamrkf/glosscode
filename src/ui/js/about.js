/* ---------- About window ----------
   Help › About GlossCode shows the version, the website and an update check. The check asks the GitHub
   Releases API for the latest published release, compares its tag (v0.2.0) with APP_VERSION, and offers
   the download that matches this copy: the installer for an installed copy, the portable archive for a
   portable one. Release files follow the names in docs/releasing.md, so the right one can be picked by
   its ending. In the app, the platform file downloads the file to the Downloads folder, checks it against
   SHA256SUMS.txt from the same release, and offers to run the installer; the mockup just opens the link.
   APP_VERSION comes from the VERSION file at the repository root (data.js, written by scripts/make-ui-data.mjs). */
(() => {
const REPO = "grahamrkf/glosscode";
const SITE = `https://github.com/${REPO}`;
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const $ = id => document.getElementById(id);
const adlg = $("adlg");
const NATIVE = window.GlossCodeNative;   // set when running in the app; the app checks for a "portable" file beside itself
const os = NATIVE ? NATIVE.platform : /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent) ? "linux" : "windows";
const portable = NATIVE ? NATIVE.portable : new URLSearchParams(location.search).has("portable");
// Which release files fit this copy, best first.
const WANT = {
  windows: portable ? [[/-windows-x64-portable\.zip$/i, "Download portable (.zip)"]]
                    : [[/-windows-x64-setup\.exe$/i, "Download installer"]],
  linux:   portable ? [[/-linux-x86_64-portable\.tar\.gz$/i, "Download portable (.tar.gz)"]]
                    : [[/-linux-amd64\.deb$/i, "Download installer (.deb)"], [/-linux-x86_64\.rpm$/i, "Download installer (.rpm)"]]
};
let busy = false;

const parse = v => (String(v).replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/) || []).slice(1);
function newer(a, b){   // is version a newer than version b? A pre-release (0.2.0-beta.1) is older than its release.
  const x = parse(a), y = parse(b); if (!x.length || !y.length) return false;
  for (let i = 0; i < 3; i++) if (+x[i] !== +y[i]) return +x[i] > +y[i];
  if (!x[3] !== !y[3]) return !x[3];
  return (x[3] || "") > (y[3] || "");
}
function status(text, cls = ""){ const s = $("a-stat"); s.textContent = text; s.className = "astat " + cls; }

function showRelease(rel){
  const tag = rel.tag_name, dl = $("a-dl"), notes = $("a-notes");
  const files = WANT[os].map(([re, label]) => [rel.assets?.find(a => re.test(a.name)), label]).filter(([a]) => a);
  if (!newer(tag, APP_VERSION)){
    status(`GlossCode ${APP_VERSION} is up to date.`, "ok"); dl.hidden = notes.hidden = true; return;
  }
  status(`GlossCode ${tag.replace(/^v/i, "")} is available.`, "new");
  dl.innerHTML = files.map(([a, label], i) => `<button class="btn${i ? "" : " pri"}" data-url="${esc(a.browser_download_url)}" data-name="${esc(a.name)}">${label} · ${(a.size / 1048576).toFixed(1)} MB</button>`).join("")
    + `<button class="btn" data-url="${esc(rel.html_url)}">${files.length ? "Other downloads" : "Open the release page"}</button>`;
  dl.hidden = false;
  notes.textContent = (rel.body || "").trim(); notes.hidden = !notes.textContent;
}

async function check(){
  if (busy) return; busy = true;
  $("a-check").disabled = true; status("Checking GitHub for a newer release…");
  $("a-dl").hidden = $("a-notes").hidden = true;
  try {
    const r = await fetch(API, { headers:{ Accept:"application/vnd.github+json" } });
    if (r.status === 404) status("No releases have been published yet.");
    else if (r.status === 403 || r.status === 429) status("GitHub is limiting update checks right now. Try again in an hour.", "err");
    else if (!r.ok) status(`GitHub answered ${r.status}. Try again later.`, "err");
    else showRelease(await r.json());
  } catch {
    status("Couldn't reach GitHub. Check the network connection, or download from the website.", "err");
  } finally { busy = false; $("a-check").disabled = false; }
}

function openAbout(){
  closeMenu?.();
  $("a-ver").textContent = APP_VERSION;
  $("a-plat").textContent = `${os === "linux" ? "Linux" : "Windows"}, 64-bit, ${portable ? "portable" : "installed"}`;
  $("a-site").href = SITE; $("a-site").textContent = SITE.replace(/^https:\/\//, "");
  $("a-rel").href = SITE + "/releases"; $("a-issues").href = SITE + "/issues";
  adlg.hidden = false; $("a-close").focus();
}
function closeAbout(){ adlg.hidden = true; $("ed")?.focus({ preventScroll:true }); }

$("a-check").addEventListener("click", check);
$("a-close").addEventListener("click", closeAbout);
$("a-x").addEventListener("click", closeAbout);
adlg.addEventListener("mousedown", e => { if (e.target === adlg) closeAbout(); });
document.addEventListener("keydown", e => { if (!adlg.hidden && e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); closeAbout(); } }, true);
$("a-dl").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  window.open(b.dataset.url, "_blank", "noopener");
  if (b.dataset.name) status(`Downloading ${b.dataset.name}. GlossCode checks it against the release's SHA256SUMS.txt, then offers to run it.`, "new");
});
$("a-auto").addEventListener("change", e => setMsg(e.target.checked
  ? "GlossCode will check GitHub for a newer release once each time it starts, and only says something when there is one."
  : "GlossCode won't check for updates by itself. Use Help › About GlossCode to check."));

MENUS.Help.push("-", { label:"About GlossCode", fn:openAbout });
window.openAbout = openAbout; window.checkForUpdates = check;
})();
