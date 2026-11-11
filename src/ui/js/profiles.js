/* ---------- Machine profiles ---------- */
function saveAs(){ if (activeTab < 0) return; if (editing) commit(); if (window.GlossCodeNative) return nativeSave(true); setMsg("Save As shows the standard Windows Save dialog."); }
function bumpRecent(id){ recentMachines = [id, ...recentMachines.filter(x => x!==id)].slice(0, 6); window.saveMachines?.(); }
function useMachine(id){
  if (editing && !commit()) return;
  if (MACHINES[id]?.lib) id = addFromLibrary(id);
  const was = SYNTAX;
  machineId = id; bumpRecent(id); setDialect();
  // A control with another block syntax (Fagor) splits lines into words differently, so the open program is read again.
  if (was!==SYNTAX && doc.length){ const nd = []; doc.forEach(t => splitBlocks(t.join(" ")).blocks.forEach(b => nd.push(tokenize(b)))); doc = nd; lineState = []; }
  window.tabMachineChanged?.(); render();
  setMsg(`Machine: ${machineLabel(id)}. Words and checks now follow ${MACHINES[id].generic ? controlLabel(MACHINES[id].brand) : "its profile"}.${MACHINES[id].eob ? " Lines end with ; on this control." : ""}`);
}
// The user's profiles as saved: what's in USER_DATA, without the fields GlossCode works out.
function persistMachines(){ window.saveMachines?.(); }
// A library model becomes one of the user's profiles (same id), to fill in or leave as it is.
function addFromLibrary(id){
  if (USER_MACHINES.has(id)) return id;
  const { lib, control, ...m } = MACHINES[id];
  USER_DATA[id] = { ...m, travel:[...m.travel], from:id };
  rebuildMachines(); persistMachines();
  setMsg(`Added ${m.name} to your machines. Machine › Edit this machine… fills in what's missing.`);
  return id;
}
function newMachineId(){ let n = 1; while (MACHINES["m" + n] || PDRAFT?.data["m" + n]) n++; return "m" + n; }
function drawMachineChip(){
  const c = document.getElementById("mchip"); if (!c) return;
  const m = MACHINES[machineId];
  c.innerHTML = `<span class="mlab">Machine</span><b>${esc(m.name)}</b><span class="mtype">${m.type}</span><span class="car">▾</span>`;
  c.title = `${m.name} · ${m.control} ${m.type}`;
}
let mmenu = null;
function closeMachineMenu(){ mmenu?.remove(); mmenu = null; document.getElementById("mchip").classList.remove("open"); }
function openMachineMenu(){
  closeMenu(); if (mmenu){ closeMachineMenu(); return; }
  const chip = document.getElementById("mchip"); chip.classList.add("open");
  const rec = recentMachines.filter(id => MACHINES[id]);
  const row = (id) => `<div class="it" data-id="${id}"><span class="ck">${id===machineId ? "●" : ""}</span><span>${esc(MACHINES[id].name)} <span class="sub">${esc(MACHINES[id].control)} · ${MACHINES[id].type}</span></span><span class="sc"></span></div>`;
  const act = (a, label) => `<div class="it" data-act="${a}"><span class="ck"></span><span>${label}</span><span class="sc"></span></div>`;
  const mine = USER_MACHINES.has(machineId);
  mmenu = document.createElement("div"); mmenu.className = "menu mmenu";
  mmenu.innerHTML = (rec.length ? `<div class="grp">Recent machines</div>${rec.map(row).join("")}<div class="sep"></div>` : "")
    + act("choose", "Choose a machine…")
    + act("edit", mine ? "Edit this machine…" : "Make a profile for this machine…")
    + act("new", "New machine profile…")
    + act("all", "Manage machine profiles…");
  mmenu.style.right = "6px";
  menubar.appendChild(mmenu);
  mmenu.addEventListener("mousedown", async e => {
    e.preventDefault();
    const it = e.target.closest(".it"); if (!it) return;
    closeMachineMenu();
    const a = it.dataset.act, m = MACHINES[machineId];
    if (it.dataset.id) useMachine(it.dataset.id);
    else if (a==="choose"){ const id = await window.pickMachine?.({ title:"Choose a machine", ok:"Use", sel:machineId, text:"Pick the machine type, then the control, then the machine. Generic works when you don't have a profile for it." }); if (id) useMachine(id); }
    else if (a==="new") openProfiles(null, { type:m.type, brand:m.brand });
    else if (a==="edit") openProfiles(mine ? machineId : null, mine ? null : { type:m.type, brand:m.brand, from:machineId });
    else openProfiles(mine ? machineId : null);
  });
}
document.addEventListener("mousedown", e => { if (mmenu && !mmenu.contains(e.target) && !e.target.closest("#mchip")) closeMachineMenu(); });
menubar.addEventListener("mousedown", e => { if (e.target.closest("#mchip")){ e.preventDefault(); openMachineMenu(); } });
menubar.addEventListener("keydown", e => { if (e.target.id==="mchip" && (e.key==="Enter" || e.key===" ")){ e.preventDefault(); openMachineMenu(); } });

/* Machine profiles window: the user's own machines. Changes go to a draft (PDRAFT) that Save keeps and Cancel drops.
   New starts from a machine type and control (Generic numbers: none), Copy from the selected profile, and
   Add from library from a known model. Delete removes a profile: programs that used it switch to the Generic
   machine for the same type and control. */
const pdlg = document.getElementById("pdlg");
let pSel = null, PDRAFT = null;
const pEl = id => document.getElementById(id);
function draftNew(o = {}){
  const id = newMachineId();
  const src = o.from && MACHINES[o.from] && !MACHINES[o.from].generic ? MACHINES[o.from] : null;
  const type = o.type || src?.type || "mill", brand = o.brand || src?.brand || "generic";
  const { lib, generic, control, from, ...base } = src || machineDefaults({ type, brand });
  PDRAFT.data[id] = { ...base, travel:[...base.travel], type, brand, macro: src ? base.macro : true,
    name: src ? (o.copy ? `${src.name} copy` : src.name) : `New ${brand==="generic" ? "" : controlLabel(brand) + " "}${typeLabel(type).toLowerCase()}`, isNew:true };
  return id;
}
function openProfiles(id, make){
  if (editing && !commit()) return;
  PDRAFT = { data: JSON.parse(JSON.stringify(USER_DATA)), deleted:[] };
  pSel = make ? draftNew(make) : id && PDRAFT.data[id] ? id : Object.keys(PDRAFT.data)[0] || null;
  drawProfiles(); pdlg.hidden = false;
  (pSel ? pEl("pf-name") : pEl("p-new")).focus();
  if (make) pEl("pf-name").select();
}
function drawProfiles(){
  const D = PDRAFT.data, ids = Object.keys(D);
  pEl("plist").innerHTML = ids.length ? MACHINE_TYPES.filter(t => ids.some(i => D[i].type===t)).map(t => `<div class="pgh">${esc(typeLabel(t))}</div>`
    + ids.filter(i => D[i].type===t).map(i => `<div class="pi${i===pSel ? " sel" : ""}" data-id="${i}"><b>${esc(D[i].name)}</b><span>${esc(controlLabel(D[i].brand))}${i===machineId ? " · in use" : ""}</span></div>`).join("")).join("")
    : `<div class="pnone">No machine profiles yet. Generic machines work without one; add a profile to set your machine's numbers and options.</div>`;
  const libs = Object.keys(MACHINE_LIBRARY).filter(i => !D[i]);
  pEl("p-lib").innerHTML = `<option value="">Add from library…</option>` + MACHINE_TYPES.map(t => libs.filter(i => MACHINE_LIBRARY[i].type===t)).filter(g => g.length)
    .map(g => `<optgroup label="${esc(typeLabel(MACHINE_LIBRARY[g[0]].type))}">${g.map(i => `<option value="${i}">${esc(MACHINE_LIBRARY[i].name)} · ${esc(controlLabel(MACHINE_LIBRARY[i].brand))}</option>`).join("")}</optgroup>`).join("");
  pEl("p-lib").disabled = !libs.length;
  pEl("p-dup").disabled = pEl("p-del").disabled = !pSel;
  pEl("pform").hidden = !pSel; pEl("pempty").hidden = !!pSel;
  if (!pSel) return;
  const m = D[pSel];
  pEl("pf-name").value = m.name;
  pEl("pf-type").innerHTML = MACHINE_TYPES.map(t => `<option value="${t}"${t===m.type ? " selected" : ""}>${esc(typeLabel(t))}</option>`).join("");
  const ctrls = controlsFor(m.type);
  if (!ctrls.includes(m.brand)) m.brand = ctrls[0];
  pEl("pf-ctrl").innerHTML = ctrls.map(c => `<option value="${c}"${c===m.brand ? " selected" : ""}>${esc(controlLabel(c))}</option>`).join("");
  pEl("pf-csrc").textContent = RULES.dialects[m.brand]?.about || (RULES.dialects[m.brand]?.verified===false ? "Written from general knowledge; not yet checked against this control's manual." : "");
  const v = x => x==null ? "" : x;
  ["x","y","z"].forEach((a, i) => pEl("pf-"+a).value = v(m.travel[i]));
  pEl("pf-y").disabled = m.type==="lathe" && !m.yAxis;
  // Lathe options decide which Insert › Canned cycle categories and words are offered.
  pEl("pf-optl").hidden = pEl("pf-opts").hidden = m.type!=="lathe";
  // A plasma table has no spindle or tool changer.
  document.querySelectorAll(".pgrid .spinrow").forEach(x => x.hidden = m.type==="plasma");
  pEl("pf-live").checked = !!m.liveTooling;
  pEl("pf-yax").checked = !!m.yAxis;
  pEl("pf-ptail").checked = !!m.progTailstock;
  pEl("pf-rpm").value = v(m.rpm);
  pEl("pf-feed").value = v(m.feed);
  pEl("pf-tools").value = v(m.tools);
  pEl("pf-eob").checked = !!m.eob;
  pEl("pf-macro").checked = !!m.macro;
  pEl("pf-notes").value = m.notes || "";
  pEl("pf-from").textContent = m.from && MACHINE_LIBRARY[m.from] ? `From the library: ${MACHINE_LIBRARY[m.from].name}. Empty boxes are numbers we weren't sure of; fill them in from your spec sheet.` : "Empty boxes aren't checked. Fill in what you know from the spec sheet.";
  const ov = DICT.machineOverrides?.[m.brand] || {};
  const keys = Object.keys(ov);
  pEl("pf-codes").innerHTML = keys.length
    ? keys.map(k => `<tr><td>${esc(k)}</td><td class="en">${esc(ov[k].words)}</td><td>${esc(ov[k].short)}</td><td>${esc(ov[k].desc)}</td></tr>`).join("")
    : `<tr><td colspan="4" class="none">${esc(controlLabel(m.brand))} has no codes of its own: it reads the shared dictionary${RULES.dialects[m.brand]?.inherits ? " and " + esc(controlLabel(RULES.dialects[m.brand].inherits)) + "'s codes" : ""}.</td></tr>`;
}
function readProfileForm(){
  if (!pSel || !PDRAFT?.data[pSel]) return;
  const m = PDRAFT.data[pSel], num = id => { const t = pEl(id).value.trim(); if (t==="") return null; const n = parseFloat(t); return isFinite(n) ? n : null; };
  Object.assign(m, {
    name: pEl("pf-name").value.trim() || m.name,
    type: pEl("pf-type").value,
    brand: pEl("pf-ctrl").value,
    travel: [num("pf-x"), num("pf-y"), num("pf-z")],
    rpm: num("pf-rpm"), feed: num("pf-feed"), tools: num("pf-tools"),
    eob: pEl("pf-eob").checked,
    macro: pEl("pf-macro").checked,
    liveTooling: pEl("pf-live").checked,
    yAxis: pEl("pf-yax").checked,
    progTailstock: pEl("pf-ptail").checked,
    notes: pEl("pf-notes").value
  });
}
pEl("plist").addEventListener("click", e => { const it = e.target.closest(".pi"); if (!it) return; readProfileForm(); pSel = it.dataset.id; drawProfiles(); });
pEl("pf-type").onchange = () => { readProfileForm(); drawProfiles(); };
pEl("pf-yax").onchange = () => { readProfileForm(); drawProfiles(); };
pEl("pf-ctrl").onchange = () => { readProfileForm(); drawProfiles(); };
pEl("p-new").onclick = () => { readProfileForm(); const m = PDRAFT.data[pSel] || MACHINES[machineId]; pSel = draftNew({ type:m.type, brand:m.brand }); drawProfiles(); pEl("pf-name").select(); };
pEl("p-dup").onclick = () => { if (!pSel) return; readProfileForm(); const src = PDRAFT.data[pSel]; const id = newMachineId(); PDRAFT.data[id] = { ...JSON.parse(JSON.stringify(src)), name:`${src.name} copy`, isNew:true }; pSel = id; drawProfiles(); pEl("pf-name").select(); };
pEl("p-del").onclick = () => {
  if (!pSel) return; readProfileForm();
  const m = PDRAFT.data[pSel];
  if (!m.isNew && !confirm(`Delete the machine profile "${m.name}"?\n\nPrograms that used it will open with the Generic ${controlLabel(m.brand)} ${m.type} instead. This happens when you click Save.`)) return;
  if (!m.isNew) PDRAFT.deleted.push(pSel);
  delete PDRAFT.data[pSel]; pSel = Object.keys(PDRAFT.data)[0] || null; drawProfiles();
};
pEl("p-lib").onchange = () => {
  const id = pEl("p-lib").value; if (!id) return;
  readProfileForm();
  PDRAFT.data[id] = { ...machineDefaults(MACHINE_LIBRARY[id]), from:id };
  pSel = id; drawProfiles(); pEl("pf-name").focus();
};
function saveProfiles(use){
  readProfileForm();
  const before = { ...USER_DATA };
  for (const k of Object.keys(USER_DATA)) delete USER_DATA[k];
  for (const [id, m] of Object.entries(PDRAFT.data)){ const { isNew, ...keep } = m; USER_DATA[id] = keep; }
  rebuildMachines();
  // Programs, recent files and defaults that used a deleted profile move to the Generic machine for its type and control.
  for (const [id, old] of Object.entries(before)) if (!USER_MACHINES.has(id)){
    const repl = MACHINES[id] ? id : genId(old.type, controlsFor(old.type).includes(old.brand) ? old.brand : "generic");   // a library model's id stays usable
    recentMachines = recentMachines.filter(x => x!==id);
    window.machineDeleted?.(id, repl);
    if (machineId===id) machineId = repl;
  }
  persistMachines();
  pdlg.hidden = true; PDRAFT = null;
  if (use && pSel && MACHINES[pSel]){ useMachine(pSel); setMsg(`Saved your machine profiles and switched to ${MACHINES[pSel].name}.`); }
  else { setDialect(); render(); drawMachineChip(); setMsg("Saved your machine profiles."); }
}
pEl("p-save").onclick = () => saveProfiles(true);
pEl("p-save2").onclick = () => saveProfiles(false);
pEl("p-cancel").onclick = pEl("p-x").onclick = () => { PDRAFT = null; pdlg.hidden = true; drawMachineChip(); };
// Settings: the profiles and recent machines are kept in settings.json (see loadSettings).
window.loadMachines = (machines, recent) => {
  // Once saved, the list in settings is the whole list (so a deleted sample profile stays deleted in the mockup)
  if (machines && typeof machines==="object" && !Array.isArray(machines)){ for (const k of Object.keys(USER_DATA)) delete USER_DATA[k]; Object.assign(USER_DATA, machines); }
  rebuildMachines();
  if (Array.isArray(recent)) recentMachines = recent.filter(id => typeof id==="string");
  if (!MACHINES[machineId]) machineId = genId("mill", "generic");
};
window.machineData = () => ({ machines:JSON.parse(JSON.stringify(USER_DATA)), recentMachines:[...recentMachines] });

const dlg = document.getElementById("dlg"), dlgName = document.getElementById("dlg-name");
const LIST = [
  ["Archive", "10/12/2026 4:10 PM", "File folder", "", true],
  ["Fixtures", "9/30/2026 8:02 AM", "File folder", "", true],
  ["CHECKS_DEMO.nc", "10/31/2026 7:40 AM", "NC File", "1 KB"],
  ["FLANGE_OP1.nc", "10/29/2026 2:44 PM", "NC File", "1 KB"],
  ["LATHE_CHECKS.nc", "10/31/2026 7:44 AM", "NC File", "1 KB"],
  ["BRACKET_0MC.nc", "10/31/2026 11:02 PM", "NC File", "1 KB"],
  ["OKUMA_PLATE.MIN", "10/31/2026 7:48 AM", "MIN File", "1 KB"],
  ["POCKET_2X1.nc", "10/31/2026 6:20 AM", "NC File", "1 KB"],
  ["SHAFT_OD.nc", "10/30/2026 11:15 AM", "NC File", "1 KB"],
  ["PLASMA_BRACKET.nc", "11/2/2026 2:30 AM", "NC File", "1 KB"],
  ["SLOTS_PLATE.nc", "11/1/2026 1:40 AM", "NC File", "1 KB"]
];
let dlgSel = null;
function drawDlg(){
  document.getElementById("dlg-files").innerHTML = LIST.map(([n,d,t,s,dir]) => `<tr class="f${n===dlgSel?" sel":""}" data-n="${n}" data-dir="${dir?1:""}"><td><span class="ic ${dir?"dir":"nc"}"></span>${n}</td><td>${d}</td><td>${t}</td><td>${s}</td></tr>`).join("");
  dlgName.textContent = dlgSel || "";
}
function openDlg(){ if (editing) commit(); if (window.GlossCodeNative) return nativeOpen(); dlgSel = fileName; drawDlg(); dlg.hidden = false; }
document.getElementById("dlg-files").addEventListener("click", e => { const r = e.target.closest("tr"); if (!r || r.dataset.dir) return; dlgSel = r.dataset.n; document.querySelectorAll("#dlg-files tr").forEach(x => x.classList.toggle("sel", x===r)); dlgName.textContent = dlgSel; });
document.getElementById("dlg-files").addEventListener("dblclick", e => { const r = e.target.closest("tr"); if (!r || r.dataset.dir) return; dlg.hidden = true; load(r.dataset.n); });
document.getElementById("dlg-open").onclick = () => { dlg.hidden = true; if (dlgSel && FILES[dlgSel]) load(dlgSel); };
document.getElementById("dlg-cancel").onclick = document.getElementById("dlg-x").onclick = () => { dlg.hidden = true; };
