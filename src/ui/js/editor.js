/* ---------- Rendering ---------- */
const ed = $("ed");
function render(){
  if (activeTab < 0){ window.drawTabs?.(); return; }   // the home page has no program to draw
  translateAll();
  PROBLEMS = checkProgram(); PBYLINE = {};
  if (MEMO_CHECK) memoCompare();
  EXEC = interpret();
  // Variables read before the program sets them, with no start value: worth a look (Variables panel, under Active modes)
  for (const [key, u] of Object.entries(EXEC.vars || {})) if (u.early!=null && !u.seed)
    PROBLEMS.push({ li:u.early, id:"var-before-set", sev:"warning", title:"Variable read before it's set",
      msg:`${key} is read here before the program sets it, so the simulation takes it as ${/^#/.test(key) ? "empty" : "0"}. Give it a start value under Variables.`,
      why:isCommonVar(key) ? "It's a common variable, so it's probably set at the machine (an offset page or another program). Enter the value it has there; Save common values keeps it on the machine profile." : "Nothing before this line sets it." });
  for (const nt of EXEC.notes || []) PROBLEMS.push({ li:nt.li, id:"sim-note", sev:"info", title:"Simulation note", msg:nt.text + ".", why:"The simulation can't work this out from the program." });
  if ((EXEC.vars && Object.values(EXEC.vars).some(u => u.early!=null && !u.seed)) || EXEC.notes?.length) {
    PROBLEMS.sort((a, b) => a.li - b.li || SEV_RANK[b.sev] - SEV_RANK[a.sev]);
  }
  // The simulation's alarm (the machine would stop there) is an error too; the lines after it never run.
  if (EXEC.alarm){
    PROBLEMS.push({ li:EXEC.alarm.li, id:"machine-alarm", sev:"error", title:"Machine alarm", msg:"Alarm: " + EXEC.alarm.text,
      why:"The machine profile doesn't have this option, so the control stops the program on this line. Turn the option on in File › Machine profiles… if the machine has it." });
    PROBLEMS.sort((a, b) => a.li - b.li || SEV_RANK[b.sev] - SEV_RANK[a.sev]);
  }
  PROBLEMS.forEach(p => (PBYLINE[p.li] ||= []).push(p));
  const ran = EXEC.alarm ? new Set(EXEC.steps.map(s => s.li)) : null;
  if (simIdx!=null && simK!=null) simKey = simRowKey(EXEC.steps[simK]);   // a call shown or hidden moves the row
  ed.className = "ed show-" + showMode + (runNums ? " runnums" : "");
  const rows = [], FD = foldScan();
  if (foldAutoPending) foldOnOpen();
  { const h = foldHiding(curLine); if (h >= 0 && !(simIdx!=null && simKey!=null)) setFold(h, null, false); }   // the line the cursor is on is never folded away
  for (let li = 0; li < doc.length; li++){
    const fh = FD.end[li] >= 0;
    rows.push({ li, key:"m"+li, fold:fh ? [li, null] : null });
    if (fh && foldClosed(li)){ li = FD.end[li]; continue; }
    const tgt = callTarget(doc[li]), rg = tgt!=null && expanded.has(li) ? subRange(tgt) : null;
    if (rg) for (let j = rg[0]; j <= rg[1]; j++){
      const xf = FD.end[j] >= 0 && j < rg[1];
      rows.push({ li:j, key:`x${li}-${j}`, ins:true, from:doc[li][0], fold:xf ? [j, li] : null });
      if (xf && foldClosed(j, doc[li])) j = Math.min(FD.end[j], rg[1]);
    }
    if (tgt==null && expanded.has(li)) window.libRows?.(li).forEach((r, j) => rows.push({ li, key:`l${li}-${j}`, lib:r }));
  }
  const fhits = findHits();
  // Run order: the number of the block each row is, counting every line the program runs, subprogram lines once per
  // call (the line count some controls show). Lines only reached through a call are numbered on the call's inserted rows.
  const runNo = {};
  if (runNums) EXEC.steps.forEach((st, k) => {
    const c = st.calls || [], rk = !c.length ? "m" + st.li : c.length===1 ? `x${c[0]}-${st.li}` : null;
    if (rk && runNo[rk]==null) runNo[rk] = k + 1;
  });
  const simOn = simIdx!=null && simKey!=null, pr = simOn ? rowProgress(simK, simKey) : null;
  patchRows(rows.map(r => r.key), rows.map(({li, key, ins, from, lib, fold}) => {
    if (lib) return window.libRowHTML(lib, li);
    const eob = eobOn() && doc[li].length && doc[li][doc[li].length-1]!==";" && !(doc[li].length===1 && doc[li][0]==="%") ? `<span class="eob" title="End of block. ${esc(MACHINES[machineId].name)} needs ; at the end of every line, so GlossCode writes it for you.">;</span>` : "";
    const tgt = ins ? null : callTarget(doc[li]);
    const bar = simOn && key===simKey && pr!=null && (ins || !expanded.has(li)) ? `<span class="xpbar" title="${barTitle(key)}"><i style="width:${(pr*100).toFixed(1)}%"></i></span>` : "";
    const xp = fold ? foldButton(fold[0], fold[1]==null ? null : doc[fold[1]], fold[1]) + bar : ins ? bar : tgt==null && !ins && window.libButton ? window.libButton(li) + (window.libFor?.(doc[li]) ? callButtons(li, null) : "") : tgt!=null ? (subRange(tgt) ? `<button class="xp" data-x="${li}">${expanded.has(li) ? "▾ hide" : "▸ show"} ${tgt}</button>${bar}${callButtons(li, tgt)}` : `<span class="xp bad">${tgt} not found</span>`) : "";
    const kind = lineKind(li);
    const lp = ins ? null : PBYLINE[li], worst = lp ? lp.reduce((a, p) => SEV_RANK[p.sev] > SEV_RANK[a] ? p.sev : a, "info") : null;
    const pmark = lp ? `<span class="pm ${worst}" title="${esc(lp.map(p => p.msg).join("\n"))}">${SEV_ICON[worst]}</span>` : "";
    const c = `ln${worst?" p-"+worst:""}${lp?.some(p => p.id==="machine-alarm")?" p-alarm":""}${(simOn ? key===simKey : li===curLine && !ins)?" cur":""}${!ins && inSel(li)?" lsel":""}${ins?" ins":""}${kind?" k-"+kind:""}${fhits.includes(li) && li===curLine?" fcur":""}${simOn && key===simKey?" simcur":""}${simBD && isBlockDel(doc[li])?" bdskip":""}${ran && !ins && li > EXEC.alarm.li && !ran.has(li)?" unreach":""}`;
    return textRowHTML({ li, key, ins, from, c, pmark, eob, xp, num: (runNums ? `<span class="rn" title="Run order: block ${runNo[key] ?? "–"} of the program as it runs">${runNo[key] ?? ""}</span>` : "") + (ins ? "↳" : li+1), fh: findQ && fhits.includes(li) });
  }));
  drawViews(); drawModes(); status(); updateFindCount(fhits); drawProblems(); drawDraftBar(); window.drawSubPane?.();
  drawMachineChip(); window.drawTabs?.();
  drawnSig = drawSig();
}
/* Drawing the rows: each row's HTML is kept, and a row whose HTML is the same as last time is left as it is, so an edit
   to one word redraws a few rows instead of ten thousand. When lines are added or removed, the rows below keep their
   elements too: only their line numbers (in the gutter and the data-* attributes) are moved. A row the page changed
   itself since it was drawn (the cursor, a word being edited, the simulation's bar) is marked with touchRow and drawn
   again. If more than a few hundred rows changed, all rows are drawn again at once, which is quicker then. */
let ROWS = null;
let TOUCHED = new WeakSet();
const touchRow = el => { const r = el?.closest?.(".ln"); if (r) TOUCHED.add(r); };
// A row's key with its line numbers changed by f (m12, x40-130 for a subprogram line shown under its call, l12-3 for a library row)
const keyMap = (k, f) => { const m = /^([mxl])(\d+)(?:-(\d+))?$/.exec(k); if (!m) return null; const a = f(+m[2]); if (a < 0) return null;
  if (m[1]==="l") return `l${a}-${m[3]}`; if (m[1]==="m") return "m" + a; const b = f(+m[3]); return b < 0 ? null : `x${a}-${b}`; };
// Last time's HTML for a row, as it reads with its lines moved by f
function movedHTML(h, f){
  return h.replace(/data-(li|l|x)="(\d+)"/g, (_, a, n) => `data-${a}="${f(+n)}"`)
    .replace(/data-(key|k)="([mxl][\d-]+)"/g, (_, a, k) => `data-${a}="${keyMap(k, f)}"`)
    .replace(/(<div class="r gc[^"]*"><span class="gut">(?:<span class="pm[^>]*>[^<]*<\/span>)?(?:<span class="rn"[^>]*>[^<]*<\/span>)?)(\d+)<\/span>/, (_, pre, n) => `${pre}${f(+n - 1) + 1}</span>`);
}
function moveRow(el, f){   // the same change, made to the row's element
  el.dataset.key = keyMap(el.dataset.key, f); el.dataset.li = f(+el.dataset.li);
  for (const c of el.querySelectorAll("[data-l],[data-k],[data-x]")){
    const d = c.dataset;
    if (d.l!=null) d.l = f(+d.l); if (d.k!=null) d.k = keyMap(d.k, f); if (d.x!=null) d.x = f(+d.x);
  }
  const g = el.children[1]?.firstElementChild, t = g?.lastChild;   // the code row's gutter
  if (t?.nodeType===3 && /^\d+$/.test(t.data)) t.data = String(f(+t.data - 1) + 1);
}
function patchRows(keys, html){
  const P = ROWS, kids = [...ed.children], dk = TRUN?.keys?.length===doc.length ? TRUN.keys : doc.map(lineKey);
  ROWS = { keys, html, docKeys:dk };
  const full = () => { ed.innerHTML = html.join(""); TOUCHED = new WeakSet(); };
  if (!P || kids.length!==P.keys.length) return full();
  const map = lineMap(P.docKeys, dk), same = !map.shift && P.keys.length===keys.length && keys.every((k, i) => k===P.keys[i]);
  const oldAt = same ? null : new Map(P.keys.map((k, j) => [k, j]));
  const use = new Array(keys.length).fill(-1), moved = []; let last = -1, redraw = 0;
  for (let i = 0; i < keys.length; i++){
    const j = same ? i : oldAt.get(keyMap(keys[i], map.toOld) ?? "");
    if (j!=null && j > last && !TOUCHED.has(kids[j])){
      const mv = P.keys[j]!==keys[i];
      if ((mv ? movedHTML(P.html[j], map.toNew) : P.html[j])===html[i]){ use[i] = j; last = j; if (mv) moved.push(j); continue; }
    }
    if (++redraw > 300) return full();
  }
  const kept = new Set(use);
  kids.forEach((el, j) => { if (!kept.has(j)) el.remove(); });
  moved.forEach(j => moveRow(kids[j], map.toNew));
  if (redraw){
    const t = document.createElement("template"); t.innerHTML = keys.map((_, i) => use[i] < 0 ? html[i] : "").join("");
    // from the bottom up, each new row goes just above the row below it
    const fresh = [...t.content.children]; let f = fresh.length, below = null;
    for (let i = keys.length - 1; i >= 0; i--) below = use[i] >= 0 ? kids[use[i]] : ed.insertBefore(fresh[--f], below);
  }
  if (MEMO_CHECK){
    const t = document.createElement("template"); t.innerHTML = html.join("");
    if (t.innerHTML!==ed.innerHTML){
      console.warn("Redrawing only the changed rows left rows that differ from a full redraw.");
      setMsg("memoCheck: redrawing only the changed rows left different rows (see the console).", true);
      full();
    }
  }
}
/* Moving the cursor (a click, an arrow key, the simulation going to the next line) changes nothing but which row and
   word are marked, so when the program and view are just as render() last drew them, only those marks move. A long
   program would otherwise be read, checked, run and drawn again, all ten thousand rows, on every arrow key. */
let drawnSig = null;
const drawSig = () => [activeTab, TABS[activeTab]?.id, docVer, doc.length, machineId, style, showMode, runNums,
  [...expanded].join(), FOLDV, findQ, simBD, !!editing, simIdx!=null && simKey!=null].join("|");
function renderCursor(){
  if (activeTab < 0 || drawnSig!==drawSig() || !ed.firstElementChild || foldAutoPending || (foldHiding(curLine) >= 0 && !(simIdx!=null && simKey!=null))) {
    return render();
  }
  const simOn = simIdx!=null && simKey!=null, fh = findQ ? new Set(findHits()) : null;
  ed.querySelectorAll(".xpbar").forEach(b => { touchRow(b); b.remove(); });
  for (const r of ed.children){
    const key = r.dataset.key; if (!key) continue;   // a subprogram-library row
    const li = +r.dataset.li, ins = key[0]==="x", was = r.className;
    r.classList.toggle("cur", simOn ? key===simKey : li===curLine && key[0]==="m");
    r.classList.toggle("lsel", !ins && key[0]==="m" && inSel(li));
    r.classList.toggle("fcur", !!fh && fh.has(li) && li===curLine);
    r.classList.toggle("simcur", simOn && key===simKey);
    if (r.className!==was) TOUCHED.add(r);
  }
  if (simOn){   // the progress bar of the subprogram running, on the row that shows it
    const sr = ed.querySelector(`.ln[data-key="${simKey}"]`), li = sr ? +sr.dataset.li : -1, ins = simKey[0]==="x";
    const pr = rowProgress(simK, simKey);
    if (sr && pr!=null && (ins || !expanded.has(li))) TOUCHED.add(sr), sr.querySelector(".r.gc").insertAdjacentHTML("beforeend",
      `<span class="xpbar" title="${barTitle(simKey)}"><i style="width:${(pr*100).toFixed(1)}%"></i></span>`);
  }
  drawViews(); drawModes(); status(); if (fh) updateFindCount([...fh]); drawProblems(); window.markSubPane?.();
}
/* ---------- Code with gloss above (View › Layout, the default) ----------
   Each line is drawn as text: its N number in a column of its own on the left, the code beside it, and the gloss above
   the code in smaller grey text. The gloss leaves out the N number and comments, which read the same either way, and
   a line with nothing else (a comment, a lone N) has no gloss line. The gloss can't be selected or edited: the code is
   edited as plain text, one line at a time, like any text editor. Clicking a line puts the caret where it was clicked;
   Enter breaks the line at the caret, Backspace at its start joins it to the line above, and Delete at its end joins
   the line below. The gloss above follows the typing, and the line is read into words when the caret leaves it. */
// A line's words as text, the way Save writes them: one space between words, none after a block delete "/" or before ";".
function textParts(toks){
  return toks.map((t, i) => ({ t, i, sep: i===0 || (i===1 && /^\/\d?$/.test(toks[0])) || (t===";" && i===toks.length-1) ? "" : " " }));
}
const codeText = toks => textParts(toks).map(p => p.sep + p.t).join("");
const hasNcol = toks => nOf(toks)!=null;
function textGlossHTML(li){
  const toks = doc[li] || [], cells = view[li] || [], off = hasNcol(toks) ? 1 : 0, out = [];
  for (let i = off; i < toks.length; i++){
    const c = cells[i]; if (!c || c.cm || !c.e || c.e===toks[i] && !c.unk) continue;   // comments, ";", "%" and macro text read as written
    const hit = findQ && (toks[i].toUpperCase().includes(findQ) || c.e.toUpperCase().includes(findQ));
    out.push(`<span class="gw${c.unk?" unk":""}${c.cs?" cs":""}${c.imp?" imp":""}${hit?" fhit":""}" data-wi="${i}">${esc(c.e)}${c.u ? `<small class="u">${esc(c.u)}</small>` : ""}</span>`);
  }
  const st = lineState[li] || newState();
  for (const h of hintItems(li)) out.push(`<span class="gh" title="${esc(`${h.code} needs ${needsText(h)}: ${hintMeaning(h)}`)}">${h.alt ? "or " : ""}${esc(englishPrefix(h.L, st))}${style==="short" ? "" : ""}?</span>`);
  return out.join(" ");
}
// The words a line's problems name (the word, code or letter in the message), underlined in the problem's colour.
const SEV_CLASS = { error:"err", warning:"warn", info:"note" };
function culprits(li, ps){
  const toks = doc[li] || [], out = new Map();
  for (const p of ps || []){
    const v = p.vars || {}, want = [];
    for (const k of ["word", "words", "codes", "code", "h", "cycle"]) if (v[k]) want.push(...String(v[k]).split(/,\s*|\s+and\s+|\s+/));
    toks.forEach((t, i) => {
      if (isComment(t)) return;
      const hit = want.some(w => w && (t===w || (/^[GM]\d/.test(t) && /^[GM]\d/.test(w) && pad2(t)===pad2(w)))) || (v.letter && t===v.letter);
      if (hit && SEV_RANK[p.sev] > SEV_RANK[out.get(i)] || hit && !out.has(i)) out.set(i, p.sev);
    });
  }
  return out;
}
function textRowHTML({ li, key, ins, from, c, pmark, eob, xp, num, fh }){
  const toks = doc[li] || [], cells = view[li] || [], nc = hasNcol(toks), parts = textParts(nc ? toks.slice(1) : toks);
  const bad = ins ? new Map() : culprits(li, PBYLINE[li]);
  const code = parts.map(p => { const i = p.i + (nc ? 1 : 0), w = cells[i] || {};
    const hit = findQ && toks[i].toUpperCase().includes(findQ), cu = bad.get(i);
    return p.sep + `<span class="cw${w.cm?" cm":""}${cu ? " cu-" + SEV_CLASS[cu] : ""}${hit?" fhit":""}" data-wi="${i}">${esc(p.t)}</span>`; }).join("");
  const gl = textGlossHTML(li);
  return `<div class="${c}${fh?" fcur":""}" data-key="${key}" data-li="${li}"${ins?` title="Subprogram line, shown under the call on ${from} in the order it runs. Read only here: click to edit it in the subprogram pane."`:""}>`
    + `<div class="r en${gl ? "" : " none"}"><span class="gut"></span><span class="tn"></span><span class="tg">${gl}</span></div>`
    + `<div class="r gc"><span class="gut">${pmark}${num}</span><span class="tn${nc && bad.get(0) ? " cu-" + SEV_CLASS[bad.get(0)] : ""}" data-wi="0">${nc ? esc(toks[0]) : ""}</span><span class="tc" data-l="${li}" data-k="${key}">${code}</span>${eob}${xp}</div></div>`;
}
// The width of one character of code, for putting the caret where the mouse is.
let CHW = 0;
function charW(){
  const p = document.createElement("span");
  p.className = "tc";
  p.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
  p.textContent = "0".repeat(20);
  ed.appendChild(p); const w = p.getBoundingClientRect().width / 20; p.remove(); return CHW = w || CHW || 7.8;
}
// The caret position in a line's code under the mouse (0 before the first character, the text's length after the last).
function caretAt(row, x, len){
  const tc = row?.querySelector(".r.gc .tc"); if (!tc) return len;
  return Math.max(0, Math.min(len, Math.round((x - tc.getBoundingClientRect().left) / charW())));
}
let editRoot = null;   // the subprogram pane's rows, while a line clicked there is being edited (js/subprograms.js)
function startLineEdit(li, key, caret, sel){
  if (simIdx!=null) stopSim(true);
  key = key || "m"+li; selAnchor = null;
  curLine = li; render();
  const pane = editRoot && editRoot.isConnected ? editRoot : null;   // a line clicked in the subprogram pane is edited there
  const ln = pane?.querySelector(`.ln[data-key="m${li}"]`) || ed.querySelector(`.ln[data-key="${key}"]`) || ed.querySelector(`.ln[data-key="m${li}"]`); if (!ln) return;
  TOUCHED.add(ln); scrollToLn(ln);
  const tc = ln.querySelector(".r.gc .tc"), toks = doc[li], nc = hasNcol(toks), text = codeText(nc ? toks.slice(1) : toks);
  tc.innerHTML = `<input class="lineinput" id="line-input" aria-label="Edit line ${li+1}" autocomplete="off" spellcheck="false">`;
  const input = tc.querySelector("input"); input.value = text;
  editing = { li, key, line:true, input, cell:tc, orig:toks, text0:text, n: nc ? toks[0] : null, items:[], sel:0 };
  input.focus({ preventScroll:true });
  const at = Math.max(0, Math.min(caret ?? text.length, text.length));
  if (sel!=null) input.setSelectionRange(Math.min(sel, at), Math.max(sel, at), sel > at ? "backward" : "forward"); else input.setSelectionRange(at, at);
  input.addEventListener("input", onLineInput);
  input.addEventListener("keydown", onLineKey);
  input.addEventListener("keyup", lineInfo); input.addEventListener("mouseup", lineInfo);
  input.addEventListener("blur", () => setTimeout(() => {
    if (editing && editing.input===input && document.activeElement!==input){ if (commit()) render(); }
  }, 120));
  lineInfo();
}
// The words typed on the line being edited, with its N number in front (a typed N number takes its place).
function lineWords(text){
  const ws = tokenize(text), n = editing.n;
  return n && nOf(ws)==null ? [n, ...ws] : ws;
}
// The meaning of the word the caret is in, in the info panel.
function lineInfo(){
  if (!editing?.line) return;
  const { input, li } = editing, c = input.selectionStart, v = input.value;
  const wi = (v.slice(0, c).match(/\S+/g) || []).length - (/\S$/.test(v.slice(0, c)) || c===0 ? 1 : 0);
  const toks = doc[li], off = editing.n && toks[0]===editing.n ? 1 : 0;
  showInfo(li, toks[off + Math.max(0, wi)]!=null ? off + Math.max(0, wi) : null);
}
let lineTimer = 0;
function onLineInput(){
  const ed2 = editing; if (!ed2?.line) return;
  // Code is upper case (comments keep what's typed): letters change as they're typed, and the caret stays put.
  if (!["klartext", "fagor8060", "fagor8055"].includes(SYNTAX)){
    const v = ed2.input.value; let depth = 0, out = "";
    for (const ch of v){ if (ch==="(") depth++; out += depth ? ch : ch.toUpperCase(); if (ch===")" && depth) depth--; }
    if (out!==v){ const a = ed2.input.selectionStart, b = ed2.input.selectionEnd; ed2.input.value = out; ed2.input.setSelectionRange(a, b); }
  }
  clearTimeout(lineTimer);
  lineTimer = setTimeout(() => {
    if (editing!==ed2) return;
    doc[ed2.li] = lineWords(ed2.input.value);
    translateAll();
    const row = ed2.cell.closest(".ln"), en = row?.querySelector(".r.en");
    if (en){ const gl = textGlossHTML(ed2.li); en.className = "r en" + (gl ? "" : " none"); en.querySelector(".tg").innerHTML = gl; }
    lineInfo();
  }, 90);
}
// Reads the line being edited into words. Returns { at, n } like commit() for a word.
function commitLine(){
  const { li, input, orig, text0 } = editing;
  clearTimeout(lineTimer);
  const toks = input.value===text0 ? orig : lineWords(input.value);
  editing = null;
  doc[li] = orig;
  if (lineKey(toks)===lineKey(orig)){ translateAll(); return { at:0, n:toks.length }; }
  pushUndo(); doc[li] = toks; translateAll();
  return { at:0, n:toks.length };
}
// The next line the arrow keys go to, a folded run counting as one line.
function lineStep(li, d){
  let to = Math.max(0, Math.min(doc.length-1, li + d)); if (to===li) return li;
  const fh = foldHiding(to); if (fh >= 0) to = d > 0 ? Math.min(doc.length-1, FOLD.end[fh] + 1) : fh;
  return to;
}
function onLineKey(e){
  const edit = editing; if (!edit?.line) return;
  const { input, li, key } = edit;
  const text = input.value;
  const selStart = input.selectionStart;
  const selEnd = input.selectionEnd;
  const ctrl = e.ctrlKey || e.metaKey;
  const keyName = e.key.toLowerCase();
  const main = key[0]==="m";
  if (e.key==="Escape"){
    e.preventDefault();
    clearTimeout(lineTimer);
    doc[li] = edit.orig;
    editing = null;
    translateAll();
    render();
    ed.focus({preventScroll:true});
    setMsg("");
    return;
  }
  if (e.key==="Tab"){ e.preventDefault(); return; }
  if (e.key==="Enter" && ctrl){ e.preventDefault(); if (commit()) newLine(li); return; }
  if (e.key==="Enter"){
    e.preventDefault();
    const before = text.slice(0, selStart), after = text.slice(selEnd);
    const head = before===edit.text0 ? edit.orig : lineWords(before), restW = tokenize(after);
    clearTimeout(lineTimer); editing = null; doc[li] = edit.orig;
    pushUndo();
    const nn = restW.length && nOf(restW)!=null ? { n:null } : nextN(li), lineB = nn.n!=null ? [nWord(nn.n), ...restW] : restW;
    doc[li] = head; doc.splice(li+1, 0, lineB);
    expanded = new Set([...expanded].map(i => i > li ? i+1 : i));
    if (nn.msg) setMsg(nn.msg, nn.bad);
    startLineEdit(li+1, null, 0);
    return;
  }
  if (e.key==="Backspace" && selStart===0 && selEnd===0 && li > 0 && main){
    e.preventDefault();
    const cur = lineWords(text).slice(edit.n ? 1 : 0); clearTimeout(lineTimer); editing = null; doc[li] = edit.orig;
    pushUndo();
    const prev = doc[li-1], at = codeText(hasNcol(prev) ? prev.slice(1) : prev).length;
    doc[li-1] = [...prev, ...(edit.n && !cur.length ? [] : cur)]; doc.splice(li, 1);
    expanded = new Set([...expanded].filter(i => i!==li).map(i => i > li ? i-1 : i));
    startLineEdit(li-1, null, at + (prev.length > (hasNcol(prev) ? 1 : 0) && cur.length ? 1 : 0));
    return;
  }
  if (e.key==="Delete" && selStart===text.length && selEnd===text.length && li < doc.length-1 && main){
    e.preventDefault();
    const next = doc[li+1], nextW = hasNcol(next) ? next.slice(1) : next, mine = lineWords(text);
    clearTimeout(lineTimer); editing = null; doc[li] = edit.orig;
    pushUndo(); doc[li] = [...mine, ...nextW]; doc.splice(li+1, 1);
    expanded = new Set([...expanded].filter(i => i!==li+1).map(i => i > li+1 ? i-1 : i));
    startLineEdit(li, null, selStart);
    return;
  }
  if ((e.key==="ArrowUp" || e.key==="ArrowDown" || e.key==="PageUp" || e.key==="PageDown") && !e.altKey){
    e.preventDefault();
    const d = (e.key==="ArrowUp" ? -1 : e.key==="ArrowDown" ? 1 : e.key==="PageUp" ? -20 : 20);
    if (!commit()) return;
    if (e.shiftKey && Math.abs(d)===1){ render(); extendSel(Math.max(0, Math.min(doc.length-1, li + d))); return; }
    let to = li; for (let n = Math.abs(d); n > 0; n--) to = lineStep(to, Math.sign(d));
    if (!main && to!==li){ render(); selectLine(to); return; }
    startLineEdit(to, null, selStart);
    return;
  }
  if (ctrl && keyName==="z" && !e.shiftKey && text===edit.text0){ e.preventDefault(); if (commit()) undo(); return; }
  if (ctrl && (keyName==="y" || (keyName==="z" && e.shiftKey)) && text===edit.text0){ e.preventDefault(); if (commit()) redo(); return; }
  if (ctrl && keyName==="d"){ e.preventDefault(); if (commit()) duplicateLines(); return; }
  if (ctrl && e.shiftKey && keyName==="k"){ e.preventDefault(); if (commit()){ render(); deleteLine(); } return; }
  if (ctrl && (keyName==="c" || keyName==="x") && selStart===selEnd){
    e.preventDefault();
    if (commit()){ render(); copyFromMenu(keyName==="x"); }
    return;
  }   // nothing selected: the whole line, like other editors
}
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
  if (!list) return `<span style="color:#777">This line doesn't run in the simulation, so the value isn't known.</span>`;
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
    return `<span class="lb">${isNew ? '<span class="new">●</span> ' : ""}${lb}</span><span class="cd">${esc(code || "not set")}</span><span class="ew"${isNew?' style="color:#d13438"':""}>${en}</span>`;
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
  box.innerHTML = `<span class="lb" style="color:#888">Name</span><span style="color:#888">Here</span><span style="color:#888">Start</span><span></span>` + keys.map(key => {
    const u = U[key], v = varAt(u, k), seeded = key in tv || key in mv;
    const warn = u.early!=null && !seeded ? `<span class="vw" title="${esc(key)} is read at ${esc(lab(u.early))} before the program sets it${isCommonVar(key) ? ". It's a common variable, so it's probably set at the machine: enter the value it has there" : ""}.">⚠ unset at ${esc(lab(u.early))}</span>`
      : u.set!=null ? `<span class="vw" style="color:#888" title="First set at ${esc(lab(u.set))}">set at ${esc(lab(u.set))}</span>`
      : key in mv && !(key in tv) ? `<span class="vw" style="color:#7a5bc0" title="${esc(MACHINES[machineId].name)} keeps this value">machine<button data-vforget="${esc(key)}" title="Remove this value from ${esc(MACHINES[machineId].name)}">✕</button></span>` : `<span></span>`;
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
    setMsg(`${s} isn't a number. A start value is a number, such as 0.25 or -1.`, true);
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
    setMsg(`${MACHINES[id].name} isn't one of your machine profiles, so it can't keep values. Make a profile in File › Machine profiles…, then save them.`, true);
    return;
  }
  const keys = Object.keys(t.vars || {}).filter(isCommonVar); if (!keys.length) return;
  USER_DATA[id].vars = { ...(USER_DATA[id].vars || {}) };
  for (const key of keys){ USER_DATA[id].vars[key] = t.vars[key]; delete t.vars[key]; }
  rebuildMachines(); persistMachines(); render();
  setMsg(`Saved ${keys.join(", ")} to ${MACHINES[id].name}. Every program on it now starts with ${keys.length > 1 ? "these values" : "this value"}.`);
});

ed.addEventListener("mouseover", e => {   // a code word and its gloss light up together
  ed.querySelectorAll(".hot").forEach(x => { touchRow(x); x.classList.remove("hot"); });
  const w = e.target.closest("[data-wi]"), row = w?.closest(".ln"); if (!w || !row || !w.textContent) return;
  row.querySelectorAll(`[data-wi="${w.dataset.wi}"]`).forEach(x => { touchRow(x); x.classList.add("hot"); });
  if (!editing) showInfo(+row.dataset.li, +w.dataset.wi);
});
ed.addEventListener("mouseleave", () => { if (!editing) showInfo(curLine, null); });
ed.addEventListener("mousedown", e => {
  if (e.button===2 && e.target.tagName!=="INPUT") return;   // right-click opens the line menu (below)
  const fb = e.target.closest(".xp[data-fold]");
  if (fb){ e.preventDefault(); if (editing) commit(); const h = +fb.dataset.fold, cl = fb.dataset.ctx==="" ? null : doc[+fb.dataset.ctx];
    setFold(h, cl, !foldClosed(h, cl)); if (cl==null && foldClosed(h) && FOLD.owner[curLine]===h) curLine = h; render(); return; }
  const x = e.target.closest(".xp[data-x]");
  if (x){ e.preventDefault(); if (editing) commit(); const li = +x.dataset.x; expanded.has(li) ? expanded.delete(li) : expanded.add(li); render(); return; }
  if (e.shiftKey && !x){
    const ln = e.target.closest(".ln[data-li]:not(.ins)");
    if (ln && !ln.classList.contains("lib")){ e.preventDefault(); extendSel(+ln.dataset.li); return; }
  }
  if (e.target.tagName==="INPUT" || e.button!==0) return;
  const ln = e.target.closest(".ln[data-li]:not(.lib)"); if (!ln) return;
  e.preventDefault();
  if (editing && !commit()) return;
  if (ln.classList.contains("ins")){ openBesideAt(+ln.dataset.li, ln.dataset.key); return; }   // read only: edit it in the pane
  editRoot = null;
  const li = +ln.dataset.li, toks = doc[li], len = codeText(hasNcol(toks) ? toks.slice(1) : toks).length;
  const at = caretAt(ln, e.clientX, len);
  if (lineDragCaret) lineDragCaret.at = at;
  startLineEdit(li, ln.dataset.key, at);
});

/* ---------- Undo ---------- */
// docVer names the program's current state, so a tab knows whether it differs from what was last saved.
function snap(){ return JSON.stringify({ doc, ex:[...expanded], cur:curLine, v:docVer }); }
function pushUndo(){ undoStack.push(snap()); if (undoStack.length > 300) undoStack.shift(); redoStack = []; docVer = ++VER_SEQ; }
function restore(s){
  selAnchor = null;
  const o = JSON.parse(s);
  doc = o.doc;
  expanded = new Set(o.ex);
  curLine = Math.min(o.cur, doc.length-1);
  docVer = o.v;
  foldAutoPending = true;
}
function undo(){
  if (editing && !commit()) return;
  if (!undoStack.length){ setMsg("Nothing to undo"); return; }
  redoStack.push(snap()); restore(undoStack.pop()); render(); setMsg(`Undone. ${undoStack.length} more step${undoStack.length===1?"":"s"} available.`);
}
function redo(){
  if (editing && !commit()) return;
  if (!redoStack.length){ setMsg("Nothing to redo"); return; }
  undoStack.push(snap()); restore(redoStack.pop()); render(); setMsg("Redone");
}

/* ---------- N numbers and subprograms ---------- */
const nOf = toks => SYNTAX==="klartext" ? klBlock(toks) : toks && /^N\d+:?$/.test(toks[0]||"") ? parseInt(toks[0].slice(1)) : null;
// The word that numbers a line: N10, or a bare block number in Klartext. Klartext numbers its blocks 0, 1, 2 …
const nWord = n => SYNTAX==="klartext" ? String(n) : "N" + n;
const nStep = () => SYNTAX==="klartext" ? 1 : N_STEP;
// Labels are "N1000" (Haas M97 P1000) or "O1200" (Okuma CALL O1200, a program block in the same file).
function labels(){ const m = {}; doc.forEach((t, i) => { const n = nOf(t); if (n!=null && m["N"+n]===undefined) m["N"+n] = i; if (/^N[A-Z]/.test(t[0]||"") && m[t[0]]===undefined) m[t[0]] = i; if (/^O\d+$/.test(t[0]||"")) m["O"+parseInt(t[0].slice(1))] = i; const nm = t.find(w => /^\[\w+\]$/.test(w)); if (nm && m[nm]===undefined) m[nm] = i; if (/^%L /.test(t[0]||"") && m[t[0]]===undefined) m[t[0]] = i; const sb = SYNTAX==="fagor8055" && t.map(w => /^\(SUB ?(\d+)\)$/.exec(w)).find(Boolean); if (sb && m["SUB " + parseInt(sb[1])]===undefined) m["SUB " + parseInt(sb[1])] = i;
  const kl = SYNTAX==="klartext" && t.find(w => /^LBL (?!0$)/.test(w));
  if (kl && m[klLabel(kl.slice(4))]===undefined) m[klLabel(kl.slice(4))] = i; }); return m; }
// "N90" or "NA1" as a key into labels()
const labelKey = w => /^N\d+:?$/.test(w) ? "N" + parseInt(w.slice(1)) : w;
function callTarget(toks){
  // Klartext: CALL LBL 5 runs the subprogram at LBL 5 (with REP it repeats a section instead: the simulation follows it)
  if (SYNTAX==="klartext"){
    const c = toks.map(t => /^CALL LBL ("[^"]*"|\d+)(.*)$/.exec(t)).find(Boolean);
    return c && !/\bREP/.test(c[2]) ? klLabel(c[1]) : null;
  }
  // Fagor: LL NAME, #CALL NAME or #PCALL NAME … calls the local subroutine "%L NAME" (a global one is another file)
  const fc = toks.map(t => /^(?:LL|#CALL|#PCALL) ([^ ,]+)/.exec(t)).find(Boolean); if (fc) return "%L " + fc[1];
  // Fagor 8055: (CALL 12) or (PCALL 12, …) calls the "(SUB 12)" in the same file
  const sc = SYNTAX==="fagor8055" && toks.map(t => /^\((?:CALL|PCALL) ?(\d+)(?![\d.])/.exec(t)).find(Boolean); if (sc) return "SUB " + parseInt(sc[1]);
  const c = toks.indexOf("CALL");
  if (c >= 0){ const o = toks.slice(c+1).find(t => /^O\d+$/.test(t)); return o ? "O" + parseInt(o.slice(1)) : null; }
  if (!toks.some(t => isCode(t,"M97"))) return null; const p = toks.find(t => /^P\d/.test(t)); return p ? "N" + parseInt(p.slice(1)) : null;
}
// Okuma subprograms end with RTS (on an Okuma lathe M99 is tailstock thrust high)
const isReturn = toks => SYNTAX==="klartext" ? toks.includes("LBL 0") : toks.some(t => (isCode(t,"M99") && !isOkuma()) || t==="RTS" || (SYNTAX==="fagor8060" && (isCode(t,"M17") || isCode(t,"M29") || t==="#RET")) || (SYNTAX==="fagor8055" && t==="(RET)"));
const isEnd = toks => toks.some(t => isCode(t,"M30") || isCode(t,"M02") || (SYNTAX==="klartext" && t.startsWith("END PGM")));
function subRange(n){
  const s = labels()[n]; if (s===undefined) return null;
  let e = s; while (e < doc.length-1 && !isReturn(doc[e])) e++;
  return [s, e];
}
function mainEnd(){ const i = doc.findIndex(isEnd); return i < 0 ? doc.length-1 : i; }
// The N number for a new line after line `after`: step 10, or the midpoint when there's no room.
function nextN(after){
  if (!autoN) return { n:null, msg:"New line" };
  let cur = null, next = null;
  for (let i = after; i >= 0 && cur===null; i--) cur = nOf(doc[i]);
  for (let i = after+1; i < doc.length && next===null; i++) next = nOf(doc[i]);
  let n = (cur ?? 0) + nStep();
  if (next!=null && n >= next) n = next - (cur ?? 0) > 1 ? (cur ?? 0) + Math.floor((next - (cur ?? 0)) / 2) : null;
  return n!=null ? { n, msg:`New line numbered ${nWord(n)}` } : { n:null, bad:true, msg:`No free ${SYNTAX==="klartext" ? "block" : "N"} number between ${nWord(cur)} and ${nWord(next)}. Use Program › Renumber to make room.` };
}
function newLine(after){
  pushUndo();
  const nn = nextN(after), words = nn.n!=null ? [nWord(nn.n)] : [];
  doc.splice(after+1, 0, words);
  expanded = new Set([...expanded].map(i => i > after ? i+1 : i));
  curLine = after+1; setMsg(nn.msg, nn.bad);
  startLineEdit(after+1, null, 0);
}
/* ---------- Paste ----------
   Pasted text is read the same way as an opened file: split into lines (and at ";"), then into words,
   so "G01X1.Y2." becomes three words. One line goes into the current line, each word in its own cell.
   Several lines go in as their own lines below the current one, or replace it when it's blank. */
function pasteLines(text){
  const out = []; let eob = false;
  for (const line of text.split(/\r\n|\r|\n/)){ const b = splitBlocks(line); if (b.eob) eob = true; b.blocks.forEach(x => out.push(tokenize(x))); }
  while (out.length && !out[0].length) out.shift();
  while (out.length && !out[out.length-1].length) out.pop();
  return { lines: out, eob };
}
// True when the paste was handled here. A single word typed into a cell is left to the browser.
function pasteText(text, fromMenu){
  if (activeTab < 0 || text==null) return false;
  const { lines, eob } = pasteLines(text);
  if (!lines.length) return !!fromMenu;
  if (simIdx!=null) stopSim(true);
  if (lines.length===1){
    // One line of words: typed in at the caret of the line being edited, or added at the end of the current line
    // (before its comment).
    if (editing?.line){
      const inp = editing.input;
      inp.setRangeText(text.replace(/[\r\n]+/g, " ").trim(), inp.selectionStart, inp.selectionEnd, "end");
      onLineInput();
      return true;
    }
    const li = curLine, toks = doc[li], words = lines[0];
    const at = toks.length && isComment(toks[toks.length-1]) ? toks.length-1 : toks.length;
    pushUndo();
    toks.splice(at, 0, ...words);
    render(); ed.focus({preventScroll:true}); showInfo(curLine, null);
    setMsg(`Pasted ${words.length} word${words.length===1 ? "" : "s"}: ${words.join(" ")}`);
    return true;
  }
  if (editing && !commit()) return true;
  const r = selRange();
  if (r){
    pushUndo(); selAnchor = null;
    doc.splice(r[0], r[1] - r[0] + 1, ...lines);
    const shift = lines.length - (r[1] - r[0] + 1);
    expanded = new Set([...expanded].filter(i => i < r[0] || i > r[1]).map(i => i > r[1] ? i + shift : i));
    curLine = r[0] + lines.length - 1;
    render(); scrollToLn(ed.querySelector(`.ln[data-key="m${curLine}"]`)); ed.focus({preventScroll:true}); showInfo(curLine, null);
    setMsg(`Pasted ${lines.length} lines in place of lines ${r[0]+1}–${r[1]+1}. Ctrl+Z puts them back.`);
    return true;
  }
  const li = curLine, t = doc[li];
  const blank = !t.length || (t.length===1 && /^N\d+$/.test(t[0]));   // empty, or only the N number a new line gets
  const wasEmpty = blank && doc.length===1;
  pushUndo();
  doc.splice(blank ? li : li+1, blank ? 1 : 0, ...lines);
  const shift = lines.length - (blank ? 1 : 0);
  expanded = new Set([...expanded].filter(i => !(blank && i===li)).map(i => i > li ? i + shift : i));
  if (wasEmpty && eob) fileEob = true;
  curLine = (blank ? li : li+1) + lines.length - 1;
  render(); scrollToLn(ed.querySelector(`.ln[data-key="m${curLine}"]`)); ed.focus({preventScroll:true}); showInfo(curLine, null);
  setMsg(`Pasted ${lines.length} lines${blank ? "" : " below line " + (li+1)}. Ctrl+Z takes them out again.`);
  return true;
}
/* The clipboard for the menus (right-click and Edit): a page can only reach the clipboard by itself during a key press
   (Ctrl+C, Ctrl+V), so the program's own clipboard calls are used, and the browser's when the page runs on its own. */
function clipRead(){
  const N = window.GlossCodeNative;
  if (N?.clipboardText) return N.clipboardText().then(t => t ?? "");
  return navigator.clipboard?.readText ? navigator.clipboard.readText() : Promise.reject(new Error("no clipboard"));
}
function clipWrite(t){
  const N = window.GlossCodeNative;
  if (N?.setClipboardText) return N.setClipboardText(t).then(ok => { if (!ok) throw new Error("clipboard refused"); });
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(t);
  const ta = document.createElement("textarea");
  ta.value = t;
  ta.style.cssText = "position:fixed;left:-9999px;top:0";   // the old way, still allowed from a click
  document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch {} ta.remove();
  return ok ? Promise.resolve() : Promise.reject(new Error("no clipboard"));
}
function pasteFromMenu(){
  clipRead().then(t => { if (!t) setMsg("The clipboard has no text to paste.", true); else pasteText(t, true); })
    .catch(() => setMsg("GlossCode couldn't read the clipboard. Press Ctrl+V to paste.", true));
}
ed.addEventListener("paste", e => {
  const t = e.clipboardData?.getData("text/plain");
  if (editing?.line){   // one line of text goes into the line being edited; several lines go below it
    if (!t || !/[\r\n]/.test(t.replace(/[\r\n]+$/, ""))) return;
    e.preventDefault(); if (commit()){ render(); pasteText(t, true); } return;
  }
  if (t && pasteText(t)) e.preventDefault();
});
/* ---------- Selecting whole lines ----------
   Shift+↑↓ or Shift+click selects lines. Ctrl+C copies them as G-code text (what Save would write),
   Ctrl+X cuts them, Ctrl+D puts a copy below, and Ctrl+V pastes over them. With no lines selected,
   these act on the current line. */
function selRange(){
  if (selAnchor==null || selAnchor===curLine || !doc[selAnchor]) return null;
  return [Math.min(selAnchor, curLine), Math.max(selAnchor, curLine)];
}
const inSel = li => { const r = selRange(); return !!r && li >= r[0] && li <= r[1]; };
const linesToCopy = () => { const r = selRange() || [curLine, curLine]; return r; };
function extendSel(to){
  if (editing && !commit()) return;
  if (selAnchor==null) selAnchor = curLine;
  selectLine(to, false, true);
  const r = selRange(); setMsg(r ? `${r[1]-r[0]+1} lines selected. Ctrl+C copies, Ctrl+X cuts, Ctrl+D duplicates, Delete removes them.` : "");
}
function selectAllLines(){
  if (editing && !commit()) return;
  selAnchor = 0;
  selectLine(doc.length-1, false, true);
  setMsg(`All ${doc.length} lines selected.`);
}
function clearSel(){ if (selAnchor==null) return false; selAnchor = null; render(); setMsg(""); return true; }
// The selected lines as G-code text, one block per line, the same as Save writes them.
function copyText(){ const [a, b] = linesToCopy(); return doc.slice(a, b+1).map(lineText).join("\r\n") + "\r\n"; }
function copyMsg(verb){ const [a, b] = linesToCopy(); return b > a ? `${verb} lines ${a+1}–${b+1} (${b-a+1} lines).` : `${verb} line ${a+1}.`; }
function removeLines(a, b){
  const n = b - a + 1;
  if (n >= doc.length){ doc = [[]]; expanded = new Set(); curLine = 0; }
  else { doc.splice(a, n); expanded = new Set([...expanded].filter(i => i < a || i > b).map(i => i > b ? i - n : i)); curLine = Math.min(a, doc.length-1); }
  selAnchor = null;
}
function cutLines(){
  const [a, b] = linesToCopy(), msg = copyMsg("Cut");
  pushUndo();
  removeLines(a, b);
  render();
  setMsg(msg + ` Ctrl+V pastes ${b > a ? "them" : "it"}, Ctrl+Z puts ${b > a ? "them" : "it"} back.`);
}
function duplicateLines(){
  if (editing && !commit()) return;
  const [a, b] = linesToCopy(), copy = doc.slice(a, b+1).map(t => [...t]), n = copy.length;
  pushUndo();
  doc.splice(b+1, 0, ...copy);
  expanded = new Set([...expanded].map(i => i > b ? i + n : i));
  selAnchor = n > 1 ? b+1 : null; curLine = b + n;
  render(); scrollToLn(ed.querySelector(`.ln[data-key="m${curLine}"]`)); ed.focus({preventScroll:true});
  const hasN = copy.some(t => nOf(t)!=null);
  setMsg(`Duplicated ${n===1 ? "line " + (a+1) : n + " lines"}. The copy is selected below the original.${hasN ? " Its N numbers repeat the original's: Program › Renumber gives it new ones." : ""}`);
}
function copyFromMenu(cut){
  if (editing && !commit()) return;
  const t = copyText(), msg = copyMsg(cut ? "Cut" : "Copied");
  clipWrite(t).then(() => {
    if (cut) cutLines(); else setMsg(msg);
  }).catch(() => setMsg(`GlossCode couldn't use the clipboard. Press Ctrl+${cut ? "X" : "C"} instead.`, true));
}
ed.addEventListener("copy", e => {
  if (editing?.line && editing.input.selectionStart===editing.input.selectionEnd){
    e.preventDefault();
    e.clipboardData.setData("text/plain", copyText());
    setMsg(copyMsg("Copied"));
    return;
  }
  if (editing || activeTab < 0) return;
  e.preventDefault();
  e.clipboardData.setData("text/plain", copyText());
  setMsg(copyMsg("Copied") + " Ctrl+V pastes them, or Ctrl+D duplicates without the clipboard.");
});
ed.addEventListener("cut", e => {
  if (editing || activeTab < 0) return;
  e.preventDefault(); e.clipboardData.setData("text/plain", copyText()); cutLines();
});
// Dragging the mouse from one line to another selects the lines in between. A drag that starts on a word
// stops editing it (nothing typed is lost: the word was only just opened).
let lineDrag = null, lineDragCaret = null;
// Registered before the editor's own mousedown (below), so the click's caret position can be kept for a drag.
ed.addEventListener("mousedown", e => { lineDragCaret = e.button===0 && e.target.tagName!=="INPUT" ? { at:null } : null; }, true);
ed.addEventListener("mousedown", e => {
  if (e.button!==0 || e.shiftKey || e.target.closest(".xp") || e.target.tagName==="INPUT") return;
  const ln = e.target.closest(".ln[data-li]:not(.ins):not(.lib)"); lineDrag = ln ? { from:+ln.dataset.li, at:lineDragCaret?.at } : null;
});
ed.addEventListener("mousemove", e => {
  if (!lineDrag || !(e.buttons & 1)) return;
  const ln = e.target.closest(".ln[data-li]:not(.ins):not(.lib)"); if (!ln) return;
  const li = +ln.dataset.li;
  // Dragging along the line being edited selects its text
  if (li===lineDrag.from && editing?.line && editing.li===li && lineDrag.at!=null){
    const len = editing.input.value.length, b = caretAt(ln, e.clientX, len);
    e.preventDefault(); editing.input.setSelectionRange(Math.min(lineDrag.at, b), Math.max(lineDrag.at, b), b < lineDrag.at ? "backward" : "forward"); return;
  }
  if (li===lineDrag.from && selAnchor==null) return;
  if (editing){ if (editing.line){ clearTimeout(lineTimer); doc[editing.li] = editing.orig; } editing = null; }
  e.preventDefault(); window.getSelection()?.removeAllRanges();
  selAnchor = lineDrag.from; if (li!==curLine){ curLine = li; render(); }
});
document.addEventListener("mouseup", () => {
  if (!lineDrag) return; lineDrag = null;
  const r = selRange(); if (r){ ed.focus({preventScroll:true}); setMsg(`${r[1]-r[0]+1} lines selected. Right-click or Ctrl+C to copy.`); }
});
// Right-click: Cut, Copy, Paste and Duplicate for the selected lines (or the line clicked).
let ctxEl = null;
function closeCtx(){ ctxEl?.remove(); ctxEl = null; }
ed.addEventListener("contextmenu", e => {
  if (e.target.tagName==="INPUT") return;   // a word being edited gets the normal text menu
  const ln = e.target.closest(".ln[data-li]:not(.ins):not(.lib)"); if (!ln) return;
  e.preventDefault(); closeMenu(); closeCtx();
  if (editing && !commit()) return;
  const li = +ln.dataset.li; if (!inSel(li)){ selAnchor = null; curLine = li; render(); }
  const r = selRange(), n = r ? r[1]-r[0]+1 : 1, what = n > 1 ? `${n} lines` : "line";
  const items = [
    { label:`Cut ${what}`, sc:"Ctrl+X", fn:() => copyFromMenu(true) },
    { label:`Copy ${what}`, sc:"Ctrl+C", fn:() => copyFromMenu(false) },
    { label:n > 1 ? `Paste over ${what}` : "Paste below", sc:"Ctrl+V", fn:pasteFromMenu },
    { label:`Duplicate ${what}`, sc:"Ctrl+D", fn:duplicateLines }, "-",
    { label:`Delete ${what}`, sc:"Ctrl+Shift+K", fn:deleteLine },
    { label:"Select all lines", sc:"Ctrl+A", fn:selectAllLines }];
  ctxEl = document.createElement("div"); ctxEl.className = "menu ctx";
  ctxEl.innerHTML = items.map((it, i) => it==="-" ? `<div class="sep"></div>` : `<div class="it" data-i="${i}"><span class="ck"></span><span>${esc(it.label)}</span><span class="sc">${it.sc}</span></div>`).join("");
  document.body.appendChild(ctxEl);
  const w = ctxEl.offsetWidth, h = ctxEl.offsetHeight;
  ctxEl.style.left = Math.min(e.clientX, innerWidth - w - 4) + "px"; ctxEl.style.top = Math.min(e.clientY, innerHeight - h - 4) + "px";
  ctxEl.addEventListener("mousedown", ev => {
    ev.preventDefault();
    const it = ev.target.closest(".it");
    if (!it) return;
    const item = items[+it.dataset.i];
    closeCtx();
    item.fn();
  });
});
document.addEventListener("mousedown", e => { if (ctxEl && !ctxEl.contains(e.target)) closeCtx(); });
document.addEventListener("keydown", e => { if (ctxEl && e.key==="Escape"){ e.stopPropagation(); closeCtx(); } }, true);
function deleteLine(){
  if (editing) editing = null;
  const r = selRange();
  if (r){ pushUndo(); const n = r[1]-r[0]+1; removeLines(r[0], r[1]); render(); setMsg(`Deleted ${n} lines. Ctrl+Z brings them back.`); return; }
  if (doc.length < 2) return;
  pushUndo();
  const li = curLine; const gone = doc[li].join(" ");
  doc.splice(li, 1);
  expanded = new Set([...expanded].filter(i => i!==li).map(i => i > li ? i-1 : i));
  curLine = Math.min(li, doc.length-1); render(); setMsg(`Deleted "${gone}". Ctrl+Z brings it back.`);
}
function renumber(){
  if (editing && !commit()) return;
  pushUndo();
  if (SYNTAX==="klartext"){   // every block, from 0 (labels are LBL names, so calls still work)
    let n = 0; doc.forEach(t => { if (!t.length) return; if (klBlock(t)!=null) t[0] = String(n); else t.unshift(String(n)); n++; });
    render(); setMsg(`Renumbered ${n} blocks from 0.`); return;
  }
  const called = new Set(doc.map(callTarget).filter(n => n!=null));
  const end = mainEnd(); let n = N_STEP, count = 0;
  for (let i = 0; i <= end; i++){
    const t = doc[i];
    if (!t.length || t[0].startsWith("O") || t.every(w => isComment(w) || !/^[A-Z#\/]/.test(w))) continue;   // comments and "%" lines get no N
    const old = nOf(t); if (old!=null && called.has("N"+old)) continue;
    const w = "N"+n; if (old!=null) t[0] = w; else t.unshift(w);
    n += N_STEP; count++;
  }
  render(); setMsg(`Renumbered ${count} lines by ${N_STEP}. Subprogram labels were left alone so their calls still work.`);
}

/* ---------- Editing ----------
   The code is edited one line at a time (startLineEdit, above). commit() reads the line being edited into words;
   it returns false when that can't be done, and { at, n } otherwise. */
function commit(){
  if (!editing) return { at:0, n:0 };
  return commitLine();
}
// ↑ ↓ move the current line; a folded run counts as one line.
function moveLine(d){
  const li = lineStep(curLine, d); if (li===curLine) return;
  selectLine(li); showInfo(li, null);
}
// Start editing the current line with the caret at its end, typing `typed` there.
function editLineEnd(typed){
  const toks = doc[curLine]; startLineEdit(curLine, null, null);
  if (typed && editing?.line){
    const inp = editing.input, v = inp.value;
    inp.value = v + (v && !/\s$/.test(v) && /^[A-Z(#/]/i.test(typed) ? " " : "") + typed;
    inp.setSelectionRange(inp.value.length, inp.value.length);
    onLineInput();
  }
  return toks;
}
/* ---------- Selection ---------- */
function scrollToLn(el){
  if (!el) return;
  const box = el.closest(".ed") || ed;   // the editor, or the subprogram pane
  const t = el.offsetTop, b = t + el.offsetHeight;
  if (simX && box===ed){ ed.scrollTop = t - (ed.clientHeight - el.offsetHeight)/2; return; }   // the expanded view keeps the active line in the middle
  if (t < box.scrollTop + 8) box.scrollTop = t - 8;
  else if (b > box.scrollTop + box.clientHeight - 8) box.scrollTop = b - box.clientHeight + 8;
}
/* ---------- Folding long runs of moves ----------
   A CAM program is mostly plain moves: thousands of lines cutting the same contour at one depth after another. Those
   runs fold away under the line that starts them, the way a subprogram call folds its lines away. A fold starts at
   the first line that moves down (Z on a mill, X on a lathe) after a line that didn't, so one fold is one layer: the
   ramp in, the cut, the ramp out and the move back. Anything that isn't a plain G01/G02/G03 move ends a fold and
   stays visible: a rapid (G00, or a G01 at a feed many times the cutting feed, which some programs use to reposition),
   an M code, a tool change, a comment, a block-delete line, a label that's called or jumped to, a canned cycle.
   Neighbouring folds smaller than FOLD_MIN lines are merged; a run that's still smaller doesn't fold.
   Opening a file folds every fold in a section (the lines between comments, tool changes and labels) when that
   section's folded lines wouldn't fit in the window. After that the folds are the user's: each ▸ opens and closes
   its own, and each place a subprogram is shown keeps its own. Lines are never changed, only shown or not. */
const FOLD_MIN = 10;
let foldFast = 10, foldAuto = true, foldAutoPending = false, FOLDV = 0, FOLD = null;
// The open/closed state of each fold, by its first line's word list (so it follows the line when lines above are
// added or removed). by: Map from where it's shown (null for the program, a call line's words for a subprogram
// shown under that call) to closed or not; auto: closed by the rule on opening the file.
const FSTATE = new WeakMap();
const fst = toks => { let f = FSTATE.get(toks); if (!f) FSTATE.set(toks, f = { auto:false, by:new Map() }); return f; };
function foldScan(){
  const key = [docVer, doc.length, machineId, foldFast, SYNTAX].join("|");
  if (FOLD && FOLD.key===key && FOLD.doc===doc) return FOLD;
  const count = doc.length, end = new Int32Array(count).fill(-1), owner = new Int32Array(count).fill(-1), depth = new Float64Array(count);
  FOLD = { key, doc, end, owner, depth, refs:new Set() };
  if (SYNTAX==="klartext") return FOLD;
  const lathe = mtype()==="lathe", AX = lathe ? "X" : "Z";
  // labels the program calls or jumps to: a fold never hides one
  const refs = new Set();
  FOLD.refs = refs;
  doc.forEach(t => { if (t.some(w => isCode(w, "M97") || isCode(w, "M98") || isCode(w, "M99") || isCode(w, "G65") || /^GOTO/.test(w)))
    t.forEach(w => { const m = /^(?:P|GOTO ?N?)(\d+)$/.exec(w); if (m) refs.add(parseInt(m[1])); }); });
  const num = w => {
    const v = w.slice(1);
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(v)) return NaN;
    const x = parseFloat(v);
    return v.includes(".") || x===0 ? x : NaN;
  };
  let mode = null, abs = true, pos = null, F = null, cutF = null;
  const move = new Uint8Array(count), down = new Uint8Array(count);
  for (let li = 0; li < count; li++){
    const t = doc[li]; let ok = t.length > 0 && !isBlockDel(t), m = mode, val = null, f = null, xy = false;
    for (const w of t){
      if (w===";") continue;
      const L = w[0];
      if (L==="N" && /^N\d+$/.test(w)){ if (refs.has(parseInt(w.slice(1)))) ok = false; continue; }
      if (L==="G"){
        if (isCode(w, "G00")) m = 0; else if (isCode(w, "G01")) m = 1; else if (isCode(w, "G02")) m = 2; else if (isCode(w, "G03")) m = 3;
        else { if (isCode(w, "G90")) abs = true; else if (isCode(w, "G91")) abs = false; ok = false; }
        continue;
      }
      if ("XYZIJKRF".includes(L) && w.length > 1){
        const v = num(w); if (isNaN(v)){ ok = false; continue; }
        if (L===AX) val = v; if (L==="F") f = v; if (L==="X" || L==="Y") xy = true;
        continue;
      }
      ok = false;   // M, T, S, comments, P, L, macro words, anything else
    }
    // Lines are read in file order, not run order: a subprogram's lines come after the main program's M30, so at a
    // label that's called, an M99 or an M30 the position is forgotten and G90 assumed (a "G28 G91 Z0." before M30
    // would otherwise make the subprogram's moves incremental).
    if (t.some(w => isCode(w, "M30") || isCode(w, "M99") || isCode(w, "M02") || /^N\d+$/.test(w) && refs.has(parseInt(w.slice(1))))){
      abs = true;
      pos = null;
      mode = null;
      F = cutF = null;
      move[li] = down[li] = 0;
      continue;
    }
    mode = m; if (f!=null) F = f;
    const prev = pos;
    if (val!=null) pos = abs ? val : (pos ?? 0) + val;
    depth[li] = pos ?? 0;
    if (m==null || m===0) ok = false;
    else if (m===1 && xy && F!=null && cutF!=null && foldFast > 0 && F >= foldFast*cutF) ok = false;   // a "rapid" at a fast feed
    else if (F!=null) cutF = F;
    move[li] = ok ? 1 : 0;
    down[li] = ok && val!=null && (prev==null || pos < prev - 1e-9) ? 1 : 0;   // the first depth after a label counts as going down
  }
  // runs of plain moves, cut into folds where a descent starts
  for (let a = 0; a < count; ){
    if (!move[a]){ a++; continue; }
    let b = a; while (b + 1 < count && move[b + 1]) b++;
    const starts = []; for (let i = a; i <= b; i++) if (down[i] && !(i > a && down[i - 1])) starts.push(i);
    let fs = starts.map((st, k) => [st, k + 1 < starts.length ? starts[k + 1] - 1 : b]);
    for (let k = 0; k < fs.length && fs.length > 1; ){   // merge the small ones into a neighbour
      if (fs[k][1] - fs[k][0] + 1 >= FOLD_MIN){ k++; continue; }
      if (k + 1 < fs.length){ fs[k] = [fs[k][0], fs[k + 1][1]]; fs.splice(k + 1, 1); }
      else { fs[k - 1] = [fs[k - 1][0], fs[k][1]]; fs.splice(k, 1); k--; }
    }
    for (const [x, y] of fs) if (y - x + 1 >= FOLD_MIN){ end[x] = y; for (let i = x + 1; i <= y; i++) owner[i] = x; }
    a = b + 1;
  }
  return FOLD;
}
const foldClosed = (h, ctx = null) => { const f = FSTATE.get(doc[h]); if (!f) return false; return f.by.has(ctx) ? f.by.get(ctx) : f.auto; };
// The fold hiding line li where it's shown (ctx), or -1.
function foldHiding(li, ctx = null){ const F = foldScan(), h = F.owner[li]; return h >= 0 && foldClosed(h, ctx) ? h : -1; }
function setFold(h, ctx, closed){ fst(doc[h]).by.set(ctx, closed); FOLDV++; }
function foldAll(closed){
  const F = foldScan();
  F.end.forEach((e, h) => { if (e >= 0){ const f = fst(doc[h]); f.auto = closed; f.by.clear(); } });
  if (closed && F.owner[curLine] >= 0) curLine = F.owner[curLine];
  FOLDV++; render();
  scrollToLn(ed.querySelector(`.ln[data-key="m${curLine}"]`));
}
// On opening a file: in each section whose folded lines wouldn't fit in the window, fold them all, except a fold with
// a problem in it or the line the cursor is on.
function foldOnOpen(){
  foldAutoPending = false;
  if (!foldAuto) return;
  const F = foldScan(), rows = Math.max(10, Math.floor((ed.clientHeight || 600) / (showMode==="both" ? 43 : 21)));
  if (doc.length <= rows) return;
  const brk = t => !t.length || t.every(w => /^N\d+$/.test(w) || w[0]==="(" || w===";") || t.some(w => isCode(w, "M06") || isCode(w, "M99") || isCode(w, "M30") || /^N\d+$/.test(w) && F.refs.has(parseInt(w.slice(1))));
  let sec = [], hid = 0;
  const flush = () => { if (hid > rows) for (const h of sec){ let bad = false; for (let i = h; i <= F.end[h]; i++) if (PBYLINE[i]?.some(p => p.sev!=="info")){
    bad = true;
    break;
  }
    if (!bad && !(curLine > h && curLine <= F.end[h])) fst(doc[h]).auto = true; } sec = []; hid = 0; };
  for (let li = 0; li < doc.length; li++){
    if (F.end[li] >= 0){ sec.push(li); hid += F.end[li] - li; li = F.end[li]; continue; }
    if (F.owner[li] < 0 && brk(doc[li])) flush();
  }
  flush(); FOLDV++;
}
function foldButton(h, ctx, ctxLi){
  const F = foldScan(), e = F.end[h], closed = foldClosed(h, ctx), lathe = mtype()==="lathe";
  let lo = Infinity; for (let i = h; i <= e; i++) lo = Math.min(lo, F.depth[i]);
  let prob = false; if (closed) for (let i = h + 1; i <= e && !prob; i++) prob = !!PBYLINE[i]?.some(p => p.sev!=="info");
  const at = isFinite(lo) ? ` · ${lathe ? "X" : "Z"}${(Math.round(lo*1000)/1000).toFixed(3)}` : "";
  return `<button class="xp fold${prob ? " warn" : ""}" data-fold="${h}" data-ctx="${ctxLi ?? ""}" title="${closed ? `${e - h} more moves to line ${e + 1}, down to ${at.slice(3)}. Click to show them.` : "Click to fold these moves away."}${prob ? " There's a problem in them." : ""}">${closed ? "▸" : "▾"} ${e - h} lines${at}${prob ? " ⚠" : ""}</button>`;
}
const saveFoldPrefs = () => window.saveFoldPrefs?.({ fast:foldFast, auto:foldAuto });
window.loadFoldPrefs = p => { if ([0, 3, 5, 10].includes(p.fast)) foldFast = p.fast; if (typeof p.auto==="boolean") foldAuto = p.auto; };
function setFoldFast(x){ foldFast = x; saveFoldPrefs(); render();
  setMsg(x ? `A G01 at ${x}× the cutting feed or more counts as a rapid: it ends a fold and stays visible.` : "Only G00 counts as a rapid for folding."); }
function selectLine(li, keepSim, keepSel){
  if (editing && !commit()) return;
  if (!keepSel) selAnchor = null;
  if (simIdx!=null && !keepSim) stopSim(true);
  curLine = Math.max(0, Math.min(li, doc.length-1)); renderCursor(); showInfo(curLine, null);
  scrollToLn(ed.querySelector(`.ln[data-key="m${curLine}"]`));
  ed.focus({preventScroll:true});
}

/* ---------- Find ---------- */
const findbar = $("findbar"), findq = $("findq");
function findHits(){
  if (!findQ) return [];
  const out = [];
  doc.forEach((toks, li) => {
    if (toks.some((t, i) => t.toUpperCase().includes(findQ) || (view[li][i]?.e || "").toUpperCase().includes(findQ))) out.push(li);
  });
  return out;
}
function updateFindCount(h){
  const c = $("fcnt");
  if (!findQ){ c.textContent = ""; return; }
  const i = h.indexOf(curLine);
  c.textContent = h.length ? (i >= 0 ? `${i+1} of ${h.length} lines` : `${h.length} line${h.length>1?"s":""}`) : "No matches";
}
function openFind(){ if (editing) commit(); findbar.hidden = false; findq.focus(); findq.select(); }
function closeFind(){ findbar.hidden = true; findQ = ""; findq.value = ""; render(); ed.focus({preventScroll:true}); }
function findNext(dir){
  const h = findHits(); if (!h.length) return;
  let n = dir > 0 ? h.find(li => li > curLine) : [...h].reverse().find(li => li < curLine);
  if (n===undefined) n = dir > 0 ? h[0] : h[h.length-1];
  selectLine(n); findq.focus();
}
findq.addEventListener("input", () => {
  findQ = findq.value.trim().toUpperCase();
  const h = findHits();
  if (h.length && !h.includes(curLine)){ curLine = h.find(li => li >= curLine) ?? h[0]; }
  render();
  scrollToLn(ed.querySelector(`.ln[data-key="m${curLine}"]`));
});
findq.addEventListener("keydown", e => {
  if (e.key==="Enter"){ e.preventDefault(); findNext(e.shiftKey ? -1 : 1); }
  if (e.key==="Escape"){ e.preventDefault(); closeFind(); }
});
$("f-next").onclick = () => findNext(1);
$("f-prev").onclick = () => findNext(-1);
$("f-x").onclick = closeFind;
