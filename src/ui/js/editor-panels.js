/* ---------- Panels around the editor: status bar, info line, active modes, variables ----------
   status() fills the status bar (machine, units, line count, problems); setMsg() shows a message there. showInfo()
   fills the info line under the editor for the selected word: its gloss, unit and meaning, its problems, and a button
   for the canned cycle guide (F1). drawModes() draws the active modes panel (what is in effect at the current line,
   from lineState), and drawVarPanel() the macro variables panel with the values the simulation worked out. */
function status(){
  const st = lineState[curLine] || newState();
  $("st-pos").textContent = `Ln ${curLine+1}`;
  $("st-mode").textContent = simIdx!=null ? "Simulating" : "Editing code";
  $("st-modal").textContent = (style==="short" ? [st.units==="inch"?"INCH":"MM", st.dist==="abs"?"ABS":"INCR", ...(DIALECT.process ? [st.torch && DIALECT.process.on.includes(st.torch) ? "PLON" : "PLOFF"] : [st.feed==="perMin"?"FPM":"FPR", st.spin==="rpm"?"RPM":"SFM"])]
    : [st.units==="inch"?"set.inch":"set.mm", st.dist==="abs"?"set.abs":"set.incr", ...(DIALECT.process ? [st.torch && DIALECT.process.on.includes(st.torch) ? "torch.on" : "torch.off"] : [st.feed==="perMin"?"set.fpm":"set.fpr", st.spin==="rpm"?"set.rpm":"set.sfm"])]).join("  ");
  const cnt = sev => PROBLEMS.filter(p => p.sev===sev).length;
  const e = cnt("error"), w = cnt("warning"), i = cnt("info");
  $("st-warn").innerHTML = (e || w || i) ? `<span class="se">✕ ${e}</span> <span class="sw2">⚠ ${w}</span> <span class="si">i ${i}</span>` : `<span class="ok">✓ No problems</span>`;
}
function setMsg(t, bad){ const m = $("st-msg"); m.textContent = t || ""; m.className = "msg" + (bad ? " bad" : ""); }
// The canned cycle a line uses: one written on the line, or the active one on a continuation line.
function lineCycle(li){
  const k = (doc[li] || []).filter(t => /^G\d/.test(t)).map(pad2).find(c => DIALECT.cycles?.[c]);
  return k || lineState[li]?.cycleCode || null;
}
const cycBtn = code => code && DIALECT.cycles?.[code] ? `<button class="cyc" data-cyc="${code}" title="F1">How ${code} works…</button>` : "";
function showInfo(li, idx, warn){
  const c = idx!=null ? view[li]?.[idx] : null; const box = $("info");
  if (!c){
    const lp = PBYLINE[curLine];
    box.innerHTML = (lp ? lp.map(p => `<span class="warn ${p.sev}"><b>${esc(p.title)}.</b> ${esc(p.msg)}</span>`).join("") : "<span>Hover a word to see what it means.</span>") + cycBtn(lineCycle(curLine));
    return;
  }
  box.innerHTML = `<span><span class="k">${esc(c.g)}</span> &nbsp;→&nbsp; <span class="k">${esc(c.e || "—")}${c.u ? `<small class="u">${esc(c.u)}</small>` : ""}</span></span><span>${esc(c.d)}</span>` + (warn ? `<span class="warn">${esc(warn)}</span>` : "") + varValues(li, idx, c) + (c.unk ? `<span class="warn">Unknown words are flagged instead of guessed.</span>` : "") + (c.cs ? `<span>Control-specific: ${esc(MACHINES[machineId].name)} has this code, but it isn't a standard one most controls share.</span>` : "")
    + cycBtn(c.code && DIALECT.cycles?.[c.code] ? c.code : lineCycle(li));
}
// For a word like X-#101, what it worked out to each time the simulation ran the line (a subprogram can run with
// different values on each call).
function varValues(li, idx, c){
  if (!isVarVal(c.g)) return "";
  const list = EXEC.vals?.[li + ":" + idx];
  if (!list) return `<span style="color:var(--c-777777)">This line doesn't run in the simulation, so the value isn't known.</span>`;
  const d = lineState[li]?.units==="mm" ? 3 : 4, shown = list.slice(0, 8).map(v => v==null ? "not set" : String(+v.toFixed(d)));
  return `<span>${list.length===1 ? "Works out to" : `Works out to ${list.length} values as it runs:`} <span class="k">${esc(shown.join(", "))}${list.length > 8 ? "…" : ""}</span>${list.includes(null) ? " (a variable used here was never set)" : ""}</span>`;
}
$("info").addEventListener("mousedown", e => {
  const b = e.target.closest(".cyc");
  if (!b) return;
  e.preventDefault();
  openCycleHelp(b.dataset.cyc);
});
// The fourth item says which machines show the row: "spindle" rows on mills and lathes, "process" rows
// on machines with a process instead of a spindle (a plasma torch).
// Klartext shows its own words for the path function (L FMAX, C DR+) and compensation (RL, RR, R0)
const KL_MODE_ROWS = ["Motion", "Feed rate", "Spindle", "Speed", "Coolant", "Tool", "Cutter comp"];
const MODE_ROWS = [
  ["Motion", st => SYNTAX==="klartext" ? st.klMove : st.cycleCode || st.motion, ["motion","cycleCode","klMove"]],
  ["Units", st => st.unitCode, ["unitCode"]],
  ["Positions", st => st.distCode, ["distCode"]],
  ["Plane", st => st.plane, ["plane"]],
  ["Feed mode", st => st.feedCode, ["feedCode"]],
  ["Feed rate", st => st.F, ["F"]],
  ["Torch", st => st.torch, ["torch"], "process"],
  ["Spindle", st => st.spinDir, ["spinDir"], "spindle"],
  ["Speed mode", st => st.spinCode, ["spinCode"], "spindle"],
  ["Speed", st => st.S, ["S"], "spindle"],
  ["Coolant", st => st.cool, ["cool"], "spindle"],
  ["Tool", st => st.T, ["T"], "spindle"],
  ["Length offset", st => st.tlen + (st.tlenOn && st.H ? " " + st.H : ""), ["tlen","H"], "spindle"],
  ["Cutter comp", st => SYNTAX==="klartext" ? st.klComp : st.comp, ["comp","klComp"]],
  ["Work offset", st => st.wcs, ["wcs"]]
];
function drawModes(){
  const st = lineState[curLine] || newState();
  const n = /^N\d+$/.test(doc[curLine]?.[0] || "") ? doc[curLine][0] : "line " + (curLine+1);
  $("mh").innerHTML = `Active modes at ${n} <span><span class="new">●</span> set on this line</span>`;
  $("modes").innerHTML = MODE_ROWS.filter(([lb, , , on]) => (lb!=="Positions" || DIALECT.modalGroups?.distance) && (lb!=="Work offset" || !DIALECT.process || DIALECT.modalGroups?.["work offset"]) && (lb!=="Feed mode" || !DIALECT.process || DIALECT.modalGroups?.["feed mode"]) && (!on || (on==="process")===!!DIALECT.process) && (SYNTAX!=="klartext" || KL_MODE_ROWS.includes(lb))).map(([lb, f, keys]) => {
    const code = f(st); const isNew = keys.some(k => st.chg.includes(k));
    if (lb==="Cutter comp" && DIALECT.process) lb = "Kerf comp";
    const en = !code ? "—" : code.split(" ").map(w => {
      const c = word(w, st, lb==="Work offset" ? "wcs" : null);
      return esc(c.e) + (c.u ? `<small class="u">${esc(c.u)}</small>` : "");
    }).join(" ");
    return `<span class="lb">${isNew ? '<span class="new">●</span> ' : ""}${lb}</span><span class="cd">${esc(code || "not set")}</span><span class="ew"${isNew?' style="color:var(--c-d13438)"':""}>${en}</span>`;
  }).join("");
  drawVarPanel();
}
/* Variables, under Active modes: every variable the program sets or reads (Fanuc-style #1-#999, Okuma V and named
   variables), its value at the line shown, and a start value the simulation begins with. A variable read before the
   program sets it is flagged: give it a start value. Common variables (#100-#999, Okuma VC) are kept on the machine,
   so their start values can be saved to the machine profile, where every program on that machine starts with them. */
const isCommonVar = k => { const m = /^#(\d+)$/.exec(k); return m ? +m[1] >= 100 : /^VC\d+$/.test(k); };
function varSeeds(){ return { ...(MACHINES[machineId]?.vars || {}), ...(TABS[activeTab]?.vars || {}) }; }
const varOrder = (a, b) => {
  const na = /^#(\d+)$/.exec(a), nb = /^#(\d+)$/.exec(b);
  return na && nb ? na[1] - nb[1] : na ? -1 : nb ? 1 : a.localeCompare(b, undefined, { numeric:true });
};
function varAt(u, k){ let v; for (const [s, x] of u.hist) if (s <= k) v = x; return v; }
function drawVarPanel(){
  const box = $("vars"), hd = $("vh"), U = EXEC.vars || {};
  const keys = Object.keys(U).sort(varOrder);
  hd.hidden = box.hidden = !keys.length; if (!keys.length) return;
  const k = simIdx!=null && simK!=null ? simK : stepIndexFor(curLine), here = EXEC.steps[k]?.li ?? curLine;
  const n = /^N\d+$/.test(doc[here]?.[0] || "") ? doc[here][0] : "line " + (here+1);
  const mv = MACHINES[machineId]?.vars || {}, tv = TABS[activeTab]?.vars || {};
  const lab = li => /^N\d/.test(doc[li]?.[0] || "") ? doc[li][0] : "line " + (li+1);
  hd.innerHTML = `Variables at ${n} <span>start values feed the simulation</span>`;
  const f = v => v==null ? "empty" : fmt4(v);
  box.innerHTML = `<span class="lb" style="color:var(--c-888888)">Name</span><span style="color:var(--c-888888)">Here</span><span style="color:var(--c-888888)">Start</span><span></span>` + keys.map(key => {
    const u = U[key], v = varAt(u, k), seeded = key in tv || key in mv;
    const warn = u.early!=null && !seeded ? `<span class="vw" title="${esc(key)} is read at ${esc(lab(u.early))} before the program sets it${isCommonVar(key) ? ". It's a common variable, so it's probably set at the machine: enter the value it has there" : ""}.">⚠ unset at ${esc(lab(u.early))}</span>`
      : u.set!=null ? `<span class="vw" style="color:var(--c-888888)" title="First set at ${esc(lab(u.set))}">set at ${esc(lab(u.set))}</span>`
      : key in mv && !(key in tv) ? `<span class="vw" style="color:var(--c-7a5bc0)" title="${esc(MACHINES[machineId].name)} keeps this value">machine<button data-vforget="${esc(key)}" title="Remove this value from ${esc(MACHINES[machineId].name)}">✕</button></span>` : `<span></span>`;
    return `<span class="vn">${esc(key)}${isCommonVar(key) ? `<i title="Common variable: kept on the machine, shared by every program">common</i>` : ""}</span>`
      + `<span class="vv${v===undefined ? " none" : ""}" title="${v===undefined ? "Not set yet at this line" : ""}">${v===undefined ? "—" : esc(f(v))}</span>`
      + `<input data-var="${esc(key)}" value="${key in tv ? esc(fmt4(tv[key])) : ""}" placeholder="${key in mv ? esc(fmt4(mv[key])) : ""}" title="Start value: the simulation sets ${esc(key)} to this before the first line${key in mv ? ` (${esc(MACHINES[machineId].name)} has ${esc(fmt4(mv[key]))})` : ""}. Leave it empty to start it empty.">`
      + warn;
  }).join("") + (keys.some(isCommonVar) ? `<div class="vfoot"><button id="v-save" ${keys.some(key => isCommonVar(key) && key in tv) ? "" : "disabled"} title="Keep these start values on the machine profile, so every program on it starts with them">Save common values to ${esc(MACHINES[machineId]?.name || "this machine")}</button></div>` : "");
}
$("vars").addEventListener("change", e => {
  const key = e.target.dataset?.var, t = TABS[activeTab]; if (!key || !t) return;
  const s = e.target.value.trim(), v = parseFloat(s);
  t.vars ||= {};
  if (s==="") delete t.vars[key];
  else if (!isFinite(v)){
    setMsg(`${s} isn't a number (for example 0.25 or -1).`, true);
    e.target.value = key in t.vars ? fmt4(t.vars[key]) : "";
    return;
  }
  else t.vars[key] = v;
  render();
  setMsg(s==="" ? `${key} starts empty.` : `The simulation now starts with ${key} = ${fmt4(v)}.`);
});
$("vars").addEventListener("click", e => {
  const t = TABS[activeTab], id = machineId;
  if (e.target.dataset?.vforget){
    const key = e.target.dataset.vforget; if (!USER_MACHINES.has(id)) return;
    delete USER_DATA[id].vars?.[key]; rebuildMachines(); persistMachines(); render(); setMsg(`Removed ${key} from ${MACHINES[id].name}.`); return;
  }
  if (e.target.id!=="v-save" || !t) return;
  if (!USER_MACHINES.has(id)){
    setMsg(`${MACHINES[id].name} isn't a machine profile, so it can't keep values. Make one in File › Machine profiles….`, true);
    return;
  }
  const keys = Object.keys(t.vars || {}).filter(isCommonVar); if (!keys.length) return;
  USER_DATA[id].vars = { ...(USER_DATA[id].vars || {}) };
  for (const key of keys){ USER_DATA[id].vars[key] = t.vars[key]; delete t.vars[key]; }
  rebuildMachines(); persistMachines(); render();
  setMsg(`Saved ${keys.join(", ")} as the start ${keys.length > 1 ? "values" : "value"} on ${MACHINES[id].name}.`);
});

