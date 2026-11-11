/* ---------- Text size ----------
   View › Text size… sets the code text size, the gloss text size and a zoom for the whole window. Ctrl+= and Ctrl+-
   (or Ctrl+wheel) zoom in and out, Ctrl+0 goes back to 100%. The sizes are the --code-size and --gloss-size variables in
   css/main.css (the editor's row heights follow them); the zoom is CSS zoom on the page. They're kept in
   settings.json as "text": { code, gloss, zoom } (see loadSettings in js/tabs.js). */
(() => {
const $ = id => document.getElementById(id);
const DEF = { code:13, gloss:11, zoom:100 };
const SIZES = { code:[11, 12, 13, 14, 15, 16, 18, 20], gloss:[9, 10, 11, 12, 13, 14, 16], zoom:[67, 75, 80, 90, 100, 110, 125, 150, 175, 200] };
const T = { ...DEF };
const tdlg = $("tdlg");

function apply(){
  const r = document.documentElement.style;
  r.setProperty("--code-size", T.code + "px");
  r.setProperty("--gloss-size", T.gloss + "px");
  r.zoom = T.zoom===100 ? "" : String(T.zoom/100);
  if (typeof drawViews==="function" && activeTab >= 0) drawViews();   // the toolpath and timeline fit their new size
}
const save = () => window.saveTextPrefs?.({ ...T });
function set(k, v, quiet){
  T[k] = v; apply(); save(); fill();
  if (!quiet) setMsg(k==="zoom" ? `Zoom ${v}%. Ctrl+0 goes back to 100%.` : `${k==="code" ? "Code" : "Gloss"} text ${v} px.`);
}
// One step up or down the zoom list (dir 1 or -1), or back to 100% (dir 0).
function zoomStep(dir){
  const L = SIZES.zoom, i = L.indexOf(T.zoom);
  const n = dir===0 ? 100 : dir > 0 ? (L.find(z => z > T.zoom) ?? L.at(-1)) : ([...L].reverse().find(z => z < T.zoom) ?? L[0]);
  if (n!==T.zoom || i < 0) set("zoom", n);
}
window.zoomStep = zoomStep;

window.loadTextPrefs = p => {
  for (const k of Object.keys(DEF)) if (SIZES[k].includes(p?.[k])) T[k] = p[k];
  apply();
};

// The window: three lists, a sample line drawn the way the editor draws it, and Reset.
function fill(){
  for (const k of Object.keys(DEF)) $("t-" + k).value = String(T[k]);
}
window.openTextSize = () => {
  closeMenu?.();
  for (const k of Object.keys(DEF))
    $("t-" + k).innerHTML = SIZES[k].map(v => `<option value="${v}">${v}${k==="zoom" ? "%" : " px"}${v===DEF[k] ? " (default)" : ""}</option>`).join("");
  fill(); tdlg.hidden = false; $("t-code").focus();
};
function closeTextSize(){ tdlg.hidden = true; $("ed")?.focus({ preventScroll:true }); }
for (const k of Object.keys(DEF)) $("t-" + k).addEventListener("change", e => set(k, +e.target.value, true));
$("t-reset").addEventListener("click", () => { Object.assign(T, DEF); apply(); save(); fill(); });
$("t-close").addEventListener("click", closeTextSize);
$("t-x").addEventListener("click", closeTextSize);
tdlg.addEventListener("mousedown", e => { if (e.target===tdlg) closeTextSize(); });
document.addEventListener("keydown", e => {
  if (!tdlg.hidden && e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); closeTextSize(); return; }
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
