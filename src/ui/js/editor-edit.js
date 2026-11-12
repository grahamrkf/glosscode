/* ---------- Editing lines: the mouse, undo, N numbers, paste, copy and line selection ----------
   Mouse handlers on the editor (hover lights up a code word and its gloss together; a click edits the line), the undo
   and redo stacks (one snapshot of the program per change), N numbers and the labels subprogram calls point to
   (nOf, labels, callTarget, subRange), paste of whole programs or lines, selecting whole lines by dragging in the
   margin, copy, cut, duplicate and delete, and Program › Renumber. */
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
// How deep calls can nest on this control (DIALECT.callDepth, from the manuals: sub for subprogram calls, macro for
// G65 macro calls, total where the two share one count). The calls GlossCode follows in the file (M97, CALL, Fagor
// subroutines) count as subprogram levels and a G65 to a library subprogram as a macro level. Fanuc Series 0 allows
// more subprogram levels with the macro option (subWithMacro).
function callLimit(){
  const c = DIALECT.callDepth || {};
  return { sub: MACHINES[machineId]?.macro && c.subWithMacro ? c.subWithMacro : c.sub, macro:c.macro, total:c.total, c };
}
// How many levels of calls the gloss, the checks and the simulation follow: the control's limit, and at least 8
function callFollowDepth(){ const L = callLimit(); return Math.max(8, L.sub || 0, L.total || 0); }
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
