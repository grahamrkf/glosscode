/* ---------- The editor: drawing the program and editing one line ----------
   render() draws the active tab's program into #ed, one row per line: the N number in its own column, the code, and the
   gloss above it in small grey text (see "Code with gloss above" below). Rows are patched in place rather than redrawn
   when only some lines changed. A click on a line starts editing it as plain text (startLineEdit); onLineInput keeps
   the gloss in step with the typing, and commitLine reads the text back into words when the caret leaves the line.
   The rest of the editor is in the files after this one, in the order index.html loads them:
     editor-panels.js  the status bar, the info line under the editor, the active modes and the variables panels
     editor-edit.js    clicking and dragging on lines, undo, N numbers and labels, paste, copy and cut, whole-line
                       selection and its right-click menu, renumbering
     editor-fold.js    folding long runs of moves, and selectLine (moving the current line)
     editor-find.js    the find bar (Ctrl+F)
   Uses: doc, view, lineState, curLine and the other active-tab values (state.js), word() and translateAll()
   (gloss.js), PBYLINE from the checks (checks.js). */
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
    PROBLEMS.push({ li:EXEC.alarm.li, id:"machine-alarm", sev:"error", title:"Machine alarm", msg: EXEC.alarm.nest ? EXEC.alarm.text : "Alarm: " + EXEC.alarm.text,
      why: EXEC.alarm.nest ? `Each call inside a subprogram is one level deeper. ${DIALECT.callDepth?.source ? "From " + DIALECT.callDepth.source + "." : ""}`
        : "The machine profile doesn't have this option, so the control stops the program on this line. Turn the option on in File › Machine profiles… if the machine has it." });
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
  for (const h of hintItems(li)) out.push(`<span class="gh" title="${esc(`${h.code} needs ${needsText(h)}: ${hintMeaning(h)}`)}">${h.alt ? "or " : ""}${esc(glossPrefix(h.L, st))}${style==="short" ? "" : ""}?</span>`);
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
