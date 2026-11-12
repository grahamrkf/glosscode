/* ---------- Appearance ----------
   View › Appearance… sets the theme (light, dark or the same as the system), the code and gloss fonts and their
   sizes, a zoom for the whole window, and the colours of the code, gloss, comments, N numbers and the toolpath's
   moves. View › Theme switches the theme straight from the menu. Ctrl+= and Ctrl+- (or Ctrl+wheel) zoom in and out,
   Ctrl+0 goes back to 100%.
   - The theme is data-theme="light" or "dark" on <html>; css/theme.css (made by scripts/make-theme.mjs) has every
     colour for both. In the program, the window's title bar follows it (GlossCodeNative.setDark).
   - The sizes are --code-size and --gloss-size, the fonts --w-mono and --w-gloss (css/main.css), and the colours a
     user can change are --ink-code, --ink-gloss, --ink-comment, --ink-n, --rapid, --feed, --arc and --cycle
     (css/theme.css): a choice is set on <html> over them, kept separately for the light and dark themes.
   - The font lists put the built-in IBM Plex first, then the easy-to-read fonts that are installed, then (in the
     program) every installed font (GlossCodeNative.fonts).
   Kept in settings.json as "text": { code, gloss, zoom } and "appearance": { theme, codeFont, glossFont,
   colors: { light:{…}, dark:{…} } } (see loadSettings in js/tabs.js). */
(() => {
const NATIVE = window.GlossCodeNative;
const DEF = { code:13, gloss:11, zoom:100 };
const SIZES = { code:[11, 12, 13, 14, 15, 16, 18, 20], gloss:[9, 10, 11, 12, 13, 14, 16], zoom:[67, 75, 80, 90, 100, 110, 125, 150, 175, 200] };
const T = { ...DEF };
const LOOK_DEF = () => ({ theme:"system", codeFont:"", glossFont:"", colors:{ light:{}, dark:{} } });
const LOOK = LOOK_DEF();
const THEMES = ["system", "light", "dark"];
const COLORS = [["--ink-code", "Code"], ["--ink-gloss", "Gloss"], ["--ink-comment", "Comments"], ["--ink-n", "N numbers"],
                ["--rapid", "Rapid moves"], ["--feed", "Feed moves"], ["--arc", "Arcs"], ["--cycle", "Canned cycles"]];
const FONT = {
  codeFont:{ v:"--w-mono", built:"IBM Plex Mono (built in)",
    rec:["Cascadia Mono", "Consolas", "JetBrains Mono", "Source Code Pro", "Atkinson Hyperlegible Mono", "Noto Sans Mono",
         "DejaVu Sans Mono", "Liberation Mono", "Ubuntu Mono", "Hack", "Lucida Console"] },
  glossFont:{ v:"--w-gloss", built:"IBM Plex Sans (built in)",
    rec:["Segoe UI", "Atkinson Hyperlegible", "Atkinson Hyperlegible Next", "Verdana", "Tahoma", "Inter", "Noto Sans",
         "Open Sans", "Source Sans 3", "DejaVu Sans", "Ubuntu", "Cantarell", "Calibri", "Arial"] }
};
const tdlg = $("tdlg");
const root = document.documentElement;
const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)");
const isDark = () => LOOK.theme==="dark" || (LOOK.theme==="system" && !!systemDark?.matches);
const mode = () => isDark() ? "dark" : "light";
const cleanFont = f => String(f || "").replace(/["\\;{}<>]/g, "").trim().slice(0, 80);
const isHex = c => /^#[0-9a-f]{6}$/.test(c);

function apply(){
  const r = root.style;
  r.setProperty("--code-size", T.code + "px");
  r.setProperty("--gloss-size", T.gloss + "px");
  r.zoom = T.zoom===100 ? "" : String(T.zoom/100);
  const dark = isDark();
  root.dataset.theme = dark ? "dark" : "light";
  // A chosen font goes in front of the usual list, so the built-in one still stands in for missing letters.
  for (const [k, f] of Object.entries(FONT)){
    r.removeProperty(f.v);
    if (LOOK[k]) r.setProperty(f.v, `"${LOOK[k]}", ${getComputedStyle(root).getPropertyValue(f.v).trim()}`);
  }
  const own = LOOK.colors[mode()];
  for (const [v] of COLORS) if (own[v]) r.setProperty(v, own[v]); else r.removeProperty(v);
  try { NATIVE?.setDark?.(dark)?.catch?.(() => {}); } catch { /* an older program */ }
  if (typeof drawViews==="function" && typeof activeTab!=="undefined" && activeTab >= 0) drawViews();   // the toolpath and timeline fit their new size and colours
}
systemDark?.addEventListener?.("change", () => { if (LOOK.theme==="system"){ apply(); if (!tdlg.hidden) fill(); } });

const save = () => { window.saveTextPrefs?.({ ...T }); window.saveLookPrefs?.(JSON.parse(JSON.stringify(LOOK))); };
function set(k, v, quiet){
  T[k] = v; apply(); save(); if (!tdlg.hidden) fill();
  if (!quiet) setMsg(k==="zoom" ? `Zoom ${v}%. Ctrl+0 goes back to 100%.` : `${k==="code" ? "Code" : "Gloss"} text ${v} px.`);
}
// One step up or down the zoom list (dir 1 or -1), or back to 100% (dir 0).
function zoomStep(dir){
  const L = SIZES.zoom, i = L.indexOf(T.zoom);
  const n = dir===0 ? 100 : dir > 0 ? (L.find(z => z > T.zoom) ?? L.at(-1)) : ([...L].reverse().find(z => z < T.zoom) ?? L[0]);
  if (n!==T.zoom || i < 0) set("zoom", n);
}
window.zoomStep = zoomStep;
function setTheme(t){
  if (!THEMES.includes(t)) return;
  LOOK.theme = t; apply(); save(); if (!tdlg.hidden) fill();
  setMsg(t==="system" ? `The theme follows the system (${mode()} now).` : `${t==="dark" ? "Dark" : "Light"} theme.`);
}
window.lookTheme = () => LOOK.theme;
window.setLookTheme = setTheme;

window.loadTextPrefs = p => {
  for (const k of Object.keys(DEF)) if (SIZES[k].includes(p?.[k])) T[k] = p[k];
  apply();
};
window.loadLookPrefs = p => {
  if (THEMES.includes(p?.theme)) LOOK.theme = p.theme;
  for (const k of Object.keys(FONT)) if (typeof p?.[k]==="string") LOOK[k] = cleanFont(p[k]);
  for (const m of ["light", "dark"]){
    const c = p?.colors?.[m];
    LOOK.colors[m] = {};
    if (c && typeof c==="object") for (const [v] of COLORS) if (isHex(c[v])) LOOK.colors[m][v] = c[v];
  }
  apply();
};

/* Which fonts are installed: a font is there when text drawn in it is a different width from the fallback's. */
const probe = document.createElement("canvas").getContext("2d");
function installed(name){
  if (!probe) return false;
  const s = "mmmmmmmmmmlli10OQW@#", w = font => { probe.font = font; return probe.measureText(s).width; };
  return ["monospace", "serif", "sans-serif"].some(b => w(`72px "${name}", ${b}`)!==w(`72px ${b}`));
}
let REC = null, ALL = null;
async function fontLists(){
  REC ||= Object.fromEntries(Object.entries(FONT).map(([k, f]) => [k, f.rec.filter(installed)]));
  if (!ALL && NATIVE?.fonts){
    try { const a = await NATIVE.fonts(); ALL = Array.isArray(a) ? a.filter(n => typeof n==="string" && n && n[0]!=="@") : []; }
    catch { ALL = []; }
  }
}
function fontOptions(k){
  const f = FONT[k], cur = LOOK[k], rec = REC?.[k] || [];
  const opt = (n, label = n) => `<option value="${esc(n)}"${n===cur ? " selected" : ""}>${esc(label)}</option>`;
  let h = opt("", f.built);
  if (rec.length) h += `<optgroup label="Easy to read">${rec.map(n => opt(n)).join("")}</optgroup>`;
  const rest = (ALL || []).filter(n => !rec.includes(n));
  if (rest.length) h += `<optgroup label="All installed fonts">${rest.map(n => opt(n)).join("")}</optgroup>`;
  if (cur && !rec.includes(cur) && !rest.includes(cur)) h += opt(cur, `${cur} (not found)`);
  return h;
}

// The window: theme, fonts and sizes, a sample of the editor, and the colours.
const colorNow = v => getComputedStyle(root).getPropertyValue(v).trim();
function fill(){
  for (const k of Object.keys(DEF)) $("t-" + k).value = String(T[k]);
  $("t-theme").value = LOOK.theme;
  for (const k of Object.keys(FONT)) $("t-" + k).innerHTML = fontOptions(k);
  $("t-colhead").textContent = `Colours (${mode()} theme)`;
  const own = LOOK.colors[mode()];
  $("t-cols").innerHTML = COLORS.map(([v, label]) => {
    const now = colorNow(v);
    return `<label class="tscol"><input type="color" data-v="${v}" ${isHex(now) ? `value="${now}"` : ""}><span>${label}</span>`
      + `<button class="tsback" data-back="${v}" title="Back to the theme's colour"${own[v] ? "" : " hidden"}>&#x21ba;</button></label>`;
  }).join("");
}
$("t-prev").innerHTML = `<div class="tpg">spindle.fwd speed:2400</div><div class="tpc"><span class="tpn">N40</span>M03 S2400 <span class="tpcm">(START SPINDLE)</span></div>`
  + `<div class="tpm"><i style="background:var(--rapid)"></i>Rapid <i style="background:var(--feed)"></i>Feed <i style="background:var(--arc)"></i>Arc <i style="background:var(--cycle)"></i>Cycle</div>`;
window.openAppearance = async () => {
  closeMenu?.();
  for (const k of Object.keys(DEF))
    $("t-" + k).innerHTML = SIZES[k].map(v => `<option value="${v}">${v}${k==="zoom" ? "%" : " px"}${v===DEF[k] ? " (default)" : ""}</option>`).join("");
  fill();
  showDialog(tdlg, $("t-theme"));
  await fontLists();
  if (!tdlg.hidden) for (const k of Object.keys(FONT)) $("t-" + k).innerHTML = fontOptions(k);
};
const closeAppearance = () => hideDialog(tdlg);
for (const k of Object.keys(DEF)) $("t-" + k).addEventListener("change", e => set(k, +e.target.value, true));
$("t-theme").addEventListener("change", e => setTheme(e.target.value));
for (const k of Object.keys(FONT)) $("t-" + k).addEventListener("change", e => { LOOK[k] = cleanFont(e.target.value); apply(); save(); });
$("t-cols").addEventListener("input", e => {
  const v = e.target.dataset?.v;
  if (!v || !isHex(e.target.value)) return;
  LOOK.colors[mode()][v] = e.target.value; apply(); save();
  e.target.parentNode.querySelector(".tsback").hidden = false;
});
$("t-cols").addEventListener("click", e => {
  const v = e.target.closest?.("[data-back]")?.dataset.back;
  if (!v) return;
  e.preventDefault();
  delete LOOK.colors[mode()][v]; apply(); save(); fill();
});
$("t-reset").addEventListener("click", () => { Object.assign(T, DEF); Object.assign(LOOK, LOOK_DEF()); apply(); save(); fill(); });
$("t-close").addEventListener("click", closeAppearance);
$("t-x").addEventListener("click", closeAppearance);
tdlg.addEventListener("mousedown", e => { if (e.target===tdlg) closeAppearance(); });
document.addEventListener("keydown", e => {
  if (!tdlg.hidden && e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); closeAppearance(); return; }
  // Zoom keys work everywhere, the home page included, and keep the webview's own zoom from doubling up.
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (e.key==="=" || e.key==="+"){ e.preventDefault(); zoomStep(1); }
  else if (e.key==="-" || e.key==="_"){ e.preventDefault(); zoomStep(-1); }
  else if (e.key==="0"){ e.preventDefault(); zoomStep(0); }
}, true);
// Ctrl+wheel zooms the same way (the toolpath's own wheel zoom has no Ctrl).
document.addEventListener("wheel", e => { if (e.ctrlKey && !e.altKey){ e.preventDefault(); zoomStep(e.deltaY < 0 ? 1 : -1); } }, { passive:false, capture:true });
apply();
})();
