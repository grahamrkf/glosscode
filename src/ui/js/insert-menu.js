/* ---------- Insert menu ----------
   Insert › Hole pattern opens the hole pattern tool. Insert › <category> opens a dialog for the canned
   cycles in that category: pick a cycle, see its sketch, fill in its words (required ones marked), and
   check the line with its gloss before it goes in below the selected line. Categories come from the
   selected machine's cycle table, so a category with no cycles on that machine (live tooling on a lathe
   without it, roughing on a mill) isn't shown. Y and C words are hidden on lathes without a Y axis or
   live tooling. */
(() => {
const CYCLE_CATS = [
  ["Drilling",           { mill:["G81","G82","G83","G73"], lathe:["G81","G82","G83"] }],
  ["Tapping",            { mill:["G84","G74"], lathe:["G84","G184"] }],
  ["Boring",             { mill:["G85","G86","G89","G76","G77","G87"] }],
  ["Roughing",           { lathe:["G71","G72","G73"] }],
  ["Finishing",          { lathe:["G70"] }],
  ["Turning and facing", { lathe:["G90","G94"] }],
  ["Grooving",           { lathe:["G75","G74"] }],
  ["Threading",          { lathe:["G76","G92"] }],
  ["Live tooling",       { lathe:["G241","G243"] }]
];
// G code system C renumbers the lathe cycles (G72-G78, G20/G21/G24), so its dialects sort them by name instead.
const CYCLE_NAMES = { Roughing:/rough|pattern/i, Finishing:/finish/i, "Turning and facing":/turning cycle|facing cycle/i, Grooving:/groove/i, Threading:/thread/i };
function categories(cycles){
  const t = mtype(), have = Object.keys(cycles || {}), used = new Set(), byName = t==="lathe" && DIALECT.cycleCatsByName;
  const cats = CYCLE_CATS.map(([label, by]) => {
    const codes = byName ? have.filter(c => !used.has(c) && CYCLE_NAMES[label]?.test(cycles[c].name || "")) : (by[t] || []).filter(c => have.includes(c));
    codes.forEach(c => used.add(c));
    return { label, codes };
  }).filter(c => c.codes.length);
  const rest = have.filter(c => !used.has(c)).sort();
  if (rest.length) cats.push({ label:"Other cycles", codes:rest });
  return cats;
}
// Categories this control has cycles for, but that the selected machine can't run (it lacks the option they need).
function hiddenCats(){
  const m = MACHINES[machineId], all = dialectFor(m.brand, m.type).cycles || {}, shown = new Set(categories(DIALECT.cycles).map(c => c.label));
  return categories(all).filter(c => !shown.has(c.label)).map(c => c.label);
}
function insertMenu(){
  const cats = categories(DIALECT.cycles), hid = hiddenCats(), m = MACHINES[machineId];
  return [
    { label:"Hole pattern…", sc:"Grid or bolt circle", fn:() => openHoles() },
    "-", { grp:`Canned cycles for ${m.name}` },
    ...(cats.length ? cats.map(c => ({ label:c.label + "…", sc:c.codes.join(" "), fn:() => openInsertCycle(c.codes[0]) }))
                    : [{ label: DIALECT.process ? `No canned cycles on a ${m.type} machine` : `No cycles in the ${DIALECT.label} ${m.type} tables yet`, dis:() => true, fn:() => {} }]),
    ...(hid.length ? [{ grp:`Not on this machine: ${hid.join(", ")}. Machine profiles… can turn ${hid.length > 1 ? "them" : "it"} on.` }] : []),
    "-",
    { label:"Canned cycle guide…", sc:"F1", fn:() => openCycleHelp() }
  ];
}
Object.defineProperty(MENUS, "Insert", { get: insertMenu, enumerable:true, configurable:true });

const idlg = $("idlg");
let iSel = null, vals = {}, pick = {}, iState = null;
// Which words this machine can take: no Y without a Y axis, no C without live tooling (lathes).
function wordAllowed(L){
  const m = MACHINES[machineId];
  if (m.type!=="lathe") return true;
  if (L==="Y") return !!m.yAxis;
  if (L==="C") return !!m.liveTooling;
  return true;
}
function openInsertCycle(code){
  if (editing && !commit()) return;
  if (simIdx!=null) stopSim(true);
  closeMenu();
  iSel = code && DIALECT.cycles?.[code] ? code : categories(DIALECT.cycles)[0]?.codes[0];
  if (!iSel){ setMsg(`No canned cycles in the ${DIALECT.label} ${mtype()} tables yet.`, true); return; }
  iState = { ...(lineState[curLine] || newState()) };
  const L = labels();
  $("i-nlist").innerHTML = Object.keys(L).filter(k => k[0]==="N").map(k => `<option value="${k.slice(1)}">`).join("");
  drawInsert();
  showDialog(idlg, idlg.querySelector(".iform input:not(:disabled)"));
  idlg.querySelector(".clist .ci.sel")?.scrollIntoView({ block:"nearest" });
}
const closeInsert = () => hideDialog(idlg);

function drawInsert(){
  const m = MACHINES[machineId], cats = categories(DIALECT.cycles);
  $("i-title").textContent = `Insert canned cycle · ${m.name} (${DIALECT.label}, ${m.type})`;
  $("ilist").innerHTML = cats.map(c => `<div class="cgrp">${esc(c.label)}</div>` + c.codes.map(k => `<div class="ci${k===iSel ? " sel" : ""}" data-c="${k}"><b>${k}</b><span>${esc(DIALECT.cycles[k].name)}</span></div>`).join("")).join("");
  const code = iSel, def = DIALECT.cycles[code], help = cycleHelp(code), en = entry(code);
  const rows = cycleWordsFor(code), v = vals[code] ||= {};
  if (def.choices && pick[code]==null) pick[code] = 0;
  const hidden = [...new Set(rows.map(r => r.L).filter(L => !wordAllowed(L)))];
  const choice = def.choices ? `<div class="ichoice"><b>Use</b>${def.choices.map((set, si) => `<label><input type="radio" name="i-pick" value="${si}"${pick[code]===si ? " checked" : ""}> ${esc(set.join(" "))}</label>`).join("")}</div>` : "";
  const st = { ...iState, cycle:true, cycleCode:code, chg:[] };
  const what = L => help.words[L]?.[1] || (DIALECT.wordMeaning?.[L] ? DIALECT.wordMeaning[L][0].toUpperCase() + DIALECT.wordMeaning[L].slice(1) + "." : DICT.address[L]?.desc || "");
  const chip = r => r.need==="req" ? `<span class="need req">Required</span>` : r.need==="one" ? `<span class="need one">One of ${esc(r.sets.map(s => s.join(" ")).join(" / "))}</span>` : `<span class="need opt">Optional</span>`;
  const form = rows.filter(r => wordAllowed(r.L)).map(r => {
    const off = r.need==="one" && r.set!==pick[code];
    const ex = help.words[r.L]?.[0] ?? EX_DEFAULT[r.L] ?? "1.";
    const lab = (def.labels || []).includes(r.L);
    return `<span class="w${off ? " off" : ""}">${r.L}</span><span class="e${off ? " off" : ""}">${esc(glossPrefix(r.L, st))}</span>`
      + `<input data-l="${r.L}" value="${esc(v[r.L] || "")}" placeholder="${esc(ex)}"${lab ? ' list="i-nlist"' : ""}${off ? " disabled" : ""} inputmode="${lab ? "numeric" : "decimal"}" autocomplete="off">`
      + `<span class="${off ? "off" : ""}">${chip(r)}</span><span class="what${off ? " off" : ""}">${esc(what(r.L))}</span>`;
  }).join("");
  const hidNote = hidden.length ? `<span>${hidden.join(" and ")} ${hidden.length > 1 ? "are" : "is"} hidden: this lathe has no ${hidden.map(L => L==="Y" ? "Y axis" : "live tooling (C axis)").join(" or ")}. File › Machine profiles… turns ${hidden.length > 1 ? "them" : "it"} on.</span>` : "";
  $("imain").innerHTML = `<h4><code>${code}</code>${esc(def.name)}<small>${en ? esc(en.words) + " · " : ""}${esc(DIALECT.label)}</small></h4>`
    + `<div class="itop"><div class="csk">${cycleSketch(help.sketch, help.labels || {}, def)}</div><div class="side"><p class="about" style="margin:0">${esc(help.about || en?.desc || "")}</p>${hidNote}<span style="color:#888">Grey values are examples. Distances get a decimal point if you leave it off.</span></div></div>`
    + `<div class="cex" id="i-prev"></div>` + choice + `<div class="iform">${form}</div>`;
  $("imain").querySelectorAll('input[name="i-pick"]').forEach(x => x.onchange = () => { pick[code] = +x.value; drawInsert(); });
  update();
}

// Turns the form into words. A distance typed without a decimal point gets one (1 → 1.), the way the
// display rules always show it; counts, dwell times, N numbers and angles in whole units are left as typed.
function build(){
  const code = iSel, def = DIALECT.cycles[code], help = cycleHelp(code), v = vals[code] || {};
  const rows = cycleWordsFor(code).filter(r => wordAllowed(r.L) && !(r.need==="one" && r.set!==pick[code]));
  const words = [], bad = [], missing = [];
  for (const r of rows){
    let t = (v[r.L] || "").trim().toUpperCase().replace(/^N(?=\d)/, "");
    if (!t){ if (r.need!=="opt") missing.push(r.L); continue; }
    const lab = (def.labels || []).includes(r.L);
    if (lab ? !/^\d+$/.test(t) : !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)){ bad.push(r.L); continue; }
    const ex = help.words[r.L]?.[0] ?? EX_DEFAULT[r.L] ?? "1.";
    if (!lab && r.L!=="P" && ex.includes(".") && !t.includes(".")) t += ".";
    t = t.replace(/^\+/, "").replace(/^(-?)\./, "$10.");   // .1 → 0.1, like the rest of the program
    words.push(r.L + t);
  }
  // A required F can come from an F already active in the program.
  const fi = missing.indexOf("F");
  if (fi >= 0 && iState.F && !def.leadF) missing.splice(fi, 1);
  return { words, bad, missing };
}
function update(){
  const b = build(), code = iSel;
  idlg.querySelectorAll(".iform input").forEach(x => x.classList.toggle("bad", b.bad.includes(x.dataset.l)));
  const nn = nextN(curLine), toks = [...(nn.n!=null ? [nWord(nn.n)] : []), code, ...b.words]; sortLine(toks);
  const st = { ...iState, cycle:true, cycleCode:code, chg:[] }, cells = toks.map(t => word(t, st)), W = COLW();
  const row = (cls, f) => `<div class="r ${cls}"><span class="gut"></span>${cells.map((c, i) => `<span class="cell${/^N\d/.test(toks[i]) ? " n" : ""}" style="width:${Math.max(W, toks[i].length+1, (c.e||"").length + (c.u ? 3 : 1))}ch">${f(c, i)}</span>`).join("")}</div>`;
  $("i-prev").innerHTML = `<div class="lbl">Goes in below ${nOf(doc[curLine])!=null ? "N" + nOf(doc[curLine]) : "line " + (curLine+1)}</div>`
    + row("en", c => esc(c.e) + (c.u ? `<small class="u">${esc(c.u)}</small>` : "")) + row("gc", (c, i) => esc(toks[i]));
  const def = DIALECT.cycles[code], notes = [];
  if (b.bad.length) notes.push(`<span class="warn">${b.bad.join(", ")} ${b.bad.length > 1 ? "need" : "needs"} ${b.bad.some(L => (def.labels || []).includes(L)) ? "a line number or number" : "a number"}.</span>`);
  else if (b.missing.length) notes.push(`Fill in ${b.missing.join(", ")} to insert.`);
  if (def.note) notes.push(esc(def.note));
  if (!DIALECT.verified) notes.push(`${esc(DIALECT.label)} tables are a first draft.`);
  if (nn.bad) notes.push(`<span class="warn">${esc(nn.msg)}</span>`);
  $("i-msg").innerHTML = notes.join(" ");
  const ok = !b.bad.length && !b.missing.length;
  $("i-ok").disabled = !ok;
  // The hole pattern tool fills in X and Y positions, so it's offered for mill cycles that take them.
  const rowsL = cycleWordsFor(code).map(r => r.L);
  $("i-holes").hidden = mtype()!=="mill" || !rowsL.includes("X") || !rowsL.includes("Y");
  $("i-holes").disabled = !ok;
  return { ok, toks };
}
function insertCycle(thenHoles){
  const u = update(); if (!u.ok) return;
  const li = curLine, code = iSel;
  pushUndo();
  doc.splice(li+1, 0, u.toks);
  expanded = new Set([...expanded].map(i => i > li ? i+1 : i));
  closeInsert();
  selectLine(li+1);
  setMsg(`Added ${u.toks.join(" ")}.${thenHoles ? "" : " Ctrl+Z takes it back out."}`);
  if (thenHoles) openHoles();
}

$("ilist").addEventListener("click", e => { const it = e.target.closest(".ci"); if (!it) return; iSel = it.dataset.c; drawInsert(); });
idlg.addEventListener("input", e => { const L = e.target.dataset?.l; if (!L) return; (vals[iSel] ||= {})[L] = e.target.value; update(); });
$("i-ok").onclick = () => insertCycle(false);
$("i-holes").onclick = () => insertCycle(true);
$("i-cancel").onclick = $("i-x").onclick = closeInsert;
dialogKeys(idlg, closeInsert, e => {
  if (e.key==="Enter" && e.target.tagName==="INPUT" && e.target.type!=="radio"){
    e.preventDefault();
    insertCycle(false);
  }
});
window.openInsertCycle = openInsertCycle;
})();
