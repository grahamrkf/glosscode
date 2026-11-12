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
    // label that's called, a subprogram end (M99, or RTS on Okuma, where M99 is tailstock thrust) or an M30 the position is forgotten and G90 assumed (a "G28 G91 Z0." before M30
    // would otherwise make the subprogram's moves incremental).
    if (isReturn(t) || t.some(w => isCode(w, "M30") || isCode(w, "M02") || /^N\d+$/.test(w) && refs.has(parseInt(w.slice(1))))){
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
  setMsg(x ? `A G01 at ${x}× the cutting feed or more counts as a rapid: it ends a collapsed run and stays visible.` : "Only G00 counts as a rapid when collapsing."); }
function selectLine(li, keepSim, keepSel){
  if (editing && !commit()) return;
  if (!keepSel) selAnchor = null;
  if (simIdx!=null && !keepSim) stopSim(true);
  curLine = Math.max(0, Math.min(li, doc.length-1)); renderCursor(); showInfo(curLine, null);
  scrollToLn(ed.querySelector(`.ln[data-key="m${curLine}"]`));
  ed.focus({preventScroll:true});
}

