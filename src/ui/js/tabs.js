/* ---------- Tabs, the home page and files ----------
   Each open program has a tab; Home is always first. Everything (menus, panels, checks, simulation) works
   on the active tab, and each tab keeps its own program, machine, selected line and word, undo history
   and scroll position (see newTab in state.js: doc, machineId, curLine… are the active tab's).
   GlossCode starts on the home page: recent programs, New program and Open. A new program asks which
   machine it's for. A file opened before reopens with the machine used last time; any other file uses the
   default machine for its extension (.nc, .MIN…) when one is set, and otherwise asks.
   In the program, window.GlossCodeNative (src/app/bridge.js) opens and saves files through the system
   dialogs and the core in C, which keeps every line that wasn't changed exactly as it was, and keeps the
   recent files and defaults in settings.json in the settings folder. In a browser, the mockup's sample
   programs stand in for files and settings go to localStorage. The program has no sample programs:
   they're a separate download. */
(() => {
const NATIVE = window.GlossCodeNative;
const $ = id => document.getElementById(id);
const EXAMPLES_URL = "https://github.com/grahamrkf/glosscode/tree/main/examples";
const MAX_RECENT = 12;
const SETTINGS = { recent:[], extDefaults:{} };
let TAB_SEQ = 0;

/* Settings: recent files and default machines by file type. */
async function loadSettings(){
  try {
    const o = NATIVE ? await NATIVE.settings() : JSON.parse(localStorage.getItem("glosscode.settings") || "null");
    if (!o || typeof o!=="object") return;
    Object.assign(SETTINGS, o);   // keeps anything a newer version wrote
    if (o.timeline && typeof o.timeline==="object") window.loadTimelineModes?.(o.timeline);
    window.loadDraftDismissed?.(o.draftDismissed);
    if (o.folding && typeof o.folding==="object") window.loadFoldPrefs?.(o.folding);
    if (o.text && typeof o.text==="object") window.loadTextPrefs?.(o.text);
    window.loadMachines?.(o.machines, o.recentMachines);
    SETTINGS.recent = Array.isArray(o.recent) ? o.recent.filter(r => r && typeof r.path==="string" && typeof r.name==="string").slice(0, MAX_RECENT) : [];
    SETTINGS.extDefaults = o.extDefaults && typeof o.extDefaults==="object" && !Array.isArray(o.extDefaults) ? { ...o.extDefaults } : {};
  } catch { /* no settings yet */ }
}
// The user's machine profiles and recent machines, after a change in the Machine profiles window or a pick.
window.saveMachines = () => { Object.assign(SETTINGS, window.machineData()); saveSettings(); };
// A deleted profile: open programs, recent files and file type defaults that used it move to "repl".
window.machineDeleted = (id, repl) => {
  for (const t of TABS) if (t.machineId===id) t.machineId = repl;
  for (const r of SETTINGS.recent) if (r.machine===id) r.machine = repl;
  for (const [ext, m] of Object.entries(SETTINGS.extDefaults)) if (m===id) SETTINGS.extDefaults[ext] = repl;
  drawTabs?.();
};
function saveSettings(){
  try {
    if (NATIVE) NATIVE.saveSettings(SETTINGS).catch(e => setMsg(String(e?.message || e), true));
    else localStorage.setItem("glosscode.settings", JSON.stringify(SETTINGS));
  } catch { /* storage unavailable */ }
}
const extOf = name => (/\.[^./\\]+$/.exec(name || "") || [""])[0].toLowerCase();
const folderOf = path => path.slice(0, Math.max(0, path.lastIndexOf("/"), path.lastIndexOf("\\")));

/* Tabs. Each tab object holds its own program (newTab in state.js); leaving a tab only keeps its scroll position. */
const cur = () => TABS[activeTab];
const tabName = t => t.name;
const tabMachine = t => t.machineId;
const isDirty = t => t.docVer !== t.savedVer;
function leaveTab(){ const t = cur(); if (t) t.scroll = [ed.scrollTop, ed.scrollLeft]; }
function setTitle(t){ document.title = t; if (NATIVE) NATIVE.setTitle(t); }
function showActive(){
  $("app").classList.toggle("at-home", activeTab < 0);
  $("home").hidden = activeTab >= 0;
  if (activeTab < 0){
    drawHome(); drawTabs(); setTitle("GlossCode");
    ["st-pos", "st-mode", "st-modal", "st-warn"].forEach(id => $(id).textContent = "");
    return;
  }
  setDialect(); drawMachineChip(); render();
  const [top, left] = cur().scroll || [0, 0]; ed.scrollTop = top; ed.scrollLeft = left;
  setTitle(fileName + " - GlossCode"); showInfo(curLine, null);
  ed.focus({ preventScroll:true });
}
function activate(i){
  if (editing && !commit()) return false;
  if (i===activeTab) return true;
  stopSim(true); closeMenu();
  leaveTab(); activeTab = i;
  showActive();
  return true;
}
// Adds a tab for a program and shows it. o: { name, path, sample, machine, src (lines), expand, native }.
function openProgram(o){
  if (editing && !commit()) return null;
  stopSim(true); leaveTab();
  const t = newTab({ id:++TAB_SEQ, name:o.name, machineId:o.machine, path:o.path || null, sample:!!o.sample, scroll:[0, 0],
    native:o.native || { eol:"\r\n", finalEol:true, latin1:false, raw:new Map() } });
  TABS.push(t); activeTab = TABS.length - 1;
  loadLines(o.src, o.expand);
  t.savedVer = docVer;
  showActive();
  if (t.path) remember(t);
  return t;
}
function closeTab(i){
  const t = TABS[i]; if (!t) return;
  if (i===activeTab && editing && !commit()) return;
  if (isDirty(t) && !confirm(`${tabName(t)} has changes that haven't been saved. Close it anyway?`)) return;
  if (i===activeTab) stopSim(true);
  TABS.splice(i, 1);
  if (i===activeTab){ activeTab = Math.min(i, TABS.length - 1); showActive(); }
  else { if (i < activeTab) activeTab--; drawTabs(); }
}
function drawTabs(){
  const el = $("tabs"); if (!el) return;
  el.innerHTML = `<span class="tab hm${activeTab < 0 ? " on" : ""}" role="tab" aria-selected="${activeTab < 0}" data-t="-1" aria-label="Home" title="Home: recent programs, new program and default machines">⌂</span>`
    + TABS.map((t, i) => {
      const on = i===activeTab, name = tabName(t), m = MACHINES[tabMachine(t)];
      return `<span class="tab${on ? " on" : ""}${isDirty(t) ? " dirty" : ""}" role="tab" aria-selected="${on}" data-t="${i}" title="${esc((t.path || name) + (m ? " · " + m.name : "") + (isDirty(t) ? " · not saved" : ""))}">`
        + `<span class="tn">${esc(name)}</span><button class="tx" data-x="${i}" aria-label="Close ${esc(name)}" title="Close (Ctrl+W)"><span>✕</span></button></span>`;
    }).join("")
    + `<button class="tnew" data-new="1" title="New program (Ctrl+N)" aria-label="New program">+</button>`;
  const on = el.querySelector(".tab.on");
  if (on){ if (on.offsetLeft < el.scrollLeft) el.scrollLeft = on.offsetLeft; else if (on.offsetLeft + on.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = on.offsetLeft + on.offsetWidth - el.clientWidth; }
}
$("tabs").addEventListener("mousedown", e => {
  if (e.button > 1) return;
  const x = e.target.closest("[data-x]"), nw = e.target.closest("[data-new]"), tab = e.target.closest(".tab");
  e.preventDefault();
  if (x && e.button===0) closeTab(+x.dataset.x);
  else if (nw && e.button===0) newProgram();
  else if (tab && e.button===1){ if (+tab.dataset.t >= 0) closeTab(+tab.dataset.t); }
  else if (tab) activate(+tab.dataset.t);
});

/* Recent files. The machine is remembered with each file, so it opens the same way next time. */
function remember(t){
  if (!t.path) return;
  SETTINGS.recent = [{ path:t.path, name:tabName(t), machine:tabMachine(t), time:Date.now() }, ...SETTINGS.recent.filter(r => r.path!==t.path)].slice(0, MAX_RECENT);
  saveSettings();
}
function forget(path){ SETTINGS.recent = SETTINGS.recent.filter(r => r.path!==path); saveSettings(); drawHome(); }

/* Machine picker: for a new program, a file that isn't in the recent list and has no default, and Machine › Choose.
   Three columns: machine type → control → machine. Each control has a Generic machine; the machine column also
   lists the user's profiles and the library models for that type and control (picking one adds it). */
let MP = null;
/* Which controls a file looks like it was written for, from RULES.fileHints: its extension and clues in its text
   (CALL and RTS for Okuma, BEGIN PGM for Klartext…). Returns { ctrls (best first), why (by control), type } or
   null. type is a guess from the words: Y words mean a mill, X and Z without Y a lathe. */
function suggestControls(name, text){
  const ext = extOf(name), body = (text || "").slice(0, 65536), score = {}, why = {}, order = [];
  for (const r of RULES.fileHints?.rules || []){
    let n = 0; const reasons = [];
    if (ext && r.ext?.includes(ext)){ n += 2; reasons.push(`a ${ext.toUpperCase()} file`); }
    for (const c of r.content || []){
      let hit = false; try { hit = new RegExp(c.re, c.flags || "").test(body); } catch { /* a bad pattern in a user file is skipped */ }
      if (hit){ n += 3; reasons.push(c.why); }
    }
    if (!n) continue;
    for (const c of r.controls) if (RULES.dialects[c] && !(score[c] >= n)){ if (!(c in score)) order.push(c); score[c] = n; why[c] = reasons.join(", "); }
  }
  if (!order.length) return null;
  const ctrls = order.map((c, i) => [c, i]).sort((a, b) => score[b[0]] - score[a[0]] || a[1] - b[1]).map(x => x[0]);
  const y = /(^|[\s\d])Y[-+]?[.\d]/m.test(body), x = /(^|[\s\d])X[-+]?[.\d]/m.test(body), z = /(^|[\s\d])Z[-+]?[.\d]/m.test(body);
  return { ctrls, why, type: y ? "mill" : x && z ? "lathe" : null };
}
window.suggestControls = suggestControls;
// The machine a suggestion starts on, using the guessed type where the control has it: the user's own (recent
// first) machine with one of the suggested controls, best first, else the best control's Generic machine.
function suggestedStart(sug){
  const typeOf = c => sug.type && RULES.dialects[c][sug.type] ? sug.type : MACHINE_TYPES.find(t => RULES.dialects[c][t]);
  for (const c of sug.ctrls){
    const fit = id => MACHINES[id] && !MACHINES[id].lib && !MACHINES[id].generic && MACHINES[id].type===typeOf(c) && MACHINES[id].brand===c;
    const own = recentMachines.find(fit) || [...USER_MACHINES].find(fit);
    if (own) return own;
  }
  const c = sug.ctrls[0], t = typeOf(c);
  return t ? genId(t, c) : null;
}
// The controls column in order: the suggested ones that have this machine type first, then the rest.
function ctrlOrder(){
  const all = controlsFor(MP.type), sug = (MP.sug?.ctrls || []).filter(c => all.includes(c));
  return { sug, rest: all.filter(c => !sug.includes(c)), all: [...sug, ...all.filter(c => !sug.includes(c))] };
}
function pickMachine(o){
  if (MP) MP.resolve(null);
  return new Promise(resolve => {
    const sugStart = !o.sel && o.suggest ? suggestedStart(o.suggest) : null;
    const start = [o.sel, sugStart, ...recentMachines].find(id => MACHINES[id]) || genId("mill", "generic"), m = MACHINES[start];
    MP = { resolve, ext:o.ext || "", type:m.type, ctrl:m.brand, sel:start, sug:o.suggest || null };
    MP.okWord = () => o.ok.toLowerCase()==="ok" ? "OK" : (MACHINES[MP.sel]?.lib ? o.ok.toLowerCase() : o.ok);
    $("mp-title").textContent = o.title;
    const s0 = sugStart && start===sugStart ? m.brand : null;
    $("mp-text").textContent = o.text + (s0 ? ` It looks like it was written for ${controlLabel(s0)} (${o.suggest.why[s0]}), so ${m.name} is picked. Check it before you open.` : "");
    $("mp-defl").hidden = !MP.ext; $("mp-def").checked = false;
    $("mp-deft").textContent = MP.ext ? ` Always use this machine for ${MP.ext} files` : "";
    drawPicker(); $("mpdlg").hidden = false; $("mp-list").focus();
  });
}
window.pickMachine = pickMachine;
// The machines in the third column, in order: Generic, the user's profiles, then library models not yet added.
function pickerOrder(){
  const fit = id => MACHINES[id].type===MP.type && MACHINES[id].brand===MP.ctrl;
  const mine = [...USER_MACHINES].filter(fit), lib = Object.keys(MACHINES).filter(id => MACHINES[id].lib && fit(id));
  return [genId(MP.type, MP.ctrl), ...mine, ...lib];
}
function drawPicker(){
  const D = RULES.dialects, ids = pickerOrder(), nMine = ids.filter(id => USER_MACHINES.has(id)).length;
  const counts = t => [...USER_MACHINES].filter(id => MACHINES[id].type===t).length;
  $("mp-types").innerHTML = MACHINE_TYPES.map(t => `<div class="mi2${t===MP.type ? " sel" : ""}" role="option" aria-selected="${t===MP.type}" data-type="${t}"><b>${esc(typeLabel(t))}</b>${counts(t) ? `<span>${counts(t)}</span>` : ""}</div>`).join("");
  const co = ctrlOrder(), ctrlRow = c => {
    const n = [...USER_MACHINES].filter(id => MACHINES[id].type===MP.type && MACHINES[id].brand===c).length;
    const tip = co.sug.includes(c) ? `Suggested: ${MP.sug.why[c]}` : D[c]?.about || D[c]?.label || c;
    return `<div class="mi2${c===MP.ctrl ? " sel" : ""}" role="option" aria-selected="${c===MP.ctrl}" data-ctrl="${c}" title="${esc(tip)}"><b>${esc(controlLabel(c))}</b>${n ? `<span>${n}</span>` : ""}</div>`; };
  $("mp-ctrls").innerHTML = co.sug.length
    ? `<div class="grp">Suggested for this file</div>${co.sug.map(ctrlRow).join("")}<div class="grp">All controls</div>${co.rest.map(ctrlRow).join("")}`
    : co.all.map(ctrlRow).join("");
  const row = id => { const m = MACHINES[id];
    const sub = m.generic ? "No numbers; every option allowed" : m.lib ? "From the library: adds it to your machines" : [m.rpm ? `${m.rpm} rpm` : "", m.tools ? `${m.tools} tools` : ""].filter(Boolean).join(" · ") || "Your machine";
    return `<div class="mi2${id===MP.sel ? " sel" : ""}" role="option" aria-selected="${id===MP.sel}" data-id="${id}"><b>${esc(m.name)}</b><span>${esc(sub)}</span></div>`; };
  $("mp-list").innerHTML = row(ids[0])
    + (nMine ? `<div class="grp">Your machines</div>${ids.slice(1, 1 + nMine).map(row).join("")}` : "")
    + (ids.length > 1 + nMine ? `<div class="grp">Library</div>${ids.slice(1 + nMine).map(row).join("")}` : "");
  const rec = recentMachines.filter(id => MACHINES[id] && !MACHINES[id].lib);
  $("mp-rec").innerHTML = rec.length ? `<span>Recent:</span>` + rec.map(id => `<button class="mpchip${id===MP.sel ? " on" : ""}" data-id="${id}" title="${esc(MACHINES[id].control)} ${MACHINES[id].type}">${esc(MACHINES[id].name)}</button>`).join("") : "";
  $("mp-ok").textContent = MACHINES[MP.sel]?.lib ? "Add and " + MP.okWord() : MP.okWord();
  for (const c of ["mp-types", "mp-ctrls", "mp-list"]) $(c).querySelector(".sel")?.scrollIntoView({ block:"nearest" });
}
function closePicker(ok){
  if (!MP) return;
  const r = MP; MP = null; $("mpdlg").hidden = true;
  let id = ok ? r.sel : null;
  if (id && MACHINES[id]?.lib) id = addFromLibrary(id);
  if (id && r.ext && $("mp-def").checked){ SETTINGS.extDefaults[r.ext] = id; saveSettings(); }
  r.resolve(id);
  if (activeTab >= 0) ed.focus({ preventScroll:true });
}
function pickAt(o){
  if (o.type){ MP.type = o.type; if (!controlsFor(MP.type).includes(MP.ctrl)) MP.ctrl = "generic"; MP.sel = genId(MP.type, MP.ctrl); }
  if (o.ctrl){ MP.ctrl = o.ctrl; MP.sel = genId(MP.type, MP.ctrl); }
  if (o.id){ const m = MACHINES[o.id]; MP.type = m.type; MP.ctrl = m.brand; MP.sel = o.id; }
  drawPicker();
}
$("mpdlg").addEventListener("mousedown", e => {
  const it = e.target.closest("[data-type],[data-ctrl],[data-id]"); if (!it || !MP) return;
  pickAt({ type:it.dataset.type, ctrl:it.dataset.ctrl, id:it.dataset.id });
});
$("mp-list").addEventListener("dblclick", e => { if (e.target.closest(".mi2")) closePicker(true); });
$("mpdlg").addEventListener("keydown", e => {
  if (e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); closePicker(false); }
  else if (e.key==="Enter" && e.target.tagName!=="BUTTON"){ e.preventDefault(); e.stopPropagation(); closePicker(true); }
  else if ((e.key==="ArrowDown" || e.key==="ArrowUp") && ["mp-list", "mp-types", "mp-ctrls"].includes(e.target.id)){
    e.preventDefault(); e.stopPropagation();
    const d = e.key==="ArrowDown" ? 1 : -1, mv = (list, cur) => list[Math.max(0, Math.min(list.length - 1, list.indexOf(cur) + d))];
    if (e.target.id==="mp-types") pickAt({ type:mv(MACHINE_TYPES, MP.type) });
    else if (e.target.id==="mp-ctrls") pickAt({ ctrl:mv(ctrlOrder().all, MP.ctrl) });
    else { MP.sel = mv(pickerOrder(), MP.sel); drawPicker(); }
  }
});
$("mp-ok").onclick = () => closePicker(true);
$("mp-cancel").onclick = $("mp-x").onclick = () => closePicker(false);

// Which machine a file opens with: the one used last time, the default for its extension, or the user's pick.
async function machineFor(path, name, suggested, text){
  const r = SETTINGS.recent.find(x => x.path===path);
  if (r && MACHINES[r.machine]) return { id:r.machine, why:"recent" };
  const ext = extOf(name), d = SETTINGS.extDefaults[ext];
  if (d && MACHINES[d]) return { id:d, why:"ext", ext };
  const id = await pickMachine({ title:`Open ${name}`, ok:"Open", ext, sel:suggested, suggest:suggestControls(name, text),
    text:`Which machine is ${name} for? The gloss words and checks follow its profile. GlossCode remembers your choice for this file.` });
  return id ? { id, why:"picked" } : null;
}
function openedMsg(m){
  const mm = MACHINES[machineId];
  const eob = fileEob && mm.eob ? ` Lines end with ; as ${mm.name} needs.` : fileEob ? " Its lines end with ;, which are kept when you save." : mm.eob ? ` ${mm.name} needs ; at the end of each line, so it's added when you save.` : "";
  const why = m.why==="recent" ? ` Machine: ${mm.name}, as last time.` : m.why==="ext" ? ` Machine: ${mm.name}, the default for ${m.ext} files.` : ` Machine: ${mm.name}.`;
  setMsg(`Opened ${fileName}.${why}${eob}`);
}

/* New program: pick the machine, then a blank program in a new tab. */
async function newProgram(){
  if (editing && !commit()) return;
  const id = await pickMachine({ title:"New program", ok:"Create", sel:activeTab >= 0 ? machineId : undefined,
    text:"Which machine is the new program for? The gloss words, checks and Insert menu follow its profile." });
  if (!id) return;
  const taken = new Set(TABS.map(tabName));
  let n = 1; while (taken.has(`Untitled-${n}.nc`)) n++;
  openProgram({ name:`Untitled-${n}.nc`, machine:id, src:[""] });
  setMsg(`New program for ${MACHINES[id].name}. Type to add the first word. Save asks where to keep it.`);
}

/* Opening files. In the program: the system Open dialog, or a path from the recent list. */
async function openNativeResult(r, machine){
  const open = TABS.findIndex(t => t.path===r.path);
  if (open >= 0){ activate(open); setMsg(`${r.name} is already open.`); return; }
  const m = machine && MACHINES[machine] ? { id:machine, why:"recent" } : await machineFor(r.path, r.name, undefined, r.text ?? r.doc.lines.map(l => l.raw).join("\n"));
  if (!m) return;
  // A control with its own block syntax (Fagor 8060: ";" is a comment) has the text read again its way
  const syntax = dialectFor(MACHINES[m.id].brand, MACHINES[m.id].type).blockSyntax;
  if (syntax && r.text!=null){ try { const d = await NATIVE.core("parse", { text:r.text, syntax }); if (d?.lines) r.doc = d; } catch { /* keep the usual reading */ } }
  const native = { eol:r.doc.eol, finalEol:r.doc.finalEol, latin1:r.latin1, raw:rawMap(r.doc.lines.map(l => [l.tok, l.raw])) };
  if (openProgram({ name:r.name, path:r.path, machine:m.id, src:r.doc.lines.map(l => l.raw), native })) openedMsg(m);
}
// Each block's original text, by its words, so unchanged lines are written back exactly as they were.
function rawMap(pairs){ const m = new Map(); for (const [tok, raw] of pairs){ const k = tok.join(" "); if (!m.has(k)) m.set(k, []); m.get(k).push(raw ?? k); } return m; }
async function nativeOpen(){
  let r;
  try { r = await NATIVE.open(cur()?.path || SETTINGS.recent[0]?.path || null); } catch (e){ setMsg(String(e?.message || e), true); return; }
  if (r) await openNativeResult(r);
}
async function openRecent(r){
  const open = TABS.findIndex(t => t.path===r.path);
  if (open >= 0){ activate(open); return; }
  if (!NATIVE){ if (FILES[r.name]) openSample(r.name, r.machine); else await missingRecent(r); return; }
  let there = true;
  try { there = await NATIVE.exists(r.path); } catch { /* older bridge: just try to open it */ }
  if (!there) return missingRecent(r);
  let res;
  try { res = await NATIVE.openPath(r.path); }
  catch (e){ setMsg(String(e?.message || e) + " Check that you can open it, or ✕ removes it from the list.", true); return; }
  await openNativeResult(res, r.machine);
}
/* A recent program that isn't where it was: find it with the Open dialog, or take it off the list. */
let MF = null;
function askMissing(r){
  if (MF) MF.resolve(null);
  return new Promise(resolve => {
    MF = { resolve };
    $("mf-title").textContent = `Can't find ${r.name}`;
    $("mf-text").textContent = `It may have been moved, renamed or deleted, or it's on a drive that isn't connected. Locate it to open it and keep it in the list with ${MACHINES[r.machine]?.name || "its machine"}, or remove it from the list.`;
    $("mf-path").textContent = r.path;
    $("mfdlg").hidden = false; $("mf-locate").focus();
  });
}
function closeMissing(choice){
  if (!MF) return;
  const m = MF; MF = null; $("mfdlg").hidden = true;
  m.resolve(choice);
}
$("mf-locate").onclick = () => closeMissing("locate");
$("mf-remove").onclick = () => closeMissing("remove");
$("mf-cancel").onclick = $("mf-x").onclick = () => closeMissing(null);
$("mfdlg").addEventListener("keydown", e => { if (e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); closeMissing(null); } });
async function missingRecent(r){
  const choice = await askMissing(r);
  if (choice==="remove"){ forget(r.path); setMsg(`Removed ${r.name} from recent programs.`); return; }
  if (choice!=="locate") return;
  if (!NATIVE){ openDlg(); return; }
  let res;
  try { res = await NATIVE.open(r.path); } catch (e){ setMsg(String(e?.message || e), true); return; }
  if (!res) return;
  // The file it was is gone, so the one picked takes its place in the list, with the same machine.
  if (res.path!==r.path){ SETTINGS.recent = SETTINGS.recent.filter(x => x.path!==r.path); saveSettings(); drawHome(); }
  await openNativeResult(res, r.machine);
}
// The mockup's sample programs (browser only). Without a machine, it's treated like a file never opened before.
async function openSample(name, machine){
  const f = FILES[name]; if (!f) return;
  const open = TABS.findIndex(t => t.sample && t.path===name);
  if (open >= 0){ activate(open); return; }
  const m = machine && MACHINES[machine] ? { id:machine, why:"recent" } : await machineFor(name, name, f.machine, f.src.join("\n"));
  if (!m) return;
  if (openProgram({ name, path:name, sample:true, machine:m.id, src:f.src, expand:f.expand })) openedMsg(m);
}
async function nativeSave(as){
  const t = cur(); if (!t) return;
  const nf = t.native, ver = docVer;
  const pool = new Map([...nf.raw].map(([k, v]) => [k, [...v]]));
  const lines = doc.map(tk => { const k = tk.join(" "), raws = pool.get(k); return raws?.length ? { tok:tk, raw:raws.shift() } : { tok:tk }; });
  let r;
  try {
    r = await NATIVE.save({ path:as || t.sample ? null : t.path, name:fileName, latin1:nf.latin1,
      doc:{ lines, eob:eobOn(), eol:nf.eol, finalEol:nf.finalEol, ...(SYNTAX ? { syntax:SYNTAX } : {}) } });
  } catch (e){ setMsg(String(e?.message || e), true); return; }
  if (!r) return;
  t.path = r.path; t.sample = false; t.savedVer = ver;
  nf.raw = rawMap(lines.map(l => [l.tok, l.raw]));
  t.name = r.name; if (t===cur()) setTitle(r.name + " - GlossCode");
  remember(t); drawTabs();
  setMsg(`Saved ${r.path} (${r.bytes} bytes)${eobOn() ? ", with ; at the end of every line" : ""}.`);
}

/* The home page. */
const when = ms => { if (!ms) return ""; const d = new Date(ms), now = new Date();
  return d.toDateString()===now.toDateString() ? "Today " + d.toLocaleTimeString([], { hour:"numeric", minute:"2-digit" }) : d.toLocaleDateString(); };
// Your machines first, then the Generic machine for each type and control.
function machineOptions(sel){
  const opt = id => `<option value="${id}"${id===sel ? " selected" : ""}>${esc(MACHINES[id].name)}${MACHINES[id].generic ? "" : ` (${MACHINES[id].type})`}</option>`;
  const mine = [...USER_MACHINES];
  return (mine.length ? `<optgroup label="Your machines">${mine.map(opt).join("")}</optgroup>` : "")
    + MACHINE_TYPES.map(t => `<optgroup label="Generic ${esc(typeLabel(t).toLowerCase())}">${controlsFor(t).map(c => opt(genId(t, c))).join("")}</optgroup>`).join("")
    + (sel && MACHINES[sel]?.lib ? opt(sel) : "");
}
function drawHome(){
  const el = $("home"); if (!el || activeTab >= 0) return;
  const rec = SETTINGS.recent;
  const ri = (r, sample) => {
    const m = MACHINES[r.machine];
    return `<div class="ri" role="button" tabindex="0" data-p="${esc(r.path)}"${sample ? ` data-sample="1"` : ""} title="${esc(r.path)}"><span class="ic"></span><span class="nm">${esc(r.name)}</span>`
      + `<span class="pth">${esc(sample ? "Sample program" : folderOf(r.path) || r.path)}</span>`
      + `<span class="mc">${m ? esc(m.name) : "Machine not found"}<small>${sample ? "" : esc(when(r.time))}</small></span>`
      + (sample ? "<span></span>" : `<button class="rx" data-forget="${esc(r.path)}" aria-label="Remove ${esc(r.name)} from recent programs" title="Remove from this list">✕</button>`) + `</div>`;
  };
  const samples = Object.keys(FILES || {});
  const defs = Object.entries(SETTINGS.extDefaults).sort();
  el.innerHTML = `<div>
      <h2>GlossCode</h2><p class="hsub">Open a recent program, or start a new one.</p>
      <div class="hacts"><button class="btn pri" data-act="new">New program…</button><button class="btn" data-act="open">Open…</button></div>
      <h3>Recent programs</h3>
      ${rec.length ? `<div class="rlist">${rec.map(r => ri(r)).join("")}</div>` : `<div class="none">Programs you open or save show up here, with the machine you used.</div>`}
      ${samples.length ? `<h3>Sample programs <span style="font-weight:400;color:#888">(in this mockup only)</span></h3><div class="rlist">${samples.map(n => ri({ path:n, name:n, machine:FILES[n].machine }, true)).join("")}</div>` : ""}
    </div>
    <div class="side2">
      <h3>Default machine by file type</h3>
      <p>A file you haven't opened before uses the default for its extension instead of asking. Files in the recent list open with the machine used last time.</p>
      <table class="dt"><tbody>
        ${defs.map(([ext, id]) => `<tr><td>${esc(ext)}</td><td><select data-ext="${esc(ext)}" aria-label="Default machine for ${esc(ext)} files">${MACHINES[id] ? "" : `<option selected>Not found</option>`}${machineOptions(id)}</select></td><td><button data-delext="${esc(ext)}" aria-label="Remove the default for ${esc(ext)}" title="Remove">✕</button></td></tr>`).join("")}
        <tr><td><input id="dt-ext" placeholder=".nc" aria-label="File extension" spellcheck="false"></td><td><select id="dt-m" aria-label="Machine">${machineOptions(recentMachines.find(id => MACHINES[id]))}</select></td><td><button class="btn" id="dt-add" style="padding:2px 8px">Add</button></td></tr>
      </tbody></table>
      <h3>Example programs</h3>
      <p>Sample programs for Haas, Fanuc and Okuma mills and lathes are a separate download, so they don't clutter the program. <a href="${EXAMPLES_URL}" target="_blank" rel="noopener">Get the examples</a></p>
    </div>`;
}
$("home").addEventListener("click", e => {
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act==="new") return newProgram();
  if (act==="open") return openDlg();
  const fg = e.target.closest("[data-forget]"); if (fg) return forget(fg.dataset.forget);
  const del = e.target.closest("[data-delext]"); if (del){ delete SETTINGS.extDefaults[del.dataset.delext]; saveSettings(); drawHome(); return; }
  if (e.target.id==="dt-add") return addDefault();
  const ri = e.target.closest(".ri"); if (!ri) return;
  if (ri.dataset.sample) openSample(ri.dataset.p, FILES[ri.dataset.p].machine);
  else { const r = SETTINGS.recent.find(x => x.path===ri.dataset.p); if (r) openRecent(r); }
});
$("home").addEventListener("keydown", e => {
  if (e.key==="Enter" && e.target.classList.contains("ri")){ e.preventDefault(); e.target.click(); }
  if (e.key==="Enter" && e.target.id==="dt-ext"){ e.preventDefault(); addDefault(); }
});
$("home").addEventListener("change", e => {
  const ext = e.target.dataset?.ext; if (!ext || !MACHINES[e.target.value]) return;
  SETTINGS.extDefaults[ext] = e.target.value; saveSettings();
  setMsg(`${ext} files you haven't opened before now open for ${MACHINES[e.target.value].name}.`);
});
function addDefault(){
  let ext = $("dt-ext").value.trim().toLowerCase(); if (ext && ext[0]!==".") ext = "." + ext;
  if (!/^\.[a-z0-9_-]{1,12}$/.test(ext)){ setMsg("Type a file extension such as .nc or .min.", true); $("dt-ext").focus(); return; }
  const id = $("dt-m").value; SETTINGS.extDefaults[ext] = id; saveSettings(); drawHome();
  setMsg(`${ext} files you haven't opened before now open for ${MACHINES[id].name}.`);
}

/* File menu, keys, and the hooks the editor calls. */
Object.defineProperty(MENUS, "File", { enumerable:true, configurable:true, get(){
  const rec = SETTINGS.recent.slice(0, 8);
  return [
    { label:"New…", sc:"Ctrl+N", fn:newProgram },
    { label:"Open…", sc:"Ctrl+O", fn:() => openDlg() },
    { label:"Save", sc:"Ctrl+S", fn:save, doc:true },
    { label:"Save As…", sc:"Ctrl+Shift+S", fn:saveAs, doc:true },
    { label:"Close", sc:"Ctrl+W", fn:() => closeTab(activeTab), doc:true },
    "-",
    { label:"Home", fn:() => activate(-1), dis:() => activeTab < 0 },
    { label:"Machine profiles…", fn:() => openProfiles(machineId) },
    { label:"Default machines by file type…", fn:() => { if (activate(-1)) $("dt-ext")?.focus(); } },
    "-", { grp:"Recent files" },
    ...(rec.length ? rec.map(r => ({ label:r.name, sc:MACHINES[r.machine]?.name || "", fn:() => openRecent(r) })) : [{ grp:"None yet" }])
  ];
}});
$("app").addEventListener("keydown", e => {
  const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (!ctrl || MP) return;
  if (k==="n" && !e.shiftKey){ e.preventDefault(); newProgram(); }
  else if (k==="w" && !e.shiftKey){ e.preventDefault(); if (activeTab >= 0) closeTab(activeTab); }
  else if (e.key==="Tab" || e.key==="PageDown" || e.key==="PageUp"){
    e.preventDefault();
    const back = e.key==="PageUp" || (e.key==="Tab" && e.shiftKey), n = TABS.length + 1;   // Home counts as a tab
    activate((activeTab + 1 + (back ? -1 : 1) + n) % n - 1);
  }
});
window.drawTabs = drawTabs;
window.saveTimelineModes = m => { SETTINGS.timeline = m; saveSettings(); };
window.saveDraftDismissed = list => { SETTINGS.draftDismissed = list; saveSettings(); };
window.saveFoldPrefs = p => { SETTINGS.folding = p; saveSettings(); };
window.saveTextPrefs = p => { SETTINGS.text = p; saveSettings(); };
window.drawHome = drawHome;
window.openSample = openSample;
window.openProgram = openProgram;
// Program › Convert remembers each answer per pair of controls ("haas>fanuc": { "call.local": "comment" }).
window.convertAnswers = pair => ((SETTINGS.convert ||= {})[pair] ||= {});
window.saveConvertAnswers = () => saveSettings();
window.tabMachineChanged = () => { const t = cur(); if (t?.path) remember(t); };
window.markSaved = () => { const t = cur(); if (t){ t.savedVer = docVer; remember(t); drawTabs(); } };
window.nativeOpen = nativeOpen;
window.nativeSave = nativeSave;

// Start on the home page, then open the file named on the command line (or ?open=NAME in the mockup).
(async () => {
  try {
    await loadSettings();
    showActive();
    if (NATIVE){ const r = await NATIVE.startup(); if (r) await openNativeResult(r); }
    else { const q = new URLSearchParams(location.search).get("open"); if (q && FILES[q]) await openSample(q, FILES[q].machine); }
  } catch (e){ setMsg(String(e?.message || e), true); }
})();
})();
