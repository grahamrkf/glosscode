/* ---------- Toolpath and simulation ---------- */
// How many straight moves draw an arc of sweep sw (radians): a full circle gets "full" of them, a part of one its share
// (at least 2). Every arc used to get the full count, so a program of short arcs had 36 moves to draw and simulate for each.
const arcSteps = (sw, full) => Math.max(2, Math.min(full, Math.ceil(Math.abs(sw)/(2*Math.PI)*full - 1e-9)));
function interpret(){
  if (SYNTAX==="klartext") return interpretKlartext();
  const lathe = mtype()==="lathe";
  let p = {x: lathe ? 2 : 0, y:0, z:1}, mode = 0, dist = "abs", tool = null, pendingT = null;
  // Canned cycles (mills): the cycle code stays on until G80 or G00-G03, Z and R carry over to the next holes,
  // and G98 returns to the Z the cycle started at, G99 to R. L0 on the cycle line stores the cycle without drilling.
  let ret = "G98", cyc = null, cycZ = null, cycR = null, cycD = null, cycQ = null;
  // Macro variables (#1, #110…), set by "#110=-0.035" lines and read by words like X-#101 and Z#110.
  // Local subprograms (M97) share them with the main program. vals keeps what each word worked out to, per run.
  const V = {}, vals = {}, near = (a, b) => Math.abs(a - b) < 1e-9;
  // Okuma: named variables (V1, VC2, DIA1…), set by "V1=3" and read by words like X=DIA1 and IF [V2 GE V1].
  // On an Okuma lathe, G50 X/Z moves the zero (G91 G50 Z0.44 shifts it, to make the next part further along the bar),
  // so p is where the tool really is and off is the program zero's shift from where it started.
  const okL = lathe && isOkuma(), NV = {}, off = { x:0, z:0 };
  // Lathe drilling cycles on center (Haas and Fanuc style G81-G89), drawn like a mill's holes along Z
  const latheDrill = c => lathe && !okL && !SYNTAX && /^G(8[1-9]|184)$/.test(c);
  let F = null;   // the feed rate as it runs (an F#111 is only known here)
  const segs = [], steps = [], L = labels(), stack = []; let i = 0, guard = 0, entering = false, noCyc = false;
  // ,C and ,R corners (Fanuc style): a G01 line with one waits for the next G01 move, then both are cut short and joined by
  // the chamfer or radius. ghosts are the parts of the two moves out to the sharp corner, which the tool doesn't cut.
  const ghosts = []; let corner = null;
  let turns = 0;   // how many times this line's arcs go round (a helix), for the timeline
  // Engraving (Haas G47): a grey box for each character's outer bounds, not the letters. engZ is the line's depth, for the timeline.
  const boxes = []; let engZ = null;
  // tail is the tailstock (in, out, or null until a tailstock code runs).
  let tail = null;
  // Mills: G68 rotation and mirror imaging (Haas G101, Fanuc G51.1). p stays where the program says, as written; each move
  // is mirrored (mir: the line each axis is mirrored about, or null) and then turned (rot: center and angle in radians)
  // as it goes into segs, so arcs, holes and engraving all follow.
  let rot = null; const mir = { x:null, y:null };
  // Cutter comp (G41 left, G42 right, G40 off) and its D number: D0 means no offset. Feed moves made with it carry
  // comp ("L" or "R": the side of the move the tool's centre is on), drawn as a grey band on that side.
  let comp = null, compD = null;
  // Haas G107 cylindrical mapping: Y goes round the A axis. wrap is the open span, wraps the finished ones.
  let wrap = null; const wraps = [];
  // A code the machine can't run (an option it doesn't have): the control alarms, so the simulation stops there.
  let alarm = null;
  const odd = () => (mir.x!=null) !== (mir.y!=null);
  const xfPt = q => {
    if (lathe || (!rot && mir.x==null && mir.y==null)) return q;
    let x = q.x, y = q.y;
    if (mir.x!=null) x = 2*mir.x - x; if (mir.y!=null) y = 2*mir.y - y;
    if (rot){ const dx = x - rot.cx, dy = y - rot.cy, c = Math.cos(rot.a), s = Math.sin(rot.a); x = rot.cx + dx*c - dy*s; y = rot.cy + dx*s + dy*c; }
    return { ...q, x, y };
  };
  const xfVec = v => { const o = xfPt({ x:v.x, y:v.y }), z = xfPt({ x:0, y:0 }); return { x:o.x - z.x, y:o.y - z.y }; };
  const xfSeg = s => {
    if (s.xf) return s; s.xf = true;
    s.a = xfPt(s.a); s.b = xfPt(s.b);
    if (s.sweep && !lathe){ const u = xfVec({ x:s.sweep.ux, y:s.sweep.uy }); s.sweep = { ...s.sweep, ux:u.x, uy:u.y }; }
    if (comp && compD!==0 && !s.rapid && (s.kind==="feed" || s.kind==="arc")) s.comp = odd() ? (comp==="L" ? "R" : "L") : comp;
    if (wrap) s.wrap = true;
    return s;
  };
  segs.push = function(...a){ a.forEach(xfSeg); return Array.prototype.push.apply(this, a); };
  // Notes for the simulation (a G68 with no R): shown while the line's effect lasts, from step k until step until.
  const notes = []; let rotNote = null;
  // The Variables panel: every variable the program sets or reads, in run order. Start values (the machine's common
  // values, then this program's own) are set before the first line. VUSE[key]: set = the first line that sets it,
  // early = the first line that reads it before anything has set it, hist = [step, value] each time it's set.
  const VUSE = {}, okNames = new Set(), seeds = varSeeds(); let curLi = 0;
  const okVars = isOkuma();
  if (okVars) doc.forEach(tk => tk.forEach(t => { const m = /^([A-Z][A-Z0-9]+)=/.exec(t); if (m) okNames.add(m[1]); }));
  const use = k => (VUSE[k] ||= { set:null, early:null, hist:[] });
  for (const [k, v] of Object.entries(seeds)){
    if (/^#\d+$/.test(k)) V[+k.slice(1)] = v; else NV[k] = v;
    use(k).hist.push([-1, v]); VUSE[k].seed = true;
  }
  const noteRead = src => {
    for (const m of src.matchAll(/#(\d+)/g)){
      const n = +m[1]; if (!(n > 0 && n < 1000)) continue;
      const u = use("#" + n); if (!(n in V) && u.set==null && u.early==null) u.early = curLi;
    }
    if (okVars) for (const m of src.matchAll(/[A-Z][A-Z0-9]*/g)){
      const nm = m[0]; if (!okNames.has(nm) && !/^V[A-Z]*\d+$/.test(nm)) continue;
      const u = use(nm); if (!(nm in NV) && u.set==null && u.early==null) u.early = curLi;
    }
  };
  const noteSet = (k, v) => { const u = use(k); if (u.set==null) u.set = curLi; u.hist.push([steps.length, v]); };
  // An Okuma lathe's LAP contour (G81/G82/G83 … G80) only runs from a G85/G87 line: in order, it's passed over.
  const isLapDef = toks => okL && toks.some(t => isCode(t,"G81") || isCode(t,"G82") || isCode(t,"G83"));
  while (i < doc.length && guard++ < 20000){
    const li = i, toks = doc[i]; curLi = li;
    if (simBD && isBlockDel(toks)){ i++; continue; }   // Block delete is on: the control skips "/" lines
    // A Fagor local subroutine (%L NAME … M17) only runs when it's called
    if ((/^%L /.test(toks[0] || "") || (SYNTAX==="fagor8055" && toks.some(t => /^\(SUB ?\d+\)$/.test(t)))) && !entering){ let k = i+1; while (k < doc.length && !isReturn(doc[k])) k++; i = k+1; continue; }
    entering = false;
    if (isLapDef(toks)){ let k = i+1; while (k < doc.length && !doc[k].some(t => isCode(t,"G80"))) k++; i = k+1; continue; }
    // Fagor 8055: an N after the first word runs the line that many times (N0: the move without the active cycle)
    const rep = SYNTAX==="fagor8055" ? toks.find((t, k) => refN(toks, k) && /^N\d+$/.test(t)) : null, reps = rep ? parseInt(rep.slice(1), 10) : 1;
    const s0 = segs.length, dips = []; turns = 0; engZ = null;
    noCyc = reps===0; for (let r = 0; r < Math.max(1, Math.min(reps, 999)); r++) step(toks, li, false, dips); noCyc = false;
    const stop = toks.some(t => isCode(t, "M00")) ? "M00" : toks.some(t => isCode(t, "M01")) ? "M01" : null;
    const kind = segs.length > s0 ? (engZ!=null ? "engrave" : segs.slice(s0).some(sg => sg.kind==="cyc") ? "cyc" : segs[segs.length-1].kind) : null;
    const tc = lathe ? tailCode(toks) : null; if (tc) tail = tc;
    steps.push({ li, v: lathe ? p.x/2 : p.z, s0, s1: segs.length, kind, stop, dips, turns, ...(engZ!=null ? { engZ } : {}), calls: stack.map(r => r - 1), tail, ...timelineValues(li, toks), ...(F!=null && lineState[li]?.F && !/^F[-+]?[\d.]+$/.test(lineState[li].F) ? { f:F } : {}) });
    if (alarm){ steps[steps.length-1].alarm = alarm.text; alarm.k = steps.length - 1; break; }   // the machine stops here
    if (isEnd(toks)) break;
    const j = jumpFrom(toks, i); if (j!=null){ i = j; continue; }
    if (isReturn(toks) && stack.length){ i = stack.pop(); continue; }
    const tgt = callTarget(toks);
    if (tgt!=null && L[tgt]!==undefined && stack.length < 8){ stack.push(i+1); i = L[tgt]; entering = true; continue; }
    i++;
  }
  if (wrap) wraps.push({ ...wrap, s1: segs.length });
  if (rotNote) rotNote.until = steps.length;
  return { segs, steps, vals, ghosts, boxes, wraps, alarm, notes, vars: VUSE, tailUsed: steps.some(s => s.tail) };
  // Okuma names become their values ("[3]"); a V name that was never set reads as 0, another name can't be worked out.
  function calc(src){
    noteRead(src);
    src = src.replace(/[A-Z][A-Z0-9]*/g, m => m in NV ? (NV[m]==null ? "#0" : "[" + NV[m] + "]") : okL && /^V[A-Z]*\d+$/.test(m) ? "[0]" : m);
    try { const v = window.evalMacro?.(src, V); return typeof v==="number" && isFinite(v) ? v : null; } catch { return null; }
  }
  // "[cond] rest" → ["cond", "rest"], or [null] when the [ ] don't match
  function condOf(s){
    let d = 0; if (s[0]!=="[") return [null];
    for (let k = 0; k < s.length; k++){ if (s[k]==="[") d++; if (s[k]==="]" && --d===0) return [s.slice(1, k), s.slice(k+1).trim()]; }
    return [null];
  }
  // Where a line jumps to: GOTO N90 (Okuma), IF [..] N440 (Okuma), GOTO 100 and IF [..] GOTO 100 (Fanuc), WHILE/END loops.
  function jumpFrom(toks, i){
    const to = n => L[labelKey(n)] ?? null, toNum = e => { const v = calc(e); return v==null ? null : to("N" + Math.round(v)); };
    for (let k = 0; k < toks.length; k++){
      const t = toks[k];
      // Fagor: $GOTO N10 or $GOTO [NAME], and $IF [cond] $GOTO N40 (== != >= <= > < compare, * is AND, + is OR)
      const fg = /^(?:\$IF (.+?) )?\$GOTO (N\d+|\[\w+\])$/.exec(t);
      if (fg){
        if (fg[1]!=null){ const v = calc(fg[1].replace(/==/g, " EQ ").replace(/!=/g, " NE ").replace(/>=/g, " GE ").replace(/<=/g, " LE ").replace(/>/g, " GT ").replace(/</g, " LT ").replace(/\]\s*\*\s*\[/g, "] AND [").replace(/\]\s*\+\s*\[/g, "] OR [")); if (!v) return null; }
        return to(fg[2]);
      }
      // Fagor 8055: (GOTO N10) and (IF (P1 EQ 2) GOTO N40); ( ) become [ ] for the condition
      const f5 = /^\((?:IF (.+?) )?GOTO (N\d+)\)$/.exec(t);
      if (f5){
        if (f5[1]!=null){ const v = calc(f5[1].replace(/\(/g, "[").replace(/\)/g, "]")); if (!v) return null; }
        return to(f5[2]);
      }
      if (t==="GOTO" && /^N/.test(toks[k+1] || "")) return to(toks[k+1]);
      if (t.startsWith("GOTO ")) return toNum(t.slice(5));
      if (/^IF\s*\[/.test(t)){
        const [cond, rest] = condOf(t.slice(2).trim()); if (cond==null) return null;
        if (!calc(cond)) return null;
        if (/^N[A-Z0-9]+$/.test(rest)) return to(rest);
        const g = /^GOTO\s*(.+)$/.exec(rest); return g ? toNum(g[1]) : null;
      }
      const wh = /^WHILE\s*(\[.*\])\s*DO\s*(\d+)$/.exec(t);
      if (wh){
        const [cond] = condOf(wh[1]); if (cond==null) return null;
        if (calc(cond)) return null;
        for (let e = i+1; e < doc.length; e++) if (doc[e].includes("END" + wh[2])) return e+1;
        return null;
      }
      const en = /^END(\d+)$/.exec(t);
      if (en){ for (let b = i-1; b >= 0; b--) if (doc[b].some(x => new RegExp("^WHILE\\b.*DO\\s*" + en[1] + "$").test(x))) return b; return null; }
    }
    return null;
  }
  function step(toks, li, inLib, dips){
    // A G65 call to a library subprogram runs its lines, worked out with the values on the call.
    const lib = !inLib && window.libExpandCall?.(toks, li);
    if (lib){ lib.forEach(t => step(t, li, true, dips)); return; }
    const w = {};
    const tt = toks.find(t => /^T\d/.test(t));
    if (tt) pendingT = lathe ? "T" + parseInt(tt.slice(1, 3)) : "T" + parseInt(tt.slice(1));
    if (lathe && tt) tool = pendingT;
    if (toks.some(t => isCode(t,"M06"))) tool = pendingT;
    let skip = false, unknown = false, shift = false;
    toks.forEach((t, idx) => {
      if (isComment(t) || skip) return;
      if (t[0]==="#"){ const m = /^#(\d+)=(.+)$/.exec(t); if (m){ const v = calc(m[2]); V[+m[1]] = v; if (+m[1] > 0 && +m[1] < 1000) noteSet("#" + m[1], v); } return; }
      const nm = /^([A-Z][A-Z0-9]+)=(.+)$/.exec(t); if (nm){ const v = calc(nm[2]); NV[nm[1]] = v; if (okVars) noteSet(nm[1], v); return; }
      // Fagor 8055: (P1 = 2, P2 = P1*3) sets each parameter in turn
      if (SYNTAX==="fagor8055" && t[0]==="("){
        const inner = t.slice(1, -1); let d = 0, from = 0; const parts = [];
        for (let k = 0; k <= inner.length; k++){ const ch = inner[k]; if (ch==="(") d++; else if (ch===")") d--; else if ((ch==="," && !d) || k===inner.length){ parts.push(inner.slice(from, k)); from = k+1; } }
        for (const a of parts){ const m = /^\s*(P\d+)\s*=(.+)$/.exec(a); if (m) NV[m[1]] = calc(m[2].replace(/\(/g, "[").replace(/\)/g, "]")); }
        return;
      }
      if (isMacroTok(t)) return;
      const k = t[0];
      let v = parseFloat(t.slice(1));
      // X1 with no decimal point is the smallest increment (0.0001 in) on Fanuc-style controls, as the gloss row shows
      const nums = DIALECT.numbers;
      if (nums?.noDecimal==="leastIncrement" && nums.words.includes(k) && /^[-+]?\d+$/.test(t.slice(1)) && !(k==="Q" && lineState[li]?.cycleCode && DIALECT.cycles?.[lineState[li].cycleCode]?.labels?.includes("Q")))
        v *= nums.increment[lineState[li]?.units || "inch"];
      if (isVarVal(t)){
        v = calc(t.slice(1).replace(/^=/, ""));
        if (!inLib){ const key = li + ":" + idx, list = (vals[key] ||= []); if (!list.some(x => x===v || (x!=null && v!=null && near(x, v)))) list.push(v); }
        if (v==null){ if ("XYZUWIJKR".includes(k)) unknown = true; return; }
      }
      if (k==="G"){ if ([0,1,2,3].includes(v)){ mode = v; cyc = null; } if ((DIALECT.modalGroups?.distance || []).includes(pad2(t))) dist = isIncCode(pad2(t)) ? "inc" : "abs"; if (!lathe && (v===98 || v===99)) ret = "G"+v;
        if (v===80) cyc = null;
        if (v===40) comp = null; if (v===41) comp = "L"; if (v===42) comp = "R";
        if ((!lathe || latheDrill(pad2(t))) && DIALECT.cycles?.[pad2(t)]){ if (cyc==null){ cycZ = p.z; cycR = cycD = cycQ = null; } cyc = pad2(t); }
        if (lathe && pad2(t)===coordSetCode()){ shift = true; return; }   // a spindle clamp (G50 S, or G92 S in systems B and C), or with X/Z a zero shift
        if (v===28||v===53||v===50||v===4||(v===65 && !DIALECT.codeWords?.G65)){ skip = true; return; } }
      else if (k==="M" && (v===97 || v===98)) skip = true;
      else if (!isNaN(v)) w[k] = v;
    });
    if ("F" in w && !lathe) F = w.F;
    if ("D" in w && toks.some(t => isCode(t,"G41") || isCode(t,"G42"))) compD = w.D;
    // A code for an option this machine doesn't have: the control alarms. Its words move the option (G152 W the
    // tailstock), never the tool, so with the option nothing moves either.
    const oc = Object.keys(DIALECT.optionCodes || {}).find(c => toks.some(t => isCode(t, c)));
    if (oc){
      const o = DIALECT.optionCodes[oc];
      if (!MACHINES[machineId]?.[o.option]) alarm = { li, code:oc, text:o.text, label:o.label, at:xfPt({...p}) };
      return;
    }
    if (skip || unknown) return;
    const inc = dist==="inc";
    if (shift){   // G50 X Z: the tool's position becomes X Z. With G91 (or U W), the zero moves by the amounts.
      for (const [a, A, I] of [["x","X","U"], ["z","Z","W"]]){ if (A in w) off[a] = inc ? off[a] - w[A] : p[a] - w[A]; if (I in w) off[a] -= w[I]; }
      return;
    }
    const T = tool || "T?", has = c => toks.some(t => isCode(t, c));
    if (!lathe){
      const M = DIALECT.mirror, R = DIALECT.rotate, C = DIALECT.cylMap, gs = o => Object.keys(o || {}).find(c => /^G\d/.test(c) && has(c));
      if (M?.on && has(M.on)){ for (const a of ["x", "y"]) if (a.toUpperCase() in w) mir[a] = M.about==="value" ? w[a.toUpperCase()] : 0; return; }
      if (M?.off && has(M.off)){ const ax = ["x", "y"].filter(a => a.toUpperCase() in w); (ax.length ? ax : ["x", "y"]).forEach(a => mir[a] = null); return; }
      if (R?.on && has(R.on)){
        const [ca, cb] = R.center || ["X", "Y"], an = R.angle || "R";
        rot = { cx: ca in w ? w[ca] : p.x, cy: cb in w ? w[cb] : p.y, a: (w[an] || 0)*Math.PI/180 };
        if (rotNote) rotNote.until = steps.length;
        rotNote = null;
        if (!(an in w)){ rotNote = { li, k:steps.length, until:null, short:`${R.on}: no ${an}, not turned`, text:`${R.on} has no ${an}: the angle isn't in the program${DIALECT.rotate?.setting ? ` (it comes from ${DIALECT.rotate.setting})` : ""}, so the toolpath isn't turned` }; notes.push(rotNote); }
        return;
      }
      if (R?.off && has(R.off)){ rot = null; if (rotNote){ rotNote.until = steps.length + 1; rotNote = null; } }
      if (C?.code && has(C.code)){   // G107 with words turns the mapping on; G107 alone turns it off. Nothing moves.
        if (wrap){ wraps.push({ ...wrap, s1: segs.length }); wrap = null; }
        if (Object.keys(w).some(k => k!=="F")) wrap = { li, s0: segs.length, d: Math.abs(w[C.diameter || "Q"] ?? 0) };
        return;
      }
      const bp = gs(DIALECT.boltPatterns);
      if (bp){ bolt(DIALECT.boltPatterns[bp], w, dist==="inc", li, T, dips); return; }
      const cp = gs(DIALECT.circlePockets);
      if (cp){ circPocket(DIALECT.circlePockets[cp]==="cw", w, dist==="inc", li, T); return; }
    }
    if (!lathe && DIALECT.engrave && has(DIALECT.engrave.code)){ engrave(w, toks, li, T, inc); return; }
    if (okL && (has("G85") || has("G87"))){ lap(has("G87"), toks.find((t, k) => k > 0 && /^N[A-Z]/.test(t)), w, li, T); return; }
    // Fagor 8055: a pattern machines the active cycle at more points, G66 runs a pocket from its profile, G79 changes the cycle's words
    const cwc = !lathe && toks.map(t => /^G\d/.test(t) ? pad2(t) : null).find(k => k && DIALECT.codeWords?.[k]);
    if (cwc){ if (DIALECT.codeWords[cwc].needsCycle) pattern(cwc, w, toks, li, T, dips); else if (cwc==="G66") pocket(w, li, T, dips); return; }
    if (has("G79") && (DIALECT.noMoveCodes || []).includes("G79")){ if (cyc) cycWords(w, {...p}); return; }
    // Fagor 8055 lathe cycles: each runs where it's written, from its start point X Z, and ends back at the call point
    const flc = lathe && (SYNTAX==="fagor8055" || SYNTAX==="fagor8060") && toks.map(t => /^G\d/.test(t) ? pad2(t) : null).find(k => k && DIALECT.cycles?.[k]);
    if (flc){ fagorLathe(flc, w, li, T, dips); return; }
    if (!("X" in w || "Y" in w || "Z" in w || "U" in w || "W" in w)) return;
    const n = { x: "U" in w ? p.x + w.U : ("X" in w ? (inc ? p.x + w.X : w.X + off.x) : p.x),
                y: "Y" in w ? (inc ? p.y + w.Y : w.Y) : p.y,
                z: "W" in w ? p.z + w.W : ("Z" in w ? (inc ? p.z + w.Z : w.Z + off.z) : p.z) };
    if (okL && has("G74")){ groove(n, w, li, T); return; }
    if (okL && has("G73")){ grooveX(n, w, li, T); return; }
    if (okL && (has("G77") || has("G78"))){ tapZ(n, w, li, T); return; }
    if (okL && has("G71") && "H" in w){ threadPasses(n, okumaThreadDepths(w, toks), 2*(w.I || 0), li, T, okumaThreadFlank(w, toks)); return; }
    if (lathe && !SYNTAX && has("G76") && DIALECT.cycles?.G76?.requires?.includes("K") && "K" in w){ threadPasses(n, haasThreadDepths(w), 2*(w.I || 0), li, T, null); return; }
    if (cyc && !noCyc){
      cycWords(w, n);
      if (w.L===0){   // stored for the holes that follow, nothing drilled here; the tool goes over to X Y (a bolt circle's center)
        if (!lathe && Math.hypot(n.x - p.x, n.y - p.y) > 1e-9){ const b = { x:n.x, y:n.y, z:p.z }; segs.push({ a:{...p}, b, rapid:true, kind:"rapid", li, tool:T }); p = b; }
        return;
      }
      hole(n, li, T, dips); return;
    }
    const kind = (inLib ? null : lathe ? lineKind(li) : null) || (mode===0 ? "rapid" : (mode===2 || mode===3) ? "arc" : "feed");
    if (!lathe && (mode===2 || mode===3)){
      let cx = p.x + (w.I||0), cy = p.y + (w.J||0);
      if (!("I" in w) && !("J" in w) && w.R){   // by radius: the center is R from both ends (minus R: the longer way round)
        const dx = n.x - p.x, dy = n.y - p.y, ch = Math.hypot(dx, dy), d = Math.sqrt(Math.max(0, w.R*w.R - ch*ch/4)), s = (mode===2 ? -1 : 1)*(w.R < 0 ? -1 : 1);
        if (ch > 1e-9){ cx = (p.x + n.x)/2 - s*d*dy/ch; cy = (p.y + n.y)/2 + s*d*dx/ch; }
      }
      const rr = Math.hypot(p.x-cx, p.y-cy);
      const a0 = Math.atan2(p.y-cy, p.x-cx), a1 = Math.atan2(n.y-cy, n.x-cx);
      let sw = a1 - a0; if (mode===3){ if (sw <= 0) sw += 2*Math.PI; } else { if (sw >= 0) sw -= 2*Math.PI; }
      turns += Math.abs(sw)/(2*Math.PI);
      let q = {...p};
      const ns = arcSteps(sw, 36);
      for (let s = 1; s <= ns; s++){ const a = a0 + sw*s/ns; const nn = {x:cx+rr*Math.cos(a), y:cy+rr*Math.sin(a), z:p.z+(n.z-p.z)*s/ns}; segs.push({a:q, b:nn, rapid:false, kind:"arc", li, tool:T}); q = nn; }
    } else if (lathe && (mode===2 || mode===3)){ let q = p; for (const pt of arcPts(p, n, w, mode)){ segs.push({a:{...q}, b:pt, rapid:false, kind, li, tool:T}); q = pt; } }
    else {
      const sg = {a:{...p}, b:n, rapid: mode===0, kind, li, tool:T};
      if (corner && mode===1 && corner.seg===segs.length-1) cornerTo(sg);
      corner = null;
      segs.push(sg);
      const cw = mode===1 && toks.find(t => /^,[CR][-+]?[\d.]/.test(t)), size = cw ? parseFloat(cw.slice(2)) : 0;
      if (size > 0) corner = { seg: segs.length-1, round: cw[1]==="R", size, li };
    }
    p = n;
  }
  // Joins the move waiting for its corner (segs[corner.seg]) to the move sg: each is cut short of the sharp corner,
  // by the chamfer size or by where the radius touches it, and the chamfer line or the radius goes between.
  // Worked out with X as a radius on a lathe, so a ,C0.05 is 0.05 along each side.
  function cornerTo(sg){
    const A = segs[corner.seg], k = lathe ? 0.5 : 1;
    const sub = (a, b) => ({ x:(a.x-b.x)*k, y:a.y-b.y, z:a.z-b.z }), len = v => Math.hypot(v.x, v.y, v.z);
    const d1 = sub(A.b, A.a), d2 = sub(sg.b, sg.a), l1 = len(d1), l2 = len(d2);
    if (l1 < 1e-9 || l2 < 1e-9) return;
    const u1 = { x:d1.x/l1, y:d1.y/l1, z:d1.z/l1 }, u2 = { x:d2.x/l2, y:d2.y/l2, z:d2.z/l2 };
    const cos = Math.max(-1, Math.min(1, u1.x*u2.x + u1.y*u2.y + u1.z*u2.z)), turn = Math.acos(cos);
    if (turn < 1e-6 || turn > Math.PI - 1e-6) return;   // a straight line on, or straight back: no corner to cut
    const cut = corner.round ? corner.size * Math.tan(turn/2) : corner.size;
    if (cut > l1 + 1e-9 || cut > l2 + 1e-9) return;   // bigger than the moves: the control alarms; drawn sharp
    const P = A.b, at = (u, t) => ({ x:P.x + u.x*t/k, y:P.y + u.y*t, z:P.z + u.z*t });
    const q1 = at(u1, -cut), q2 = at(u2, cut);
    ghosts.push({ a:q1, b:{...P}, li:A.li }, { a:{...P}, b:q2, li:sg.li });
    A.b = q1; sg.a = q2;
    if (!corner.round){ segs.push({ a:{...q1}, b:{...q2}, rapid:false, kind:A.kind, li:A.li, tool:A.tool }); return; }
    // The radius: its center is the radius away from q1, square to the first move, toward the second
    const pn = { x:u2.x - cos*u1.x, y:u2.y - cos*u1.y, z:u2.z - cos*u1.z }, pl = len(pn), r = corner.size;
    const nv = { x:pn.x/pl, y:pn.y/pl, z:pn.z/pl };
    const v0 = { x:-nv.x*r, y:-nv.y*r, z:-nv.z*r }, c = { x:q1.x*k - v0.x, y:q1.y - v0.y, z:q1.z - v0.z };
    const v1 = { x:q2.x*k - c.x, y:q2.y - c.y, z:q2.z - c.z }, sn = Math.sin(turn), N = Math.max(4, Math.ceil(turn/(Math.PI/36)));
    let q = {...q1};
    for (let s = 1; s <= N; s++){
      const t = s/N, f0 = Math.sin((1-t)*turn)/sn, f1 = Math.sin(t*turn)/sn;
      const b = s===N ? {...q2} : { x:(c.x + v0.x*f0 + v1.x*f1)/k, y:c.y + v0.y*f0 + v1.y*f1, z:c.z + v0.z*f0 + v1.z*f1 };
      segs.push({ a:q, b, rapid:false, kind:A.kind, li:A.li, tool:A.tool }); q = b;
    }
  }
  // Haas G47 text engraving. The text is the line's comment (P0 as written, P1 a serial number with a # for each digit),
  // charHeight × J tall (J is the text size: a J.12 text is .15 high), starting at X Y (the bottom left of the text) and turned I degrees about it. The letters aren't drawn, and
  // their widths aren't given anywhere (they vary), so the text is one grey rectangle J tall, open on the right: an
  // estimate of DIALECT.engrave's charWidth × J per character. When the next line is a G47 that carries on along the
  // same baseline (same J and I) and engraves a serial number (P1), the rectangle ends where the serial starts
  // ("SER NO." then the number). That's where the text must have ended by, not a measured width.
  // The tool goes over at its height, down to R, feeds (E) to Z at the start, then sweeps along the rectangle: those
  // moves (sweep: the rectangle's height and direction) are drawn as a line across the text, not a path. Then up to R.
  // R and Z are heights, as written.
  function engrave(w, toks, li, T, inc){
    const E = DIALECT.engrave, cm = toks.find((t, k) => k > 0 && t[0]==="(");
    const text = cm ? cm.slice(1).replace(/\)$/, "") : "", h = w.J*(DIALECT.engrave.charHeight ?? 1);
    const x0 = "X" in w ? (inc ? p.x + w.X : w.X) : p.x, y0 = "Y" in w ? (inc ? p.y + w.Y : w.Y) : p.y;
    const r = "R" in w ? w.R : p.z, z = "Z" in w ? w.Z : r;
    const go = (b, rapid, kind, extra) => { if (Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z) < 1e-9) return; segs.push({ a:{...p}, b, rapid, kind, li, tool:T, ...extra }); p = b; };
    if (!(w.J > 0) || !text.trim()){ go({ x:x0, y:y0, z:p.z }, true, "rapid"); return; }
    const an = (w.I || 0)*Math.PI/180, c = Math.cos(an), sn = Math.sin(an);
    const at = (u, v, zz) => ({ x:x0 + u*c - v*sn, y:y0 + u*sn + v*c, z:zz });
    let len = (E.charWidth ?? 1)*w.J*[...text].length, exact = false;
    const nx = inc ? null : nextEngrave(li);
    if (nx && nx.P===1 && Math.abs(nx.J - w.J) < 1e-6 && Math.abs((nx.I || 0) - (w.I || 0)) < 1e-6){
      const dx = (nx.X ?? x0) - x0, dy = (nx.Y ?? y0) - y0, u = dx*c + dy*sn, v = -dx*sn + dy*c;
      if (u > 1e-6 && Math.abs(v) < 1e-4){ len = u; exact = true; }
    }
    go({ x:x0, y:y0, z:p.z }, true, "rapid");
    if (p.z > r) go({ x:x0, y:y0, z:r }, true, "rapid");
    const s0 = segs.length, sweep = { h, ux:-sn, uy:c };
    go(at(0, 0, z), false, "engrave", { sweep });
    const n = Math.max(4, Math.min(60, [...text].length * 2));
    for (let k = 1; k <= n; k++) go(at(len*k/n, 0, z), false, "engrave", { sweep });
    boxes.push({ li, text, exact, s0, s1: segs.length, pts: [[0, 0], [len, 0], [len, h], [0, h]].map(([u, v]) => xfPt(at(u, v, z))) });
    go(at(len, 0, r), true, "rapid");
    engZ = z;
  }
  // The next line's G47 words (X Y J I P), when the next line with words is a G47 with plain numbers for them.
  function nextEngrave(li){
    for (let k = li + 1; k < doc.length; k++){
      const t = doc[k].filter(x => !isComment(x) && !/^N\d+$/.test(x) && x!=="/");
      if (!t.length) continue;
      if (!t.some(x => isCode(x, DIALECT.engrave.code))) return null;
      const o = {};
      for (const x of t){ const m = /^([XYJIP])([-+]?(?:\d+\.?\d*|\.\d+))$/.exec(x); if (m) o[m[1]] = parseFloat(m[2]); else if (/^[XYJIP]/.test(x)) return null; }
      return o.J > 0 ? o : null;
    }
    return null;
  }
  // A canned cycle's words on this line: where the hole starts (R) and ends (Z)
  function cycWords(w, n){
    if (DIALECT.cycleRefZ){   // Fagor: Z is the reference plane and I the depth (G83: I is each peck, J of them)
      if ("Z" in w) cycR = w.Z;
      if ("I" in w) cycD = cyc==="G83" && "J" in w ? (cycR ?? p.z) + w.I * w.J : w.I;
      if (cyc==="G83" && "I" in w && "J" in w) cycQ = Math.abs(w.I);
      n.z = p.z;
    } else {
      if ("R" in w) cycR = w.R;
      if ("Z" in w) cycD = n.z;
      if ("Q" in w) cycQ = Math.abs(w.Q);
    }
  }
  // A hole: over to X Y at the current height (rapid, or along via), rapid down to R, feed to the bottom, back up to R or the start.
  function hole(n, li, T, dips, via){
    const r = cycR ?? 0.1, z = cycD ?? n.z, back = ret==="G99" ? r : Math.max(cycZ ?? r, r);
    if (via){ let q = {...p}; for (const v of via){ const b = { x:v.x, y:v.y, z:p.z }; segs.push({a:q, b, rapid:false, kind:"feed", li, tool:T}); q = b; } }
    else segs.push({a:{...p}, b:{x:n.x, y:n.y, z:p.z}, rapid:true, kind:"rapid", li, tool:T});
    if (p.z > r) segs.push({a:{x:n.x, y:n.y, z:p.z}, b:{x:n.x, y:n.y, z:r}, rapid:true, kind:"rapid", li, tool:T});
    segs.push({a:{x:n.x, y:n.y, z:r}, b:{x:n.x, y:n.y, z}, rapid:false, kind:"cyc", li, tool:T, hole:true});
    segs.push({a:{x:n.x, y:n.y, z}, b:{x:n.x, y:n.y, z:back}, rapid:true, kind:"rapid", li, tool:T});
    const pr = DIALECT.peckRetract?.[cyc];
    dips.push({ top: Math.max(p.z, r), r, z, back, cyc, q:cycQ, ...(pr ? { ret: pr[lineState[li]?.units==="mm" ? "mm" : "inch"] } : {}) });
    p = {x:n.x, y:n.y, z:back};
  }
  // Haas bolt hole patterns, each hole drilled with the active canned cycle (or just visited without one), about the
  // current position or X Y on the line: G70 a circle (I radius, minus for clockwise; J start angle; L holes), G71 an arc
  // (K the angle between holes), G72 a line (I apart, at angle J, starting I from the start position).
  function bolt(kind, w, inc, li, T, dips){
    const c = { x: "X" in w ? (inc ? p.x + w.X : w.X) : p.x, y: "Y" in w ? (inc ? p.y + w.Y : w.Y) : p.y };
    const n = Math.max(0, Math.min(1000, Math.round(w.L ?? 1))), R = Math.PI/180, I = w.I || 0, J = w.J || 0, pts = [];
    if (kind==="line") for (let k = 1; k <= n; k++) pts.push({ x:c.x + k*I*Math.cos(J*R), y:c.y + k*I*Math.sin(J*R) });
    else {
      const st = kind==="circle" ? Math.sign(I || 1)*360/(n || 1) : (w.K || 0);
      for (let k = 0; k < n; k++){ const a = (J + k*st)*R; pts.push({ x:c.x + Math.abs(I)*Math.cos(a), y:c.y + Math.abs(I)*Math.sin(a) }); }
    }
    for (const q of pts){
      if (cyc && !noCyc) hole({ x:q.x, y:q.y, z:p.z }, li, T, dips);
      else { const b = { x:q.x, y:q.y, z:p.z }; segs.push({ a:{...p}, b, rapid:true, kind:"rapid", li, tool:T }); p = b; }
    }
  }
  // Haas G12 (clockwise) / G13 (counterclockwise) circular pocket about the current position: down to Z, then a full circle
  // at each radius from I out to K in steps of Q, L times (G91: Z deeper each time), and back to the center. The circles
  // are the pocket's edge; the tool's centre runs inside them (the G42 side for G12, G41 for G13) unless D is D0.
  function circPocket(cw, w, inc, li, T){
    const c = { x: "X" in w ? (inc ? p.x + w.X : w.X) : p.x, y: "Y" in w ? (inc ? p.y + w.Y : w.Y) : p.y };
    const I = Math.abs(w.I || 0), K = "K" in w ? Math.abs(w.K) : null, Q = Math.abs(w.Q || 0), rs = [];
    if (K!=null && Q > 0){ for (let r = I || Q; r < K - 1e-9 && rs.length < 200; r += Q) rs.push(r); rs.push(K); } else rs.push(K ?? I);
    const loops = Math.max(1, Math.min(50, Math.round(w.L || 1))), save = { comp, compD };
    if ("D" in w) compD = w.D;
    const go = (b, kind, rapid) => { segs.push({ a:{...p}, b, rapid:!!rapid, kind, li, tool:T }); p = b; };
    if (Math.hypot(p.x - c.x, p.y - c.y) > 1e-9) go({ x:c.x, y:c.y, z:p.z }, "rapid", true);
    let z = p.z;
    for (let l = 0; l < loops; l++){
      if ("Z" in w) z = inc ? z + w.Z : w.Z;
      comp = null; go({ x:c.x, y:c.y, z }, "feed");
      for (const r of rs.filter(r => r > 0)){
        comp = null; go({ x:c.x + r, y:c.y, z }, "feed");
        comp = cw ? "R" : "L";
        for (let s = 1; s <= 48; s++){ const a = (cw ? -1 : 1)*2*Math.PI*s/48; go({ x:c.x + r*Math.cos(a), y:c.y + r*Math.sin(a), z }, "arc"); }
        turns += 1;
      }
      comp = null; go({ x:c.x, y:c.y, z }, "feed");
    }
    comp = save.comp; compD = save.compD;
  }
  // Fagor 8055 multiple machining (G60-G65): the points after point 0 (where the tool is, already machined by the cycle line),
  // less the ones P to V skip (P5, or P10.013 for points 10 to 13), each machined with the active cycle.
  function pattern(code, w, toks, li, T, dips){
    const R = Math.PI/180, P0 = {...p}, pts = [];
    const side = (len, step, cnt) => step!=null && cnt!=null ? [step, Math.round(cnt)] : len!=null && step ? [Math.sign(len || 1)*Math.abs(step), Math.floor(Math.abs(len/step) + 1e-9) + 1] : len!=null && cnt > 1 ? [len/(cnt - 1), Math.round(cnt)] : [0, 1];
    let around = null;   // circle patterns: the center, radius and each point's angle
    if (code==="G60"){ const [d, n] = side(w.X, w.I, w.K), a = (w.A || 0)*R; for (let k = 1; k < n && k < 1000; k++) pts.push({ x:P0.x + k*d*Math.cos(a), y:P0.y + k*d*Math.sin(a) }); }
    else if (code==="G61" || code==="G62"){
      const [d1, n1] = side(w.X, w.I, w.K), [d2, n2] = side(w.Y, w.J, w.D), a = (w.A || 0)*R, b = a + (w.B ?? 90)*R;
      const at = (i, j) => ({ x:P0.x + i*d1*Math.cos(a) + j*d2*Math.cos(b), y:P0.y + i*d1*Math.sin(a) + j*d2*Math.sin(b), key:i + "," + j });
      const ij = [];
      if (code==="G62") for (let j = 0; j < n2 && j < 1000; j++) for (let q = 0; q < n1 && q < 1000; q++) ij.push(at(j%2 ? n1 - 1 - q : q, j));   // rows, back and forth
      else { for (let i = 0; i < n1; i++) ij.push(at(i, 0)); for (let j = 1; j < n2; j++) ij.push(at(n1 - 1, j)); for (let i = n1 - 2; i >= 0; i--) ij.push(at(i, n2 - 1)); for (let j = n2 - 2; j > 0; j--) ij.push(at(0, j)); }   // the sides, counterclockwise
      const seen = new Set(); ij.forEach(q => { if (!seen.has(q.key)){ seen.add(q.key); pts.push(q); } }); pts.shift();
    } else {
      const c = { x:P0.x + (w.X || 0), y:P0.y + (w.Y || 0) }, r = Math.hypot(P0.x - c.x, P0.y - c.y), a0 = Math.atan2(P0.y - c.y, P0.x - c.x), as = [];
      if (code==="G63"){ const st = w.I!=null ? w.I : 360/(w.K || 1), n = w.I!=null ? Math.floor(360/Math.abs(w.I || 360) + 1e-9) : Math.round(w.K || 1); for (let k = 1; k < n && k < 1000; k++) as.push(a0 + k*st*R); }
      if (code==="G64"){ const B = w.B || 0, st = w.I!=null ? Math.sign(B || 1)*Math.abs(w.I) : w.K > 1 ? B/(w.K - 1) : 0, n = w.I!=null ? (w.I ? Math.floor(Math.abs(B/w.I) + 1e-9) + 1 : 1) : Math.round(w.K || 1); for (let k = 1; k < n && k < 1000; k++) as.push(a0 + k*st*R); }
      if (code==="G65") as.push(w.A!=null ? 2*w.A*R - a0 : a0 + Math.sign(w.I || 1)*2*Math.asin(Math.min(1, Math.abs(w.I || 0)/(2*r || 1))));
      as.forEach(an => pts.push({ x:c.x + r*Math.cos(an), y:c.y + r*Math.sin(an), an }));
      around = { c, r, a0 };
    }
    const skip = new Set();
    if (code!=="G65") toks.forEach(t => { const m = /^[P-V](\d+)(?:\.(\d{1,3}))?$/.exec(t); if (!m) return; const a = +m[1], b = m[2] ? +m[2].padEnd(3, "0") : a; for (let k = a; k <= Math.max(a, b) && k < 1000; k++) skip.add(k); });
    let an = around?.a0;
    pts.forEach((q, k) => {
      if (skip.has(k + 1)) return;
      let via = null;
      if (around && w.C===1) via = [q];
      if (around && (w.C===2 || w.C===3)){   // along the circle, clockwise (C2) or counterclockwise (C3)
        let sw = q.an - an; if (w.C===3){ while (sw <= 0) sw += 2*Math.PI; } else { while (sw >= 0) sw -= 2*Math.PI; }
        via = []; for (let s = 1; s <= 24; s++){ const t = an + sw*s/24; via.push({ x:around.c.x + around.r*Math.cos(t), y:around.c.y + around.r*Math.sin(t) }); }
      }
      if (around) an = q.an;
      if (cyc && !noCyc) hole({ x:q.x, y:q.y, z:p.z }, li, T, dips, via);
      else { const b = { x:q.x, y:q.y, z:p.z }; segs.push({a:{...p}, b, rapid:!via, kind: via ? "feed" : "rapid", li, tool:T}); p = b; }
    });
  }
  // Fagor 8055 G66 irregular pocket: the profile (the lines from label S to label E) is traced as the outline, then back to the start.
  function pocket(w, li, T, dips){
    const kS = L[labelKey("N" + w.S)], kE = L[labelKey("N" + w.E)];
    if (w.S==null || w.E==null || kS===undefined || kE===undefined || kE < kS) return;
    const save = { p:{...p}, mode, cyc, dist }; cyc = null;
    for (let k = kS; k <= kE; k++) step(doc[k], k, true, dips);
    segs.push({a:{...p}, b:{...save.p}, rapid:true, kind:"rapid", li, tool:T});
    p = save.p; mode = save.mode; cyc = save.cyc; dist = save.dist;
  }
  // A Fagor 8055 or 8060/8065 lathe cycle, drawn simply: the roughing or grooving passes, the thread passes, the drilled hole, or the profile.
  // X is a diameter, as everywhere in the lathe view. Curved turning and facing (G84, G85) are drawn with straight passes.
  function fagorLathe(code, w, li, T, dips){
    code = { G160:"G60", G161:"G61", G162:"G62", G163:"G63" }[code] || code;   // the 8060/8065 live tool cycles
    const S0 = {...p}, A = { x: w.X ?? p.x, y:0, z: w.Z ?? p.z }, E = { x: w.Q ?? A.x, z: w.R ?? A.z };
    let at = S0;
    const go = (b, rapid) => { const nb = { x:b.x, y:0, z:b.z }; segs.push({ a:{...at}, b:nb, rapid, kind: rapid ? "rapid" : "cyc", li, tool:T }); at = nb; };
    const steps = (from, to, d) => { const out = []; d = Math.abs(d || 0); const dir = Math.sign(to - from); if (!dir) return [to]; if (d > 0) for (let v = from + dir*d; dir*(to - v) > 1e-9 && out.length < 500; v += dir*d) out.push(v); out.push(to); return out; };
    const back = 0.5*Math.sign(A.x - E.x || 1);
    go(A, true);
    if (["G81","G84"].includes(code)) for (const x of steps(A.x, E.x, 2*(w.C || 0))){ go({ x, z:A.z }, true); go({ x, z:E.z }, false); go({ x:x + back, z:E.z }, true); go({ x:x + back, z:A.z }, true); }
    else if (["G82","G85"].includes(code)){ const bz = 0.5*Math.sign(A.z - E.z || 1); for (const z of steps(A.z, E.z, w.C)){ go({ x:A.x, z }, true); go({ x:E.x, z }, false); go({ x:E.x, z:z + bz }, true); go({ x:A.x, z:z + bz }, true); } }
    else if (code==="G88") for (const z of [A.z, ...steps(A.z, E.z, w.C)]){ go({ x:A.x, z }, true); go({ x:E.x, z }, false); go({ x:A.x, z }, true); }
    else if (code==="G89") for (const x of [A.x, ...steps(A.x, E.x, 2*(w.C || 0))]){ go({ x, z:A.z }, true); go({ x, z:E.z }, false); go({ x, z:A.z }, true); }
    else if (code==="G83" || code==="G60"){ go({ x:A.x, z:A.z - Math.abs(w.I || 0) }, false); go(A, true); }
    else if (code==="G61"){ go({ x:A.x - 2*Math.abs(w.I || 0), z:A.z }, false); go(A, true); }
    else if (code==="G62"){ const x = A.x - 2*Math.abs(w.I || 0); go({ x, z:A.z }, false); go({ x, z:A.z - (w.L || 0) }, false); go({ x:A.x, z:A.z - (w.L || 0) }, true); }
    else if (code==="G63"){ const z = A.z - Math.abs(w.I || 0); go({ x:A.x, z }, false); go({ x:A.x - 2*(w.L || 0), z }, false); go({ x:A.x - 2*(w.L || 0), z:A.z }, true); }
    else if (code==="G86" || code==="G87"){
      const I = w.I || 0, B = Math.abs(w.B || 0) || Math.abs(I), n = Math.min(50, Math.max(1, Math.ceil(Math.abs(I)/B - 1e-9)));
      for (let k = 1; k <= n; k++){ const d = Math.min(Math.abs(I), k*B)*Math.sign(I);
        if (code==="G86"){ go({ x:A.x - 2*d, z:A.z }, true); go({ x:E.x - 2*d, z:E.z }, false); go({ x:E.x, z:E.z }, true); go(A, true); }
        else { go({ x:A.x, z:A.z - d }, true); go({ x:E.x, z:E.z - d }, false); go({ x:E.x, z:E.z }, true); go(A, true); } }
    } else if (["G66","G68","G69"].includes(code)){   // the finished profile, from the start point
      const kS = L[labelKey("N" + w.S)], kE = L[labelKey("N" + w.E)];
      if (w.S!=null && w.E!=null && kS!==undefined && kE!==undefined && kE >= kS){
        const save = { mode, dist }; p = {...A}; mode = 1;
        for (let k = kS; k <= kE; k++){ const s0 = segs.length; step(doc[k], k, true, dips); for (let q = s0; q < segs.length; q++) if (!segs[q].rapid) segs[q].kind = "cyc"; }
        at = {...p}; mode = save.mode; dist = save.dist;
      }
    }
    go(S0, true); p = S0;
  }
  // A lathe arc from a to b (X as a diameter), by its radius (R, or L on Okuma) or its center (I for X as a radius, K for Z).
  // Drawn with Z across and X up, where G02 goes clockwise.
  function arcPts(a, b, w, m){
    const A = { u:a.z, v:a.x/2 }, B = { u:b.z, v:b.x/2 }, r = w[DIALECT.arcRadius || "R"] ?? w.R;
    let C;
    if (r!=null){
      const du = B.u - A.u, dv = B.v - A.v, ch = Math.hypot(du, dv); if (ch < 1e-9) return [{...b}];
      const d = Math.sqrt(Math.max(0, r*r - ch*ch/4)), side = (m===2 ? 1 : -1) * (r < 0 ? -1 : 1);
      C = { u:(A.u + B.u)/2 + side*d*dv/ch, v:(A.v + B.v)/2 - side*d*du/ch };
    } else C = { u:A.u + (w.K || 0), v:A.v + (w.I || 0) };
    const rr = Math.hypot(A.u - C.u, A.v - C.v), a0 = Math.atan2(A.v - C.v, A.u - C.u), a1 = Math.atan2(B.v - C.v, B.u - C.u);
    let sw = a1 - a0; if (m===3){ if (sw <= 0) sw += 2*Math.PI; } else { if (sw >= 0) sw -= 2*Math.PI; }
    const ns = arcSteps(sw, 24), out = []; for (let s = 1; s < ns; s++){ const an = a0 + sw*s/ns; out.push({ x:2*(C.v + rr*Math.sin(an)), y:0, z:C.u + rr*Math.cos(an), arc:true }); }
    out.push({ ...b, arc:true }); return out;
  }
  // The points of a LAP contour (the lines from "NA1 G81" to G80), starting at the tool's position.
  function lapPath(name, S){
    const k0 = name!=null ? L[labelKey(name)] : undefined; if (k0===undefined) return null;
    const pts = [{...S}]; let q = {...S}, m = mode;
    for (let k = k0; k < doc.length; k++){
      const tk = doc[k]; if (k > k0 && tk.some(t => isCode(t,"G80"))) break;
      const w = {};
      for (const t of tk){
        if (isComment(t) || isMacroTok(t) || /^N/.test(t)) continue;
        const v = isVarVal(t) ? calc(t.slice(1).replace(/^=/, "")) : parseFloat(t.slice(1)); if (v==null || isNaN(v)) continue;
        if (t[0]==="G"){ if ([0,1,2,3].includes(v)) m = v; } else w[t[0]] = v;
      }
      if (!("X" in w || "Z" in w || "U" in w || "W" in w)) continue;
      const nq = { x: "U" in w ? q.x + w.U : "X" in w ? (dist==="inc" ? q.x + w.X : w.X + off.x) : q.x, y:0,
                   z: "W" in w ? q.z + w.W : "Z" in w ? (dist==="inc" ? q.z + w.Z : w.Z + off.z) : q.z };
      if (m===2 || m===3) pts.push(...arcPts(q, nq, w, m)); else pts.push({ ...nq, rapid: m===0 });
      q = nq;
    }
    return { pts, face: doc[k0].some(t => isCode(t,"G82")) };
  }
  // G85 (rough) and G87 (finish) on an Okuma lathe. Roughing cuts along Z (G81 contour) or X (G82) in steps of D
  // (X as a diameter), leaving U and W on the contour, then follows the contour once at that allowance.
  // Finishing follows the contour. Both end back at the start point.
  function lap(finish, name, w, li, T){
    const S = {...p}, path = lapPath(name, S); if (!path) return;
    let at = S;
    const go = (b, rapid, kind) => { segs.push({ a:{...at}, b:{...b, y:0}, rapid, kind: rapid ? "rapid" : kind || "feed", li, tool:T }); at = b; };
    const follow = C => { go(C[0], true); C.slice(1).forEach(c => go(c, !!c.rapid, c.arc ? "arc" : "feed")); };
    if (finish){ path.pts.slice(1).forEach(c => go(c, !!c.rapid, c.arc ? "arc" : "feed")); go(S, true); p = S; return; }
    const C = path.pts.slice(1).map(c => ({ ...c, x:c.x + (w.U || 0), z:c.z + (w.W || 0) })), D = Math.abs(w.D || 0);
    if (!C.length){ return; }
    const sa = path.face ? "z" : "x", ca = path.face ? "x" : "z", pt = (a, c) => path.face ? { x:c, y:0, z:a } : { x:a, y:0, z:c };
    const dir = Math.sign(C[0][sa] - S[sa]) || -1, cdir = Math.sign(C[C.length-1][ca] - S[ca]) || -1;
    const ext = dir < 0 ? Math.min(...C.map(c => c[sa])) : Math.max(...C.map(c => c[sa]));
    const back = lineState[li]?.units==="mm" ? 0.5 : 0.02;
    for (let k = 1; D > 0 && k < 500; k++){
      const a = S[sa] + dir*D*k; if (dir*(a - ext) >= -1e-9) break;
      // the cut ends where the contour (with the allowance) first reaches this level
      let end = C[C.length-1][ca], best = Infinity;
      for (let j = 0; j + 1 < C.length; j++){
        const s0 = C[j][sa] - a, s1 = C[j+1][sa] - a; if (s0*s1 > 0 || s0===s1) continue;
        const cv = C[j][ca] + (C[j+1][ca] - C[j][ca]) * s0/(s0 - s1), dd = cdir*(cv - S[ca]);
        if (dd >= -1e-9 && dd < best){ best = dd; end = cv; }
      }
      go(pt(a, S[ca]), true); go(pt(a, end), false); go(pt(a - dir*back, end - cdir*back), false); go(pt(a - dir*back, S[ca]), true);
    }
    go(S, true); follow([pt(C[0][sa], S[ca]), ...C]); go(S, true); p = S;
  }
  // G74 on an Okuma lathe: grooves (or a drilled hole) cut along Z to the depth on this line, one at the start X and then
  // one every I (a diameter) until the X on the line, each fed in and pulled back out; then back to the start point.
  function groove(n, w, li, T){
    const S = {...p}, I = Math.abs(w.I || 0), dx = Math.sign(n.x - S.x), xs = [];
    if (I > 0 && dx) for (let x = S.x; dx*(n.x - x) > 1e-9 && xs.length < 500; x += dx*I) xs.push(x);
    xs.push(n.x);
    let at = S; const go = (b, rapid, extra) => { segs.push({ a:{...at}, b:{...b}, rapid, kind: rapid ? "rapid" : "cyc", li, tool:T, ...extra }); at = b; };
    // at X0 it's a drilled hole: marked with a circle at the bottom
    for (const x of xs){ go({ x, y:0, z:S.z }, true); go({ x, y:0, z:n.z }, false, Math.abs(x) < 1e-6 ? { hole:true } : null); go({ x, y:0, z:S.z }, true); }
    go(S, true); p = S;
  }
  // G73 on an Okuma lathe: grooves cut along X to the X on this line, one at the start Z and then one every K
  // until the Z on the line, each fed in and pulled back out; then back to the start point. The pecks (D) aren't drawn.
  function grooveX(n, w, li, T){
    const S = {...p}, K = Math.abs(w.K || 0), dz = Math.sign(n.z - S.z), zs = [];
    if (K > 0 && dz) for (let z = S.z; dz*(n.z - z) > 1e-9 && zs.length < 500; z += dz*K) zs.push(z);
    zs.push(n.z);
    let at = S; const go = (b, rapid) => { segs.push({ a:{...at}, b:{...b}, rapid, kind: rapid ? "rapid" : "cyc", li, tool:T }); at = b; };
    for (const z of zs){ go({ x:S.x, y:0, z }, true); go({ x:n.x, y:0, z }, false); go({ x:S.x, y:0, z }, true); }
    go(S, true); p = S;
  }
  // G77 (G78 left hand) tapping on an Okuma lathe: X over to the X on the line, rapid K toward the hole, tap (feed) to Z,
  // feed back out with the spindle reversed, then rapid back to the start Z.
  function tapZ(n, w, li, T){
    const S = {...p}, dz = Math.sign(n.z - S.z) || -1, z1 = S.z + dz*Math.abs(w.K || 0);
    let at = S; const go = (b, rapid, extra) => { if (Math.hypot(b.x - at.x, b.z - at.z) < 1e-9) return; segs.push({ a:{...at}, b:{...b}, rapid, kind: rapid ? "rapid" : "cyc", li, tool:T, ...extra }); at = b; };
    go({ x:n.x, y:0, z:S.z }, true); go({ x:n.x, y:0, z:z1 }, true);
    go({ x:n.x, y:0, z:n.z }, false, { hole:true }); go({ x:n.x, y:0, z:z1 }, false); go({ x:n.x, y:0, z:S.z }, true);
    p = { x:n.x, y:0, z:S.z };
  }
  // Okuma G71 passes (OSP-U10L manual, section 16 4-3): each pass's depth from the top of the thread, as a diameter.
  // H thread height, D first cut, U finishing allowance (all diameters). M73 (pattern 1, the default here): D each pass
  // until within D of H - U, then what's left in halves (D/2, D/4, D/8, D/8), then U. M74: D each pass to H - U, then U.
  // M75: pass n at √n × D to H - U, then U (pattern 3; pattern 4 is a parameter, not drawn differently).
  function okumaThreadDepths(w, toks){
    const H = Math.abs(w.H), D = Math.abs(w.D || 0) || H, U = Math.abs(w.U || 0), end = Math.max(0, H - U), out = [];
    const m = c => toks.some(t => isCode(t, c));
    if (m("M74")){ for (let d = D; d < end - 1e-9 && out.length < 200; d += D) out.push(d); }
    else if (m("M75")){ for (let k = 1; k*k*D*D < end*end - 1e-12 && out.length < 200; k++) out.push(Math.sqrt(k)*D); }
    else {
      let d = D; for (; d <= end - D + 1e-9 && out.length < 200; d += D) out.push(d);
      const last = out.length ? out[out.length-1] : 0, r = end - last;
      if (r > 1e-9){ let at = last; for (const f of [0.5, 0.25, 0.125, 0.125]){ at += r*f; out.push(at); } }
    }
    if (!out.length || Math.abs(out[out.length-1] - end) > 1e-9) out.push(end);
    if (U > 0) out.push(H);
    return { H, depths: out };
  }
  // How each Okuma pass starts along Z with an infeed angle B: M32 down the left face (the default), M34 the right face,
  // M33 zigzag (alternate faces). B0 feeds straight in.
  function okumaThreadFlank(w, toks){
    const B = Math.abs(w.B || 0); if (!(B > 0)) return null;
    const t = Math.tan(B/2*Math.PI/180), m = c => toks.some(x => isCode(x, c));
    const side = m("M34") ? () => 1 : m("M33") ? k => (k % 2 ? 1 : -1) : () => -1;
    return (d, k) => side(k) * (d/2) * t;
  }
  // Haas one-line G76: K thread height and D first pass (radius). P3/P4 cut D each pass; P1/P2 (the default) keep the
  // amount cut the same, so pass n is at √n × D. Depths returned as diameters.
  function haasThreadDepths(w){
    const K = Math.abs(w.K), D = Math.abs(w.D || 0) || K, out = [], even = w.P===3 || w.P===4;
    for (let k = 1; out.length < 200; k++){ const d = even ? k*D : Math.sqrt(k)*D; if (d >= K - 1e-9) break; out.push(2*d); }
    out.push(2*K);
    return { H: 2*K, depths: out };
  }
  // A one-line threading cycle (Okuma G71, Haas G76), drawn pass by pass: from the start point, in to each pass's depth
  // (shifted along Z for an angled infeed), along the thread to the end Z, out, and back to the start. The last pass is
  // at the finished diameter X on the line; the first at the top of the thread, H (a diameter) toward the start point.
  // taper is the diameter at the start Z less the one at the end.
  function threadPasses(n, { H, depths }, taper, li, T, flank){
    const S = {...p}, dir = Math.sign(S.x - n.x) || 1, at = (x, z) => ({ x, y:0, z });
    const top0 = n.x + taper + dir*H, top1 = n.x + dir*H, zd = Math.sign(n.z - S.z) || -1;
    let q = S; const go = (b, rapid, kind) => { segs.push({ a:{...q}, b, rapid, kind: rapid ? "rapid" : kind || "cyc", li, tool:T }); q = b; };
    depths.forEach((d, k) => {
      const zs = S.z - zd*(flank ? flank(d, k) : 0);
      go(at(S.x, zs), true); go(at(top0 - dir*d, zs), true);
      go(at(top1 - dir*d, n.z), false); go(at(S.x, n.z), true);
    });
    go(S, true); p = S;
  }

}
// A lathe line's tailstock code: "in" (advance, quill forward or extend), "out" (retract or back), or null.
// Read from the dictionary's descriptions for this machine, so each control's own codes count.
// Heidenhain Klartext, as it runs: path functions (L, LP, C around CC, CR, CP, CT, APPR and DEP drawn to their end
// points), FMAX rapids, Q parameters (FN 0-8 and formulas), CYCL DEF with its Q parameter lines, CYCL CALL, CYCL CALL POS,
// CYCL CALL PAT with PATTERN DEF points, M99 and M89, cycle 7 datum shifts, CALL LBL subprograms (LBL 0 returns),
// CALL LBL n REP m repeats, FN 9-12 jumps, and TOOL CALL. FK free contours, RND and CHF corners and tilting are not drawn.
function interpretKlartext(){
  const segs = [], steps = [], L = labels(), stack = [], Q = {}, vals = {};
  let p = { x:0, y:0, z:0 }, cc = { x:0, y:0 }, tool = null, F = null, dir = null, cdef = null, inDef = false, m89 = false;
  const off = { x:0, y:0, z:0 }, reps = {}, pat = [];
  let i = 0, guard = 0;
  const qv = s => { const m = /^([-+]?)(Q[LRS]?\d+)$/.exec(s); if (m){ const v = Q[m[2]]; return v==null ? null : m[1]==="-" ? -v : v; } const v = parseFloat(s); return isNaN(v) ? null : v; };
  const calc = e => {
    let bad = false;
    const src = e.replace(/Q[LRS]?\d+/g, m => { const v = Q[m]; if (v==null){ bad = true; return "0"; } return "[" + v + "]"; }).replace(/\bDIV\b/g, "/").replace(/\(/g, "[").replace(/\)/g, "]");
    if (bad) return null;
    try { const v = window.evalMacro?.(src, {}); return typeof v==="number" && isFinite(v) ? v : null; } catch { return null; }
  };
  while (i < doc.length && guard++ < 20000){
    const li = i, toks = doc[i], all = toks.filter(t => !isComment(t)), h = klHeadOf(all);
    const s0 = segs.length, dips = [];
    const cont = inDef; inDef = false;
    const last = toks[toks.length-1] || "", goesOn = last==="~" || (last[0]===";" && /~\s*$/.test(last));
    let jump = null;
    for (const t of all){
      const k = klKey(t);
      const q = /^(Q[LRS]?\d+) ?= ?(.*)$/.exec(t);
      if (q){ const v = calc(q[2]); if (cont && cdef) cdef.q[q[1]] = v; else Q[q[1]] = v; continue; }
      const pt = /^(POS|ROW|PAT|FRAME|CIRC|PITCHCIRC)\d*\((.*)\)$/.exec(t);
      if (pt){ patPoints(pt[1], pt[2]); continue; }
      if (k==="PATTERN DEF") pat.length = 0;
      if (k==="TOOL CALL"){ const n = /^TOOL CALL (\d+|"[^"]*")/.exec(t); if (n) tool = "T" + n[1].replace(/"/g, ""); }
      if (k==="CYCL DEF"){
        const m = /^CYCL DEF (\d+)(?:\.(\d+))?/.exec(t), n = +m[1];
        if (n===7 && m[2]!=null){ const w = words(all); for (const a of ["x","y","z"]){ const A = a.toUpperCase(); if (A in w) off[a] = w[A]; } }
        else if (m[2]==null || m[2]==="0"){ cdef = { n, q:{} }; m89 = false; }
      }
      const fn = /^FN (\d+): (Q[LRS]?\d+) ?= ?(.+)$/.exec(t);
      if (fn && +fn[1] <= 8){
        const n = +fn[1], e = fn[3], wrap = { 5:"SQRT", 6:"SIN", 7:"COS" }[n];
        let v = null;
        if (n===8){ const [a, b] = e.split(/ ?LEN ?/).map(calc); v = a!=null && b!=null ? Math.hypot(a, b) : null; }   // FN 8: Q1 = +3 LEN +4
        else v = calc(wrap ? wrap + "[" + e.replace(/^(?:SQRT|SIN|COS) ?/, "") + "]" : e);
        Q[fn[2]] = v; continue;
      }
      const jf = /^FN (9|10|11|12): IF (\S+) (?:EQU|NE|GT|LT) (\S+) GOTO LBL ("[^"]*"|\d+)$/.exec(t);
      if (jf){
        const a = qv(jf[2]), b = qv(jf[3]), op = +jf[1];
        const yes = a!=null && b!=null && (op===9 ? Math.abs(a - b) < 1e-9 : op===10 ? Math.abs(a - b) >= 1e-9 : op===11 ? a > b : a < b);
        if (yes && L[klLabel(jf[4])]!==undefined) jump = L[klLabel(jf[4])];
      }
    }
    if (cdef && goesOn && (h==="CYCL DEF" || cont)) inDef = true;
    const w = words(all), T = tool || "T?", has = c => all.some(t => isCode(t, c));
    if (all.some(t => /^F(?:[-+]?[\d.]|Q)/.test(t))){ const f = all.find(t => /^F(?:[-+]?[\d.]|Q)/.test(t)); F = qv(f.slice(1)); }
    const machine = has("M91") || has("M92");   // machine coordinates: the move isn't drawn
    if (h && KL_MOVE.test(h) && !machine) move(h, w, all, li, T);
    if (h==="CC") cc = { x: "X" in w ? w.X + off.x : "IX" in w ? cc.x + w.IX : p.x, y: "Y" in w ? w.Y + off.y : "IY" in w ? cc.y + w.IY : p.y };
    if (h && /^CYCL CALL/.test(h) || has("M99") || (m89 && h && KL_MOVE.test(h))){
      if (h==="CYCL CALL POS"){ const n = { x: "X" in w ? w.X + off.x : p.x, y: "Y" in w ? w.Y + off.y : p.y }; runCycle(n.x, n.y, null, li, T, dips); }
      else if (h==="CYCL CALL PAT") pat.forEach(q => runCycle(q.x + off.x, q.y + off.y, q.z, li, T, dips));
      else runCycle(p.x, p.y, null, li, T, dips);
      if (has("M99")) m89 = false;
    }
    if (has("M89")) m89 = true;
    const stop = h==="STOP" || has("M00") ? "M00" : has("M01") ? "M01" : null;
    const kind = segs.length > s0 ? (segs.slice(s0).some(sg => sg.kind==="cyc") ? "cyc" : segs[segs.length-1].kind) : null;
    steps.push({ li, v:p.z, s0, s1:segs.length, kind, stop, dips, calls: stack.map(r => r - 1), tail:null, ...timelineValues(li, toks), ...(F!=null ? { f:F } : {}) });
    if (isEnd(toks)) break;
    if (jump!=null){ i = jump; continue; }
    if (isReturn(toks) && stack.length){ i = stack.pop(); continue; }
    const rc = all.map(t => /^CALL LBL ("[^"]*"|\d+) REP ?(\d+)/.exec(t)).find(Boolean);
    if (rc){   // repeat the section from the label: REP 2 runs it 2 more times
      const to = L[klLabel(rc[1])];
      if (to!==undefined){ if (!(li in reps)) reps[li] = +rc[2]; if (reps[li] > 0){ reps[li]--; i = to; continue; } delete reps[li]; }
      i++; continue;
    }
    const tgt = callTarget(toks);
    if (tgt!=null && L[tgt]!==undefined && stack.length < 8){ stack.push(i+1); i = L[tgt]; continue; }
    i++;
  }
  return { segs, steps, vals, tailUsed:false };

  // A block's words with values: X+10 → X:10, IX-5 → IX:-5, PA+30, R5, F200 (Q parameters worked out)
  function words(all){
    const w = {};
    for (const t of all){ if (klKey(t)) continue; const m = /^([A-Z]+)([-+]?(?:\d*\.?\d+|Q[LRS]?\d+))$/.exec(t); if (m){ const v = qv(m[2]); if (v!=null) w[m[1]] = v; } }
    return w;
  }
  function seg(a, b, kind, li, T){ if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-9) return; segs.push({ a:{...a}, b:{...b}, rapid: kind==="rapid", kind, li, tool:T }); }
  function arc(c, n, ccw, li, T, full){
    const r = Math.hypot(p.x - c.x, p.y - c.y), a0 = Math.atan2(p.y - c.y, p.x - c.x), a1 = Math.atan2(n.y - c.y, n.x - c.x);
    let sw = a1 - a0; if (ccw){ if (sw <= 1e-9) sw += 2*Math.PI; } else if (sw >= -1e-9) sw -= 2*Math.PI;
    if (!full && Math.abs(Math.abs(sw) - 2*Math.PI) < 1e-6 && Math.hypot(n.x - p.x, n.y - p.y) > 1e-6) sw = 0;
    let q = {...p};
    const ns = arcSteps(sw, 36);
    for (let s = 1; s <= ns; s++){ const a = a0 + sw*s/ns, b = { x:c.x + r*Math.cos(a), y:c.y + r*Math.sin(a), z:p.z + (n.z - p.z)*s/ns }; seg(q, b, "arc", li, T); q = b; }
    dir = { x: ccw ? -Math.sin(a0 + sw) : Math.sin(a0 + sw), y: ccw ? Math.cos(a0 + sw) : -Math.cos(a0 + sw) };
    p = { ...n };
  }
  function move(h, w, all, li, T){
    const rapid = all.includes("FMAX"), ccw = all.includes("DR+");
    const ax = (a, A) => A in w ? w[A] + off[a] : "I" + A in w ? p[a] + w["I" + A] : p[a];
    let n = { x:ax("x", "X"), y:ax("y", "Y"), z:ax("z", "Z") };
    if (/^(?:LP|CP|CTP)$|^(?:APPR|DEP) P/.test(h)){
      const pr0 = Math.hypot(p.x - cc.x, p.y - cc.y), pa0 = Math.atan2(p.y - cc.y, p.x - cc.x)*180/Math.PI;
      const pr = "PR" in w ? w.PR : pr0 + (w.IPR || 0), pa = ("PA" in w ? w.PA : pa0 + (w.IPA || 0))*Math.PI/180;
      n.x = cc.x + pr*Math.cos(pa); n.y = cc.y + pr*Math.sin(pa);
      if (h==="CP"){ arc(cc, n, ccw, li, T, "IPA" in w && Math.abs(w.IPA) >= 360); return; }
    }
    if (h==="C"){ const full = !("X" in w || "Y" in w || "IX" in w || "IY" in w); arc(cc, n, ccw, li, T, full); return; }
    if (h==="CR" && "R" in w){
      const d = Math.hypot(n.x - p.x, n.y - p.y), r = Math.abs(w.R);
      if (d > 1e-9 && r >= d/2 - 1e-9){
        const mx = (p.x + n.x)/2, my = (p.y + n.y)/2, hgt = Math.sqrt(Math.max(0, r*r - d*d/4)), ux = -(n.y - p.y)/d, uy = (n.x - p.x)/d;
        const big = w.R < 0, side = (ccw ? 1 : -1) * (big ? -1 : 1);   // the center is left of the chord for a short CCW arc
        arc({ x:mx + side*hgt*ux, y:my + side*hgt*uy }, n, ccw, li, T); return;
      }
    }
    if (h==="CT" && dir){
      const dx = n.x - p.x, dy = n.y - p.y, dn = -dir.y*dx + dir.x*dy;
      if (Math.abs(dn) > 1e-9){ const s = (dx*dx + dy*dy)/(2*dn); arc({ x:p.x - dir.y*s, y:p.y + dir.x*s }, n, s > 0, li, T); return; }
    }
    const kind = rapid ? "rapid" : "feed", d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d > 1e-9) dir = { x:(n.x - p.x)/d, y:(n.y - p.y)/d };
    seg(p, n, kind, li, T); p = n;
  }
  // PATTERN DEF points: POS (one point), ROW, PAT (rows and columns), CIRC and PITCHCIRC (points on a circle)
  function patPoints(kind, inner){
    const v = {}; for (const m of inner.matchAll(/([A-Z]+)([-+]?(?:\d*\.?\d+|Q[LRS]?\d+))/g)) v[m[1]] = qv(m[2]);
    const z = v.Z ?? null, R = Math.PI/180, X = v.X ?? 0, Y = v.Y ?? 0;
    if (kind==="POS"){ const lp = pat[pat.length-1] || { x:0, y:0 }; pat.push({ x: v.X ?? (v.IX!=null ? lp.x + v.IX : 0), y: v.Y ?? (v.IY!=null ? lp.y + v.IY : 0), z }); return; }   // IX IY: from the point before
    if (kind==="ROW"){ const n = Math.max(1, Math.min(999, Math.round(v.NUM ?? 1))), a = (v.ROT ?? 0)*R; for (let k = 0; k < n; k++) pat.push({ x:X + k*(v.D ?? 0)*Math.cos(a), y:Y + k*(v.D ?? 0)*Math.sin(a), z }); return; }
    if (kind==="PAT" || kind==="FRAME"){
      const nx = Math.max(1, Math.min(999, Math.round(v.NUMX ?? 1))), ny = Math.max(1, Math.min(999, Math.round(v.NUMY ?? 1))), a = (v.ROT ?? 0)*R;
      for (let j = 0; j < ny; j++) for (let k = 0; k < nx; k++){
        if (kind==="FRAME" && j > 0 && j < ny - 1 && k > 0 && k < nx - 1) continue;
        const dx = k*(v.DX ?? 0), dy = j*(v.DY ?? 0); pat.push({ x:X + dx*Math.cos(a) - dy*Math.sin(a), y:Y + dx*Math.sin(a) + dy*Math.cos(a), z });
      }
      return;
    }
    const n = Math.max(1, Math.min(999, Math.round(v.NUM ?? 1))), r = (v.D ?? 0)/2, a0 = v.START ?? 0, step = kind==="CIRC" ? 360/n : (v.STEP ?? 0);
    for (let k = 0; k < n; k++){ const a = (a0 + k*step)*R; pat.push({ x:X + r*Math.cos(a), y:Y + r*Math.sin(a), z }); }
  }
  // The defined cycle at X Y: drilling cycles plunge from the set-up clearance (Q200) above the surface (Q203) to the
  // depth (Q201) and come back up to the 2nd set-up clearance (Q204); pockets and studs (251-257) draw their outline at the depth.
  function runCycle(x, y, surf, li, T, dips){
    if (!cdef || cdef.n < 200) return;
    const q = k => cdef.q[k] ?? null, s = surf ?? q("Q203") ?? 0, top = s + Math.abs(q("Q200") ?? 2), z = s + (q("Q201") ?? 0), back = s + Math.max(Math.abs(q("Q200") ?? 2), q("Q204") ?? 0);
    if (Math.abs(p.z - top) > 1e-9 && p.z < top){ seg(p, { ...p, z:top }, "rapid", li, T); p = { ...p, z:top }; }
    seg(p, { x, y, z:p.z }, "rapid", li, T);
    if (p.z > top) seg({ x, y, z:p.z }, { x, y, z:top }, "rapid", li, T);
    seg({ x, y, z:top }, { x, y, z }, "cyc", li, T);
    const shape = [251, 253, 256].includes(cdef.n) ? "rect" : [252, 257].includes(cdef.n) ? "circ" : null;
    if (shape==="rect"){
      const a = (q("Q218") ?? 0)/2, b = (q("Q219") ?? 0)/2, rot = (q("Q224") ?? 0)*Math.PI/180;
      const at = (u, v) => ({ x:x + u*Math.cos(rot) - v*Math.sin(rot), y:y + u*Math.sin(rot) + v*Math.cos(rot), z });
      const pts = [at(0, 0), at(a, 0), at(a, b), at(-a, b), at(-a, -b), at(a, -b), at(a, 0), at(0, 0)];
      for (let k = 1; k < pts.length; k++) seg(pts[k-1], pts[k], "cyc", li, T);
    } else if (shape==="circ"){
      const r = (q("Q223") ?? 0)/2; let pr = { x, y, z };
      for (let k = 0; k <= 36; k++){ const a = 2*Math.PI*k/36, b = { x:x + r*Math.cos(a), y:y + r*Math.sin(a), z }; seg(pr, b, "cyc", li, T); pr = b; }
      seg(pr, { x, y, z }, "cyc", li, T);
    }
    seg({ x, y, z }, { x, y, z:back }, "rapid", li, T);
    dips.push({ top: Math.max(p.z, top), r:top, z, back });
    p = { x, y, z:back };
  }
}
function tailCode(toks){
  for (const t of toks){
    if (!/^M\d/.test(t)) continue;
    const d = entry(pad2(t))?.desc || "";
    if (!/tailstock/i.test(d) || /barrier/i.test(d)) continue;
    if (/retract|back/i.test(d)) return "out";
    if (/advance|forward|extend/i.test(d)) return "in";
  }
  return null;
}
const KCOL = { rapid:"#e8a33d", feed:"#0f6cbd", arc:"#0e9384", cyc:"#c03d9a", engrave:"#8a939e" };
const TCOL = ["#0f6cbd", "#c03d9a", "#0e9384", "#7a5bc0", "#b35c00", "#3b7d23"];
function toolColor(t){   // the tool list is worked out once per run of the program, not once per move
  if (EXEC.toolList?.segs!==EXEC.segs) EXEC.toolList = { segs:EXEC.segs, tools:[...new Set(EXEC.segs.map(s => s.tool))] };
  return TCOL[Math.max(0, EXEC.toolList.tools.indexOf(t)) % TCOL.length]; }
function stepIndexFor(li){
  const st = EXEC.steps; let k = st.findIndex(s => s.li===li);
  if (k < 0) k = st.findIndex(s => s.li > li);
  return k < 0 ? st.length-1 : k;
}
function drawViews(){
  const lathe = mtype()==="lathe", segs = EXEC.segs, v1 = document.getElementById("v1");
  if (simX){ const r = v1.getBoundingClientRect(); v1.setAttribute("viewBox", `0 0 ${Math.max(120, Math.round(r.width))} ${Math.max(80, Math.round(r.height))}`); }
  document.getElementById("v1h").innerHTML = lathe ? "Toolpath XZ <span>side profile, X as radius</span>" : "Toolpath XY <span>top view</span>";
  const fx = lathe ? (p => p.z) : (p => p.x), fy = lathe ? (p => p.x/2) : (p => p.y);
  // which moves are done, current, or still to come
  let doneTo, curFrom;
  if (simIdx!=null){ doneTo = simIdx; const st = EXEC.steps.find(s => s.s0 <= simIdx-1 && simIdx-1 < s.s1); curFrom = st ? st.s0 : simIdx; }
  else { const st = EXEC.steps[stepIndexFor(curLine)]; curFrom = st ? st.s0 : 0; doneTo = st ? st.s1 : 0; }
  const [ , , W, H] = v1.getAttribute("viewBox").split(" ").map(Number);
  // The view fits the cutting moves: rapids far from the part (a home return to X20. Z20.) would shrink it to a dot,
  // so they're drawn but left out of the fit and run off the edge. Zoom and pan (VIEWWIN) replace the fit.
  const cut = segs.filter(s => !s.rapid);
  const pts = (cut.length ? cut : segs).flatMap(s => [s.a, s.b]);
  // G107: the unrolled cylinder, one rectangle per span, from the origin across X and one turn (π × diameter) up Y.
  // With Q0 the diameter is a machine setting, so the turn's height isn't known: the top is left open.
  const wrapR = lathe ? [] : (EXEC.wraps || []).map(wp => {
    const ss = segs.slice(wp.s0, wp.s1).filter(s => !s.rapid); if (!ss.length) return null;
    const xs = ss.flatMap(s => [s.a.x, s.b.x]), ys = ss.flatMap(s => [s.a.y, s.b.y]), turn = wp.d > 0 ? Math.PI*wp.d : null;
    const down = Math.max(...ys) <= 1e-9 && Math.min(...ys) < 0;
    const ya = turn!=null ? (down ? -turn : 0) : Math.min(0, ...ys), yb = turn!=null ? (down ? 0 : turn) : Math.max(0, ...ys);
    return { ...wp, xa:Math.min(0, ...xs), xb:Math.max(0, ...xs), ya, yb, turn };
  }).filter(Boolean);
  wrapR.forEach(r => { if (r.turn!=null) pts.push({ x:r.xa, y:r.ya, z:0 }, { x:r.xb, y:r.yb, z:0 }); });
  if (!pts.length){   // nothing moves yet (a new program): clear the toolpath, timeline and position
    v1.innerHTML = ""; document.getElementById("tleg").innerHTML = ""; document.getElementById("s-pos").textContent = "No moves yet";
    document.getElementById("tlsvg").innerHTML = document.getElementById("tlgrid").innerHTML = ""; document.querySelector("#tlh span").textContent = ""; tlSteps = []; return; }
  const win = VIEWWIN && VIEWWIN.doc===doc && VIEWWIN.lathe===lathe ? VIEWWIN : null, pad = win ? 0 : 12;
  let x0, x1, y0, y1;
  if (win) ({ x0, x1, y0, y1 } = win);
  else {
    x0 = minOf(pts, fx); x1 = maxOf(pts, fx); y0 = minOf(pts, fy); y1 = maxOf(pts, fy);
    if (x1-x0 < 1e-6){ x0 -= .5; x1 += .5; } if (y1-y0 < 1e-6){ y0 -= .5; y1 += .5; }
  }
  document.getElementById("vz-fit").classList.toggle("on", !!win);
  const k = Math.min((W-2*pad)/(x1-x0), (H-2*pad)/(y1-y0));
  const ox = (W - (x1-x0)*k)/2, oy = (H - (y1-y0)*k)/2;
  const X = v => (ox + (v-x0)*k).toFixed(1), Y = v => (H - oy - (v-y0)*k).toFixed(1);
  VIEWT = { x0, y0, k, ox, oy, W, H, lathe };
  let g = "";
  if (lathe && 0 >= y0 && 0 <= y1) g += `<line x1="4" x2="${W-4}" y1="${Y(0)}" y2="${Y(0)}" stroke="#b9c2cf" stroke-dasharray="2 3" stroke-width=".8"/>`;
  const layers = [[], [], []], band = [];
  // Moves one after another drawn the same way go into one <path>: a long program has tens of thousands of moves,
  // and one <line> each made every redraw (each step of the simulation) slow.
  const runs = [null, null, null];
  const flush = n => { const r = runs[n]; if (r){ layers[n].push(`<path d="${r.d}" fill="none" stroke="${r.col}" stroke-width="${r.wdt}"${r.dash} stroke-linecap="round" stroke-linejoin="round"/>`); runs[n] = null; } };
  const addLine = (n, x1, y1, x2, y2, col, wdt, dash) => {
    let r = runs[n];
    if (r && (r.col!==col || r.wdt!==wdt || r.dash!==dash || r.parts > 4000)){ flush(n); r = null; }
    if (!r) r = runs[n] = { d:"", col, wdt, dash, end:"", parts:0 };
    r.d += (r.end===x1 + " " + y1 ? "" : "M" + x1 + " " + y1) + "L" + x2 + " " + y2; r.end = x2 + " " + y2; r.parts++;
  };
  segs.forEach((s, i) => {
    // Cutter comp: a grey band beside the move, on the side the tool's centre is on. Its width is fixed on screen,
    // since the cutter's radius is in the offset table, not the program.
    if (s.comp && compBand && !(i >= doneTo && future==="hide")){
      const ax = +X(fx(s.a)), ay = +Y(fy(s.a)), bx = +X(fx(s.b)), by = +Y(fy(s.b)), L = Math.hypot(bx - ax, by - ay);
      if (L > 0.01){ const o = (s.comp==="L" ? 1 : -1)*3.5, nx = (by - ay)/L*o, ny = -(bx - ax)/L*o;
        band.push(`<line x1="${(ax+nx).toFixed(1)}" y1="${(ay+ny).toFixed(1)}" x2="${(bx+nx).toFixed(1)}" y2="${(by+ny).toFixed(1)}" stroke="#8a939e" stroke-opacity="${i >= doneTo && future==="grey" ? .14 : .32}" stroke-width="6"/>`); }
    }
    if (Math.abs(fx(s.a)-fx(s.b)) < 1e-6 && Math.abs(fy(s.a)-fy(s.b)) < 1e-6){
      if (s.kind==="cyc") flush(i < doneTo ? 1 : 0);
      if (s.kind==="cyc" && i < doneTo) layers[1].push(`<circle cx="${X(fx(s.b))}" cy="${Y(fy(s.b))}" r="2.6" fill="none" stroke="${colorBy==="tool" ? toolColor(s.tool) : KCOL.cyc}" stroke-width="1.4"/>`);
      else if (s.kind==="cyc" && future!=="hide") layers[0].push(`<circle cx="${X(fx(s.b))}" cy="${Y(fy(s.b))}" r="2.6" fill="none" stroke="${future==="grey" ? "#d3d8de" : KCOL.cyc}" stroke-width="1.2"/>`);
      return;
    }
    if (s.rapid && !simRapids) return;
    if (s.sweep) return;   // engraving: drawn as its rectangle
    const state = i >= doneTo ? "future" : i >= curFrom ? "cur" : "done";
    if (state==="future" && future==="hide") return;
    let col = colorBy==="tool" ? toolColor(s.tool) : KCOL[s.kind] || KCOL.feed;
    let wdt = s.rapid ? 0.9 : 1.5, dash = s.rapid ? ' stroke-dasharray="3 3"' : "";
    if (state==="future" && future==="grey"){ col = "#d3d8de"; wdt = s.rapid ? .8 : 1.1; }
    if (state==="cur"){ col = "#d13438"; wdt = 2.4; }
    const ly = state==="future" ? 0 : state==="cur" ? 2 : 1;
    addLine(ly, X(fx(s.a)), Y(fy(s.a)), X(fx(s.b)), Y(fy(s.b)), col, wdt, dash);
    // a hole drilled along the view (a lathe's drill or tap on center): a small circle at the bottom
    if (s.hole){ const hl = state==="future" ? 0 : 1; flush(hl); layers[hl].push(`<circle cx="${X(fx(s.b))}" cy="${Y(fy(s.b))}" r="2.6" fill="#fff" stroke="${state==="future" && future==="grey" ? "#d3d8de" : colorBy==="tool" ? toolColor(s.tool) : KCOL.cyc}" stroke-width="1.3"/>`); }
  });
  flush(0); flush(1); flush(2);
  const wr = wrapR.map(r => {
    const [a, b, c, d] = [[r.xa, r.ya], [r.xb, r.ya], [r.xb, r.yb], [r.xa, r.yb]].map(([x, y]) => [X(x), Y(y)]);
    const lab = r.turn!=null ? `Unrolled (G107): Ø${fmt4(r.d)}, one turn ${fmt4(r.turn)}` : `Unrolled (G107): diameter unknown (Q0: ${DIALECT.cylMap?.setting || "a setting"})`;
    const sides = r.turn!=null ? `<polygon points="${[a, b, c, d].map(q => q.join(",")).join(" ")}" fill="#eef1f5" stroke="#8a939e" stroke-width="1" stroke-dasharray="5 3"/>`
      : `<path d="M${d.join(",")} L${a.join(",")} L${b.join(",")} L${c.join(",")}" fill="none" stroke="#8a939e" stroke-width="1" stroke-dasharray="5 3"/>`;
    return `<g><title>${esc(lab + ". Y is the distance round the part; the A axis turns it.")}</title>${sides}<text x="${(+a[0] + 4).toFixed(1)}" y="${(+a[1] - 5).toFixed(1)}" font-size="10" fill="#5b6470" font-family="Segoe UI,sans-serif">${esc(lab)}</text></g>`;
  }).join("");
  // The parts of the moves out to a sharp corner that a ,C or ,R cuts off: grey and dashed, under the path
  const gh = (EXEC.ghosts || []).map(s => `<line x1="${X(fx(s.a))}" y1="${Y(fy(s.a))}" x2="${X(fx(s.b))}" y2="${Y(fy(s.b))}" stroke="#a9b1bc" stroke-width="1" stroke-dasharray="3 2" stroke-linecap="round"/>`).join("");
  // Engraving: one grey rectangle per G47 line (the letters aren't drawn), cut on the left, top and bottom. Its right end
  // is an estimate, so it fades out, unless the next line's start sets it. Cut: darker; to come: lighter; current: red edges.
  const bx = (EXEC.boxes || []).map((b, n) => {
    const state = b.s0 >= doneTo ? "future" : b.s0 >= curFrom ? "cur" : "done";
    if (state==="future" && future==="hide") return "";
    const fill = state==="future" ? (future==="grey" ? "#e6e9ed" : "#d3d8de") : "#b4bcc6";
    const edge = state==="cur" ? "#d13438" : state==="future" && future==="grey" ? "#d3d8de" : KCOL.engrave;
    const sp = b.pts.map(q => [X(fx(q)), Y(fy(q))]), mid = (a, c) => [((+a[0] + +c[0])/2).toFixed(1), ((+a[1] + +c[1])/2).toFixed(1)];
    const [lx, ly] = mid(sp[0], sp[3]), [rx, ry] = mid(sp[1], sp[2]);
    const grad = b.exact ? "" : `<linearGradient id="eg${n}" gradientUnits="userSpaceOnUse" x1="${lx}" y1="${ly}" x2="${rx}" y2="${ry}"><stop offset=".6" stop-color="${fill}"/><stop offset="1" stop-color="${fill}" stop-opacity="0"/></linearGradient>`;
    const tip = b.tip || `Engraving: ${b.text}` + (b.exact ? " (ends where the serial number starts)" : " (length estimated: the control doesn't give letter widths)");
    return `<g>${grad}<title>${esc(tip)}</title><polygon points="${sp.map(q => q.join(",")).join(" ")}" fill="${b.exact ? fill : `url(#eg${n})`}" fill-opacity=".8"/>`
      + `<path d="M${sp[1].join(",")} L${sp[0].join(",")} L${sp[3].join(",")} L${sp[2].join(",")}" fill="none" stroke="${edge}" stroke-width="${state==="cur" ? 1.8 : 1.1}" stroke-linejoin="round"/></g>`;
  }).join("");
  g += wr + band.join("") + gh + bx + layers.flat().join("");
  const at = segs[Math.max(0, Math.min(doneTo, segs.length) - 1)];
  // Lathe tailstock, when the program uses it: a center pointing at the part, with ← (in), → (out) or ? (not set yet).
  if (lathe && EXEC.tailUsed){
    const tk = simIdx!=null && simK!=null ? simK : stepIndexFor(curLine), ts = EXEC.steps[tk]?.tail || null;
    const cy = Math.min(H - 16, Math.max(16, +Y(0))), x1 = W - 6, x0 = x1 - 26;
    const sym = ts==="in" ? `<path d="M${x1-6} ${cy} h-12 m5 -5 l-5 5 l5 5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
      : ts==="out" ? `<path d="M${x1-18} ${cy} h12 m-5 -5 l5 5 l-5 5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<text x="${x1-11}" y="${cy+4}" font-size="12" font-weight="700" text-anchor="middle" fill="#fff" font-family="Segoe UI,sans-serif">?</text>`;
    g += `<g class="tailst"><title>Tailstock ${ts==="in" ? "in (advanced)" : ts==="out" ? "out (retracted)" : "not set yet: no tailstock code has run"}</title><path d="M${x0} ${cy} L${x1} ${cy-15} L${x1} ${cy+15} Z" fill="#1f2328" stroke="#1f2328" stroke-width="3" stroke-linejoin="round"/>${sym}</g>`;
  }
  if (at && doneTo > 0 && at.sweep){   // engraving and threading: the tool is a line across the box, sweeping along it
    const qx = fx(at.b), qy = fy(at.b), tx = qx + at.sweep.ux*at.sweep.h, ty = qy + at.sweep.uy*at.sweep.h;
    g += `<line x1="${X(qx)}" y1="${Y(qy)}" x2="${X(tx)}" y2="${Y(ty)}" stroke="#d13438" stroke-width="3" stroke-linecap="round"/>`;
  }
  else if (at && doneTo > 0) g += `<circle cx="${X(fx(at.b))}" cy="${Y(fy(at.b))}" r="4.5" fill="${colorBy==="tool" ? toolColor(at.tool) : "#d13438"}" stroke="#fff" stroke-width="1.5"/>`;
  // An alarm (a code for an option the machine doesn't have): the machine stops there, so the simulation ends on a red ✕
  if (alarmReached()){
    const q = EXEC.alarm.at, cx = +X(fx(q)), cy = +Y(fy(q)), r = 7;
    g += `<g><title>${esc("Alarm: " + EXEC.alarm.text)}</title><path d="M${cx-r} ${cy-r} L${cx+r} ${cy+r} M${cx+r} ${cy-r} L${cx-r} ${cy+r}" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M${cx-r} ${cy-r} L${cx+r} ${cy+r} M${cx+r} ${cy-r} L${cx-r} ${cy+r}" stroke="#d13438" stroke-width="3.2" stroke-linecap="round"/></g>`;
  }
  v1.innerHTML = g;
  const tools = [...new Set(segs.map(s => s.tool))];
  document.getElementById("tleg").innerHTML = colorBy==="tool"
    ? tools.map(t => `<span><i style="background:${toolColor(t)}"></i>${t}</span>`).join("") + `<span style="margin-left:auto;color:#888">${future==="grey"?"later moves greyed":future==="hide"?"later moves hidden":"all moves shown"}</span>`
    : (simRapids ? `<span><i style="background:${KCOL.rapid}"></i>Rapid</span>` : "") + `<span><i style="background:${KCOL.feed}"></i>Feed</span><span><i style="background:${KCOL.arc}"></i>Arc</span><span><i style="background:${KCOL.cyc}"></i>Cycle</span>${EXEC.boxes?.length ? `<span><i style="background:#b4bcc6"></i>Engraving</span>` : ""}${compBand && segs.some(s => s.comp) ? `<span><i style="background:rgba(138,147,158,.45);height:6px"></i>Cutter comp side</span>` : ""}<span style="margin-left:auto;color:#888">${future==="grey"?"later moves greyed":future==="hide"?"later moves hidden":"all moves shown"}</span>`;
  drawSimPos(doneTo > 0 ? at : null, lathe);
  // Only when it changes: WebKitGTK (Linux) drops a click whose text was replaced between the press and the release,
  // and this runs on every step of the simulation, so ⏸ couldn't be clicked while playing.
  const pb = document.getElementById("s-play"), pt = simTimer ? "⏸" : "▶"; if (pb.textContent!==pt) pb.textContent = pt;
  document.getElementById("s-play").classList.toggle("on", !!simTimer);
  drawTimeline(EXEC.steps, lathe);
}

/* Toolpath zoom and pan. VIEWWIN is the part of the drawing shown (in program units), or null to fit the cutting
   moves. It belongs to the program it was set on, so another tab or a newly opened file starts fitted.
   Drag pans, the wheel zooms about the pointer, Shift+drag (or ⬚ then drag) zooms to a box, double-click fits. */
function viewVisible(){   // the whole drawing area in program units
  const t = VIEWT; if (!t) return null;
  const wx = sx => t.x0 + (sx - t.ox)/t.k, wy = sy => t.y0 + (t.H - t.oy - sy)/t.k;
  return { x0:wx(0), x1:wx(t.W), y0:wy(t.H), y1:wy(0) };
}
function setViewWin(w){ VIEWWIN = w ? { ...w, doc, lathe:VIEWT?.lathe } : null; drawViews(); }
function zoomView(f, at){   // f > 1 zooms in, about the point "at" (program units) or the middle
  const v = viewVisible(); if (!v) return;
  const cx = at ? at.x : (v.x0+v.x1)/2, cy = at ? at.y : (v.y0+v.y1)/2;
  const span = Math.max(v.x1-v.x0, v.y1-v.y0)/f; if (span < 1e-4 || span > 1e5) return;
  setViewWin({ x0:cx - (cx-v.x0)/f, x1:cx + (v.x1-cx)/f, y0:cy - (cy-v.y0)/f, y1:cy + (v.y1-cy)/f });
}
function setBoxMode(on){ boxMode = on; document.getElementById("vz-box").setAttribute("aria-pressed", on); document.getElementById("vbox").classList.toggle("boxing", on); }
{
  const v1 = document.getElementById("v1");
  const svgPt = e => { const m = v1.getScreenCTM(); if (!m) return null; const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return { sx:p.x, sy:p.y }; };
  const world = q => { const t = VIEWT; return { x: t.x0 + (q.sx - t.ox)/t.k, y: t.y0 + (t.H - t.oy - q.sy)/t.k }; };
  let drag = null;
  v1.addEventListener("wheel", e => {
    if (!VIEWT) return; e.preventDefault();
    const q = svgPt(e); if (q) zoomView(e.deltaY < 0 ? 1.25 : 0.8, world(q));
  }, { passive:false });
  v1.addEventListener("pointerdown", e => {
    if (e.button!==0 || !VIEWT) return;
    const q = svgPt(e); if (!q) return;
    e.preventDefault(); v1.setPointerCapture(e.pointerId);
    drag = { box: boxMode || e.shiftKey, q0:q, v0:viewVisible(), t0:{ ...VIEWT }, moved:false };
    if (!drag.box) v1.classList.add("panning");
  });
  v1.addEventListener("pointermove", e => {
    if (!drag) return;
    const q = svgPt(e); if (!q) return;
    const dx = q.sx - drag.q0.sx, dy = q.sy - drag.q0.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    if (drag.box){
      let r = v1.querySelector("rect.zbox");
      if (!r){ r = document.createElementNS("http://www.w3.org/2000/svg", "rect"); r.setAttribute("class", "zbox"); r.setAttribute("fill", "rgba(15,108,189,.08)"); r.setAttribute("stroke", "#0f6cbd"); r.setAttribute("stroke-dasharray", "3 2"); v1.appendChild(r); }
      r.setAttribute("x", Math.min(q.sx, drag.q0.sx)); r.setAttribute("y", Math.min(q.sy, drag.q0.sy));
      r.setAttribute("width", Math.abs(dx)); r.setAttribute("height", Math.abs(dy));
    } else {
      const k = drag.t0.k, v = drag.v0;
      VIEWWIN = { x0:v.x0 - dx/k, x1:v.x1 - dx/k, y0:v.y0 + dy/k, y1:v.y1 + dy/k, doc, lathe:drag.t0.lathe };
      drawViews();
    }
  });
  const end = e => {
    if (!drag) return;
    const d = drag; drag = null; v1.classList.remove("panning");
    if (d.box){
      v1.querySelector("rect.zbox")?.remove();
      const q = svgPt(e);
      if (d.moved && q && Math.abs(q.sx - d.q0.sx) > 4 && Math.abs(q.sy - d.q0.sy) > 4){
        const a = world(d.q0), b = world(q);
        setViewWin({ x0:Math.min(a.x, b.x), x1:Math.max(a.x, b.x), y0:Math.min(a.y, b.y), y1:Math.max(a.y, b.y) });
      }
      setBoxMode(false);
    }
  };
  v1.addEventListener("pointerup", end);
  v1.addEventListener("pointercancel", end);
  v1.addEventListener("dblclick", () => setViewWin(null));
  document.getElementById("vz-in").onclick = () => zoomView(1.5);
  document.getElementById("vz-out").onclick = () => zoomView(1/1.5);
  document.getElementById("vz-box").onclick = () => setBoxMode(!boxMode);
  document.getElementById("vz-fit").onclick = () => setViewWin(null);
}
// The line between the simulation buttons and the toolpath: where the tool is, the line and its N number,
// and the stop the simulation is paused at.
// Whether the line shown (or simulated) has reached an alarm line
function alarmReached(){
  const A = EXEC.alarm; if (!A) return false;
  const k = simIdx!=null && simK!=null ? simK : stepIndexFor(curLine);
  return k >= A.k || (simIdx==null && curLine > EXEC.steps[A.k]?.li);
}
function drawSimPos(at, lathe){
  const d = (lineState[curLine]?.units==="mm") ? 3 : 4, f = v => v==null ? "—" : (v < 0 ? "-" : "") + Math.abs(v).toFixed(d);
  const p = at?.b, n = nWordOf(curLine), stop = simStopAt!=null ? EXEC.steps[simStopAt]?.stop : null;
  const ax = lathe ? [["X", p?.x], ["Z", p?.z]] : [["X", p?.x], ["Y", p?.y]];
  document.getElementById("s-pos").innerHTML = ax.map(([a, v]) => `<span><b>${a}</b>${f(v)}</span>`).join("")
    + `<span><b>Line</b>${curLine+1}</span>` + (n ? `<span><b>N</b>${n.slice(1)}</span>` : "")
    + (stop ? `<span class="stop" title="${stop==="M00" ? "Program stop" : "Optional stop"}. ▶ continues.">${stop}</span>` : "")
    + (() => { const k = simIdx!=null && simK!=null ? simK : stepIndexFor(curLine), nt = (EXEC.notes || []).find(x => k >= x.k && (x.until==null || k < x.until)); return nt && !alarmReached() ? `<span class="snote" title="${esc(nt.text)}.">${esc(nt.short || nt.text)}</span>` : ""; })()
    + (alarmReached() ? `<span class="alarm" title="${esc(EXEC.alarm.text)} The lines after it don't run.">Alarm: ${esc(EXEC.alarm.code)} ${esc((EXEC.alarm.label || "").toLowerCase())} not on this machine</span>` : "");
}
let tlSteps = [], tlShift = 0; const SLOT = 18;
/* What the timeline plots, per machine type (RULES.machineTypes[type].timeline, the first is the default):
   z (Z on a mill, or x: the X radius on a lathe), feed (the feed rate) and speed (the spindle speed while it
   turns). A machine with a process (a plasma torch) also gets a band where the torch is on, and a mark on
   lines that change the process or material: plasma power is set on the power supply, not in the program. */
const TL_MODES = { z:"Z", x:"X radius", feed:"Feed rate", speed:"Spindle speed" };
const tlMode = {};   // the chosen value per machine type, kept in settings.json
window.loadTimelineModes = m => { Object.assign(tlMode, m); if (EXEC?.steps?.length) drawTimeline(EXEC.steps, mtype()==="lathe"); };
const tlModes = () => RULES.machineTypes?.[mtype()]?.timeline || [mtype()==="lathe" ? "x" : "z"];
const tlModeNow = () => { const ms = tlModes(); return ms.includes(tlMode[mtype()]) ? tlMode[mtype()] : ms[0]; };
function timelineValues(li, toks){
  const st = lineState[li] || {}, P = DIALECT.process;
  const num = w => w ? parseFloat(String(w).slice(1)) || 0 : 0;
  return { f: num(st.F), s: ["M03","M04"].includes(st.spinDir) ? num(st.S) : 0,
    on: !!P?.on?.includes(st.torch), mark: (P?.changes || []).find(c => toks.some(t => isCode(t, c))) || null };
}
/* Mill Z-by-line symbols. Each line has a column; a line that makes several moves (a drilling cycle) draws its moves
   down on the left of the column and its moves up on the right, as one line. Lines are straight, and a circle sits
   centered on the point it marks. Rapids are dashed. The kinds of line each get a mark:
   drill (G81) plunge and return, to the start height (G98) or R (G99); G82 a circle on the bottom (dwell);
   G83 a loop per peck (full retract to R); G73 a tick per peck (chip break); G84/G74 tap: feeds back out, ↻ at the
   bottom (the spindle reverses); G85/G89 bore: feeds out (G89 dwells); G86 a diamond at the bottom (spindle stops),
   rapid out; G76 a step off the wall at the bottom; a ramp (X or Y with Z) a slanted line; a helix a slanted line
   with a flat loop per circuit; G04 a circle; M00 a filled square, M01 an empty one; M06 the new tool's number;
   G28 / G53 Z an arrow to the top; M05 a small diamond; M30 / M02 end bars; a "/" line is hatched. */
const TL_HOLE = { G73:"Peck drilling, chip break", G74:"Tapping, left hand", G76:"Fine boring", G81:"Drilling", G82:"Drilling with a dwell at the bottom",
  G83:"Peck drilling, full retract", G84:"Tapping", G85:"Boring, feed out", G86:"Boring, spindle stops at the bottom", G89:"Boring with a dwell, feed out" };
function tlHole(a, b, Y, h, clip){
  const C = KCOL, w = b - a, xl = a + w*0.28, xr = a + w*0.72, yt = Y(Math.min(h.top, clip)), yr = Y(Math.min(h.r, clip)), yz = Y(h.z), yb = Y(Math.min(h.back, clip));
  const L = (x1, y1, x2, y2, col, wd, dash) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="${wd}" stroke-linecap="round"${dash ? ' stroke-dasharray="3 2"' : ""}/>`;
  const cyc = h.cyc, feedOut = ["G84", "G74", "G85", "G89"].includes(cyc);
  let g = L(a, yt, xl, yt, C.rapid, 1.2, 1);
  if (yr > yt + 0.5) g += L(xl, yt, xl, yr, C.rapid, 1.4, 1);
  g += L(xl, yr, xl, yz, C.cyc, 1.6) + L(xl, yz, xr, yz, C.cyc, 1.6);
  if ((cyc==="G83" || cyc==="G73") && h.q > 0){
    const depths = []; for (let d = h.r - h.q; d > h.z + 1e-6 && depths.length < 40; d -= h.q) depths.push(d);
    const lw = (xr - xl)*0.62;
    // The retract amounts are machine settings (h.ret): the moves they set get a wide grey band, as their height is uncertain.
    // G73 backs off h.ret after each peck; G83 rapids back down to h.ret above the last peck.
    const ub = (x, ya, yb) => { const y0 = Math.min(ya, yb) - 2.5, y1 = Math.max(ya, yb) + 2.5; return `<rect x="${(x-3.5).toFixed(1)}" y="${y0.toFixed(1)}" width="7" height="${(y1-y0).toFixed(1)}" rx="2" fill="#8a939e" fill-opacity=".45"/>`; };
    if (h.ret > 0){
      if (cyc==="G73") depths.forEach(d => { g += ub(xl + (xr-xl)*0.8, Y(d), Y(d + h.ret)); });
      else depths.forEach(d => { g += ub(xl + lw, Y(d), Y(d + h.ret)); });
    }
    if (cyc==="G83"){ let y0 = yr; [...depths, h.z].forEach(d => { const y1 = Y(d); g += `<path d="M${xl.toFixed(1)},${y0.toFixed(1)} H${(xl+lw).toFixed(1)} V${y1.toFixed(1)} H${xl.toFixed(1)}" fill="none" stroke="${C.cyc}" stroke-width="1"/>`; y0 = y1; }); }
    else depths.forEach(d => { g += L(xl, Y(d), xl + (xr-xl)*0.8, Y(d), C.cyc, 1) + (h.ret > 0 ? L(xl + (xr-xl)*0.8, Y(d), xl + (xr-xl)*0.8, Y(d + h.ret), C.cyc, 1) : ""); });
  }
  if (cyc==="G82" || cyc==="G89") g += `<circle cx="${((xl+xr)/2).toFixed(1)}" cy="${yz.toFixed(1)}" r="2.6" fill="#fff" stroke="${C.cyc}" stroke-width="1.1"/>`;
  if (cyc==="G84" || cyc==="G74"){ const cx = (xl+xr)/2, cy = yz - 3.6; g += `<path d="M${(cx-2.4).toFixed(1)},${(cy+1.2).toFixed(1)} A2.4 2.4 0 1 1 ${(cx+2.4).toFixed(1)},${(cy+1.2).toFixed(1)}" fill="none" stroke="${C.cyc}" stroke-width="1"/>`; }
  if (feedOut){ g += L(xr, yz, xr, yr, C.cyc, 1.6); if (yb < yr - 0.5) g += L(xr, yr, xr, yb, C.rapid, 1.4, 1); }
  else if (cyc==="G86"){ g += `<rect x="${(xr-2.6).toFixed(1)}" y="${(yz-2.6).toFixed(1)}" width="5.2" height="5.2" fill="#2b2f36" transform="rotate(45 ${xr.toFixed(1)} ${yz.toFixed(1)})"/>` + L(xr, yz-3, xr, yb, C.rapid, 1.4, 1); }
  else if (cyc==="G76"){ const sh = Math.min(3, (b - xr)*0.7); return g + L(xr, yz, xr+sh, yz, "#2b2f36", 1.6) + L(xr+sh, yz, xr+sh, yb, C.rapid, 1.4, 1) + L(xr+sh, yb, b, yb, C.rapid, 1.2, 1); }
  else g += L(xr, yz, xr, yb, C.rapid, 1.4, 1);
  return g + L(xr, yb, b, yb, C.rapid, 1.2, 1);
}
// What a line's mark is on the mill timeline, and its tooltip: null for a plain line.
function tlMark(s){
  const t = doc[s.li] || [], has = c => t.some(w => isCode(w, c)), sg = EXEC.segs.slice(s.s0, s.s1);
  if (s.stop) return [s.stop, s.stop==="M00" ? "Program stop (M00)" : "Optional stop (M01)"];
  if (has("G04")) return ["dwell", "Dwell (G04)"];
  if (has("M06")) return ["tool", "Tool change (M06)"];
  if (has("G28") || (has("G53") && t.some(w => /^Z/.test(w)))) return ["home", "Z to machine home"];
  if (isEnd(t)) return ["end", "Program end"];
  if (has("M05")) return ["spindle", "Spindle stop (M05)"];
  const dz = sg.some(q => Math.abs(q.a.z - q.b.z) > 1e-6), dxy = sg.some(q => Math.hypot(q.a.x - q.b.x, q.a.y - q.b.y) > 1e-6);
  if (s.engZ!=null){ const b = (EXEC.boxes || []).find(b => b.s0 >= s.s0 && b.s0 < s.s1);
    return ["engrave", `Engraving (${DIALECT.engrave?.code || "G47"})${b ? ": " + b.text : ""}, to Z ${s.engZ.toFixed(4)}`]; }
  if (s.kind==="arc" && dz && s.turns > 0.25) return ["helix", "Helix: " + (Math.round(s.turns*10)/10) + " turns"];
  if (s.kind==="feed" && dz && dxy) return ["ramp", "Ramp: X or Y with Z"];
  return null;
}
// The red dot on the timeline: where the tool is. While simulating it follows the moves done so far (down the left of a
// drilling column, along the bottom, up the right); otherwise it sits where the selected line leaves the tool.
function tlDot(steps, idx, sim, X, Y, mode, lathe, CLIP, vals, ends){
  const s = steps[idx]; if (!s) return "";
  const n = s.s1 - s.s0, done = sim ? Math.max(s.s0, Math.min(simIdx, s.s1)) : s.s1, k = done - s.s0, x0 = X(idx);
  const pos = mode==="z" || mode==="x", seg = k > 0 ? EXEC.segs[done-1] : null;
  const val = q => Math.min(lathe ? q.x/2 : q.z, CLIP);
  let x, y;
  if (!n){ x = x0 + SLOT/2; y = Y(vals[idx]); }
  else if (!seg){ x = x0; y = Y(pos ? (ends[idx-1] ?? vals[idx]) : vals[idx]); }
  else {
    y = pos ? Y(val(seg.b)) : Y(vals[idx]);
    const dips = s.dips || [];
    if (mode==="z" && !lathe && dips.length && dips.length <= 3){
      const sg = EXEC.segs.slice(s.s0, done), c = sg.filter(q => q.kind==="cyc").length;
      const up = seg.b.z > seg.a.z + 1e-9, down = seg.b.z < seg.a.z - 1e-9;
      const h = Math.min(dips.length - 1, Math.max(0, seg.kind==="cyc" || up ? c - 1 : c)), w = SLOT/dips.length, a = x0 + w*h;
      x = seg.kind==="cyc" ? a + w*0.5 : up ? a + w*0.72 : a + w*0.28;
      if (!down && !up && seg.kind!=="cyc") y = Y(Math.min(dips[h].top, CLIP));
    } else x = x0 + SLOT*k/n;
    if (k===n) x = x0 + SLOT - 2;   // the line is done: at its end, still in its column
  }
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="#d13438" stroke="#fff" stroke-width="1.2"><title>Where the tool is</title></circle>`;
}
/* Scale lines across the Z (or X) timeline, in powers of ten: the finest that are still at least 3.5 px apart are drawn
   light, and every tenth one (the next power of ten up) darker, with its value at the left edge. So a part 1.2 deep shows
   0" and -1" with the tenths between; 11 deep shows 0" and -10" with the inches between, and no tenths. When the darker
   lines leave only one in view, the light ones are labeled too. On a lathe the values are diameters (X), CL at zero. */
function tlGrid(lo, hi, Y, ph, lathe, idx, W){
  const st = EXEC.steps[idx], mm = (st && lineState[st.li]?.units)==="mm", f = lathe ? 2 : 1;   // f: value shown per value plotted
  const a = lo*f, b = hi*f, pxu = ph/((b - a) || 1);
  let minor = mm ? 0.1 : 0.01;
  while (minor*pxu < 3.5 && minor < 1e6) minor *= 10;
  const major = minor*10, on = (v, d) => Math.abs(v/d - Math.round(v/d)) < 1e-6;
  const ticks = []; for (let n = Math.ceil(a/minor - 1e-9); n*minor <= b + 1e-9; n++) ticks.push(n*minor);
  const majors = ticks.filter(v => on(v, major)), labelMinor = majors.length < 2 && minor*pxu >= 10;
  const dec = v => Math.max(0, -Math.floor(Math.log10(v) + 1e-9));
  const txt = (v, d) => Math.abs(v) < 1e-9 ? (lathe ? "CL" : mm ? "0 mm" : '0"') : (lathe ? "Ø" : "") + v.toFixed(dec(d)) + (mm ? " mm" : '"');
  let lines = "", labels = "";
  ticks.forEach(v => {
    const big = on(v, major), y = (+Y(v/f)).toFixed(1);
    const zero = Math.abs(v) < 1e-9;
    lines += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="${big ? "#b9c3cf" : "#dbe1e8"}" stroke-width="1"/>`;
    // The origin: a circle with a cross through it, on the zero line at the left edge
    if (zero) labels += `<g><title>${lathe ? "Centerline (X0)" : "Part zero (Z0)"}</title><circle cx="7" cy="${y}" r="4" fill="#fff" stroke="#3b4350" stroke-width="1.1"/><path d="M1.5 ${y} H12.5 M7 ${(+y - 5.5).toFixed(1)} V${(+y + 5.5).toFixed(1)}" stroke="#3b4350" stroke-width="1.1"/></g>`;
    if (big || labelMinor) labels += `<text x="${zero ? 15 : 3}" y="${(+y - 2).toFixed(1)}" font-size="${big ? 7.5 : 6.5}" fill="${big ? "#5b6470" : "#8f97a1"}" font-family="Consolas,monospace" stroke="#fff" stroke-width="2.5" paint-order="stroke">${txt(v, big ? major : minor)}</text>`;
  });
  return { lines, labels };
}
function drawTimeline(steps, lathe){
  tlSteps = steps;
  const box = document.getElementById("tl"), svg = document.getElementById("tlsvg"), sel = document.getElementById("tl-mode");
  const mode = tlModeNow(), modes = tlModes(), P = DIALECT.process?.on?.length ? DIALECT.process : null;
  // Rebuilt only when the machine type's list changes, so a redraw while the list is open doesn't undo a pick.
  if (sel.dataset.modes!==modes.join()){ sel.innerHTML = modes.map(m => `<option value="${m}">${TL_MODES[m]}</option>`).join(""); sel.dataset.modes = modes.join(); }
  if (document.activeElement!==sel) sel.value = mode;
  sel.hidden = modes.length < 2;
  const BW = box.clientWidth || 278, H = 104, top = P ? 18 : 12, bot = 20, half = BW/2;
  const W = steps.length*SLOT + BW;
  svg.setAttribute("width", W); svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const pos = mode==="z" || mode==="x";
  // Values above CLIP are drawn at CLIP with a ↑: on a mill, Z more than 0.3 above Z0; on a lathe, X beyond the cutting
  // moves (a rapid to a tool change position far from the part would squash the cutting into a flat line near CL).
  let CLIP = 0.3;
  if (lathe && pos){
    const cv = steps.filter(s => s.kind && s.kind!=="rapid").map(s => s.v), all = cv.length ? cv : steps.map(s => s.v);
    const a = Math.min(0, minOf(all)), b = Math.max(maxOf(all), 0.05);
    CLIP = b + Math.max((b - a)*0.2, 0.025);
  }
  const vals = steps.map(s => mode==="feed" ? s.f : mode==="speed" ? s.s : Math.min(s.v, CLIP));
  const dipZ = mode==="z" && !lathe ? steps.flatMap(s => [...(s.dips || []).map(d => d.z), ...(s.engZ!=null ? [s.engZ] : [])]) : [];
  const lo = pos ? Math.min(minOf(vals), minOf(dipZ), 0) : 0, hi = pos ? Math.max(maxOf(vals), lathe ? 0.1 : 0.05) : Math.max(maxOf(vals), 1) * 1.1;
  const Y = v => top + (hi - v) / (hi - lo || 1) * (H - top - bot);
  const X = i => half + i*SLOT;
  // While simulating, the step being run; otherwise the first run of the selected line (its other runs are tinted too).
  const sim = simIdx!=null && simK!=null, idx = sim ? simK : stepIndexFor(curLine);
  const isCur = (s, i) => sim ? i===idx : s.li===curLine;
  // Only the steps around the current one are drawn: the box shows about BW/SLOT of them, and a long program's
  // thousands of others would only make the drawing slow (the box is redrawn whenever the line changes).
  const span = Math.ceil(BW/SLOT) + 8, lo0 = Math.max(0, idx - span), hi0 = Math.min(steps.length, idx + span + 1);
  const near = (s, i) => i >= lo0 && i < hi0;
  let g = `<defs><pattern id="tlbd" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#d8dde4" stroke-width="1.4"/></pattern></defs>`;
  steps.forEach((s, i) => { if (near(s, i) && isCur(s, i)) g += `<rect x="${X(i)}" y="0" width="${SLOT}" height="${H-bot+4}" fill="#fde7e8"/>`; });
  const grid = pos ? tlGrid(lo, hi, Y, H - top - bot, lathe, idx, W) : { lines:"", labels:"" };
  g += grid.lines;
  g += `<line x1="${half-8}" x2="${W-half+8}" y1="${Y(0)}" y2="${Y(0)}" stroke="#b9c2cf" stroke-dasharray="2 3" stroke-width=".8"/>`;
  if (P){   // the torch band along the top, and the lines that change the process or material
    g += `<rect x="${half-8}" y="3" width="${steps.length*SLOT+16}" height="6" rx="2" fill="#eef0f3"/>`;
    steps.forEach((s, i) => {
      if (!near(s, i)) return;
      if (s.on) g += `<rect x="${X(i)}" y="3" width="${SLOT}" height="6" fill="#e8590c"/>`;
      if (s.mark) g += `<line x1="${X(i)+1}" x2="${X(i)+1}" y1="1" y2="${H-bot}" stroke="#7a5bc0" stroke-width="1" stroke-dasharray="1.5 2"/><text x="${X(i)+3}" y="${top+6}" font-size="6.5" fill="#7a5bc0" font-family="Consolas,monospace">${s.mark}</text>`;
    });
  }
  const sym = mode==="z" && !lathe, ends = [];
  const endOf = (s, i) => sym && s.dips?.length && s.dips.length <= 3 ? Math.min(s.dips[s.dips.length-1].back, CLIP) : vals[i];
  let prev = lo0 > 0 ? endOf(steps[lo0-1], lo0-1) : null;
  if (lo0 > 0) ends[lo0-1] = prev;
  steps.forEach((s, i) => {
    if (!near(s, i)) return;
    const v = vals[i], col = s.kind ? KCOL[s.kind] : "#a9b1bc", dash = s.kind==="rapid" ? ' stroke-dasharray="3 2"' : "";
    const x0 = X(i), xm = x0 + SLOT/2, yv = Y(v), dips = s.dips || [];
    const mk = sym && !dips.length ? tlMark(s) : null, m = mk?.[0];
    let tip = mk?.[1] || "";
    g += "<g>";
    if (sym && isBlockDel(doc[s.li] || [])){ g += `<rect x="${x0}" y="1" width="${SLOT}" height="${H-bot-1}" fill="url(#tlbd)"/>`; tip = "Block delete: skipped when / is on"; }
    if (sym && dips.length && dips.length <= 3){
      // A drilling cycle's holes, each in its share of the column: in at the start height, down on the left, up on the right
      const yt = Y(Math.min(dips[0].top, CLIP));
      if (prev!==null && Math.abs(Y(prev) - yt) > 0.5) g += `<line x1="${x0}" x2="${x0}" y1="${Y(prev)}" y2="${yt}" stroke="${KCOL.rapid}" stroke-width="1.4" stroke-dasharray="3 2"/>`;
      dips.forEach((d, k) => { g += tlHole(x0 + SLOT*k/dips.length, x0 + SLOT*(k+1)/dips.length, Y, d, CLIP); });
      tip = (TL_HOLE[dips[0].cyc] || "Drilling") + (dips[0].cyc ? ` (${dips[0].cyc})` : "") + `, to Z ${dips[0].z.toFixed(3)}`
        + (dips[0].ret > 0 && dips[0].q > 0 ? (dips[0].cyc==="G73" ? `. Backs off about ${dips[0].ret} after each peck` : `. Rapids back down to about ${dips[0].ret} above the last peck`) + " (a machine setting, so shown with a grey band)" : "");
    } else if (m==="ramp" || m==="helix"){
      g += `<line x1="${x0}" x2="${x0+SLOT}" y1="${Y(prev ?? v)}" y2="${yv}" stroke="${col}" stroke-width="2"/>`;
      if (m==="helix"){   // one flat loop per circuit, centered on the ramp; past three, a count
        const n = Math.max(1, Math.min(3, Math.round(s.turns))), rx = Math.max(2.2, SLOT/n*0.34);
        for (let k = 0; k < n; k++){ const t = (k + 0.5)/n; g += `<ellipse cx="${(x0 + SLOT*t).toFixed(1)}" cy="${(Y(prev ?? v) + (yv - Y(prev ?? v))*t).toFixed(1)}" rx="${rx.toFixed(1)}" ry="2.4" fill="#fff" stroke="${col}" stroke-width="1.2"/>`; }
        if (Math.round(s.turns) > 3) g += `<text x="${xm}" y="${Math.min(Y(prev ?? v), yv) - 4}" font-size="6.5" text-anchor="middle" fill="${col}" font-family="Consolas,monospace">×${Math.round(s.turns)}</text>`;
      }
    } else {
      if (prev!==null && Math.abs(prev - v) > 1e-9) g += `<line x1="${x0}" x2="${x0}" y1="${Y(prev)}" y2="${yv}" stroke="${col}" stroke-width="1.6"${dash}/>`;
      g += `<line x1="${x0}" x2="${x0+SLOT}" y1="${yv}" y2="${yv}" stroke="${col}" stroke-width="${s.kind?2.2:1.2}"${dash}/>`;
      // A drilling cycle with many holes on one line (a pattern): a plunge per hole
      if (mode==="z" && !lathe) dips.forEach((d, k, all) => { const x = (x0 + SLOT*(k+1)/(all.length+1)).toFixed(1);
        g += `<line x1="${x}" x2="${x}" y1="${Y(Math.min(d.top, CLIP))}" y2="${Y(d.z)}" stroke="${KCOL.cyc}" stroke-width="1.6" stroke-linecap="round"/>`; });
    }
    if (m==="M00" || m==="M01") g += `<rect x="${xm-3.5}" y="${yv-3.5}" width="7" height="7" fill="${m==="M00" ? "#2b2f36" : "#fff"}" stroke="#2b2f36" stroke-width="1.3"/>`;
    if (m==="engrave"){   // a grey box from R down to the depth
      const yz = Y(Math.min(s.engZ, CLIP)), y0 = Math.min(yv, yz), hh = Math.max(2, Math.abs(yz - yv));
      g += `<rect x="${(x0+SLOT*0.2).toFixed(1)}" y="${y0.toFixed(1)}" width="${(SLOT*0.6).toFixed(1)}" height="${hh.toFixed(1)}" fill="#b4bcc6" stroke="${KCOL.engrave}" stroke-width="1"/>`;
    }
    if (m==="dwell") g += `<circle cx="${xm}" cy="${yv}" r="3.4" fill="#fff" stroke="#2b2f36" stroke-width="1.3"/>`;
    if (m==="spindle") g += `<rect x="${xm-2.4}" y="${yv-2.4}" width="4.8" height="4.8" fill="#2b2f36" transform="rotate(45 ${xm} ${yv})"/>`;
    if (m==="tool"){
      const tw = (doc[s.li] || []).find(w => /^T\d/.test(w)), tn = tw ? "T" + parseInt(tw.slice(1)) : "T";
      g += `<line x1="${xm}" x2="${xm}" y1="${yv}" y2="11" stroke="#5b6b82" stroke-width="1.1"/><rect x="${xm-8}" y="1" width="16" height="9" rx="2" fill="#5b6b82"/><text x="${xm}" y="8" font-size="6.5" text-anchor="middle" fill="#fff" font-weight="700" font-family="Consolas,monospace">${tn}</text>`;
    }
    if (m==="home") g += `<line x1="${xm}" x2="${xm}" y1="${yv}" y2="6" stroke="${KCOL.rapid}" stroke-width="1.3" stroke-dasharray="3 2"/><path d="M${xm-4},7 L${xm},3 L${xm+4},7 M${xm-4},1.5 H${xm+4}" fill="none" stroke="#2b2f36" stroke-width="1.3"/>`;
    if (m==="end") g += `<line x1="${x0+SLOT-5}" x2="${x0+SLOT-5}" y1="3" y2="${H-bot}" stroke="#2b2f36" stroke-width="1"/><line x1="${x0+SLOT-2}" x2="${x0+SLOT-2}" y1="3" y2="${H-bot}" stroke="#2b2f36" stroke-width="2.4"/>`;
    if (tip) g += `<title>${esc(tip)}</title>`;
    g += "</g>";
    if (pos && s.v > CLIP + 1e-9 && m!=="tool" && m!=="home") g += `<text x="${X(i)+SLOT/2}" y="${Y(v)-3}" font-size="7" text-anchor="middle" fill="#9a9a9a">↑</text>`;
    const nw = doc[s.li]?.[isBlockDel(doc[s.li]) ? 1 : 0]; const lab = /^N\d+$/.test(nw||"") ? nw : "L" + (s.li+1);
    const cur = isCur(s, i);
    if (cur || i % 2 === 0) g += `<text x="${X(i)+SLOT/2}" y="${H-6}" font-size="${cur?8:6.5}" text-anchor="middle" fill="${cur?"#d13438":"#9a9a9a"}" font-weight="${cur?700:400}" font-family="Consolas,monospace">${lab}</text>`;
    prev = endOf(s, i);
    ends[i] = prev;
  });
  g += tlDot(steps, idx, sim, X, Y, mode, lathe, CLIP, vals, ends);
  if (!pos) g += `<text x="${half-6}" y="${Y(0)-3}" font-size="7.5" text-anchor="end" fill="#8a8a8a" font-family="Consolas,monospace">0</text>`;
  svg.innerHTML = g;
  document.getElementById("tlgrid").innerHTML = grid.labels;
  tlShift = -(idx*SLOT + SLOT/2);
  svg.style.transform = `translateX(${tlShift}px)`;
  const st = steps[idx], ls = st ? lineState[st.li] || {} : {};
  const at = st ? ` at ${/^N\d+$/.test(doc[st.li]?.[0]||"") ? doc[st.li][0] : "line "+(st.li+1)}` : "";
  const unit = mode==="feed" ? FEED_UNIT[ls.feed]?.[ls.units] || "" : mode==="speed" ? "rpm" : "";
  const now = !st ? "" : mode==="feed" ? `${word(numWord("F", st.f), ls).e} ${unit}` : mode==="speed" ? `${word(numWord("S", st.s), ls).e} ${unit}` : `${lathe ? "X" : "Z"} ${(lathe ? st.v*2 : st.v).toFixed(3)}` + (mode==="z" && st.dips?.length ? `, drills to Z ${st.dips[0].z.toFixed(3)}` : "");
  document.getElementById("tlh").innerHTML = `${TL_MODES[mode]} by line <span>${st ? esc(now.trim() + (P ? (st.on ? ", torch on" : ", torch off") : "") + at) : ""}</span>`;
}
document.getElementById("tl-mode").addEventListener("change", e => {
  tlMode[mtype()] = e.target.value;
  window.saveTimelineModes?.({ ...tlMode });
  drawTimeline(tlSteps, mtype()==="lathe");
});
document.getElementById("tl").addEventListener("click", e => {
  const box = e.currentTarget.getBoundingClientRect();
  const i = Math.floor((e.clientX - box.left - tlShift - box.width/2) / SLOT);
  if (tlSteps[i]) selectLine(tlSteps[i].li);
});

function simSpeed(){ return +document.getElementById("s-speed").value; }
function simLineFollow(){ simFollow(stepAtSeg(simIdx)); }
// The step that made move idx-1 (the last move drawn), or the first step before any move.
function stepAtSeg(idx){
  const st = EXEC.steps;
  if (idx <= 0) return 0;
  for (let k = 0; k < st.length; k++) if (st[k].s0 <= idx-1 && idx-1 < st[k].s1) return k;
  return st.length - 1;
}
// The editor row that shows step st (see simKey).
function simRowKey(st){
  const c = st?.calls || [];
  if (!st) return null;
  if (!c.length){ const h = foldHiding(st.li); return "m" + (h >= 0 ? h : st.li); }
  if (!expanded.has(c[0])) return "m" + c[0];
  const j = c.length > 1 ? c[1] : st.li, h = foldHiding(j, doc[c[0]]);
  return "x" + c[0] + "-" + (h >= 0 ? h : j);
}
const rowLi = key => key[0]==="m" ? +key.slice(1) : +key.split("-")[1];
// How far through its call (0 to 1) step k is, for the progress bar on a collapsed call.
// depth 0 is a call from the main program, 1 a call made inside that subprogram.
function callProgress(k, depth = 0){
  const st = EXEC.steps, deep = j => (st[j]?.calls?.length || 0) > depth; if (!deep(k)) return null;
  let a = k, b = k; while (a > 0 && deep(a-1)) a--; while (b < st.length-1 && deep(b+1)) b++;
  return (k - a + 1) / (b - a + 1);
}
const barTitle = key => callProgress(simK, key[0]==="x" ? 1 : 0)==null && foldScan().end[rowLi(key)] >= 0 ? "Running the folded moves" : "Running the subprogram this line calls";
// How far through what row "key" stands for step k is: a collapsed call (above), or a closed fold of moves, where it's
// the share of the run of steps on the fold's lines (in the same call) that are done.
function rowProgress(k, key){
  const ins = key[0]==="x", pc = callProgress(k, ins ? 1 : 0); if (pc!=null) return pc;
  const st = EXEC.steps, s = st[k]; if (!s) return null;
  const h = rowLi(key), ctx = ins ? doc[+key.slice(1).split("-")[0]] : null, F = foldScan(), e = F.end[h];
  if (e < 0 || !foldClosed(h, ctx)) return null;
  const depth = (s.calls || []).length, same = j => st[j] && st[j].li >= h && st[j].li <= e && (st[j].calls || []).length===depth;
  if (!same(k)) return null;
  let a = k, b = k; while (a > 0 && same(a-1)) a--; while (b < st.length-1 && same(b+1)) b++;
  return (k - a + 1) / (b - a + 1);
}
// Moves the editor to the row for step k, scrolling only when the row changes; the bar on a collapsed call just grows.
function simFollow(k, force){
  const st = EXEC.steps[k]; simK = st ? k : null;
  const key = simRowKey(st);
  if (key && (force || key!==simKey)){ simKey = key; curLine = rowLi(key); renderCursor(); scrollToLn(ed.querySelector(`.ln[data-key="${key}"]`)); return; }
  const bar = ed.querySelector(`.ln[data-key="${simKey}"] .xpbar i`), pr = rowProgress(k, simKey);
  if (bar && pr!=null){ touchRow(bar); bar.style.width = (pr*100).toFixed(1) + "%"; }
  drawViews();
}
// The next M00 (or M01 with optional stop on) the tool reaches between move from and move to, not yet paused at.
function nextStop(from, to){
  const k = EXEC.steps.findIndex((s, k) => (s.stop==="M00" || (s.stop==="M01" && simOpt)) && !simStops.has(k) && s.s0 >= from && s.s0 <= to);
  return k < 0 ? null : k;
}
// After the last move the simulation still reads the lines up to the program end (M05, G28, M30…), so it
// finishes on the M30 line, not on the last line that moves.
function simFinish(){
  clearInterval(simTimer); simTimer = null;
  const end = EXEC.steps[EXEC.steps.length-1];
  if (end) simFollow(EXEC.steps.length-1, true); else drawViews();
  const at = end ? (nWordOf(end.li) || "line " + (end.li+1)) : "";
  setMsg(end && isEnd(doc[end.li]) ? `Simulation finished at ${at}. ⏮ restarts it.` : "Simulation finished. ⏮ restarts it.");
}
function playSim(){
  if (editing && !commit()) return;
  if (simIdx==null || (simIdx >= EXEC.segs.length && nextStop(simIdx, simIdx)==null)){ simIdx = 0; simStops = new Set(); }
  simStopAt = null;
  clearInterval(simTimer);
  let owed = 0;   // ½× and ¼×: a move every second or fourth step
  simTimer = setInterval(() => {
    owed += simSpeed(); const n = Math.floor(owed + 1e-9); if (!n) return; owed -= n;
    const to = Math.min(EXEC.segs.length, simIdx + n), k = nextStop(simIdx, to);
    if (k!=null){
      const st = EXEC.steps[k]; simIdx = st.s0; simStops.add(k); simStopAt = k;
      clearInterval(simTimer); simTimer = null; simFollow(k, true);
      const at = nWordOf(st.li) || "line " + (st.li+1);
      setMsg(st.stop==="M00" ? `Program stop (M00) at ${at}. ▶ continues.` : `Optional stop (M01) at ${at}. ▶ continues.`);
      return;
    }
    simIdx = to;
    if (simIdx >= EXEC.segs.length) return simFinish();
    simLineFollow();
  }, 60);
  render(); setMsg("Playing. Space pauses, → steps one line.");
}
function pauseSim(){ clearInterval(simTimer); simTimer = null; drawViews(); setMsg("Paused"); }
// After stepping by hand, stops before the tool count as passed and stops after it come up again.
function resetStops(){ simStopAt = null; simStops = new Set(EXEC.steps.flatMap((s, k) => s.stop && s.s0 < simIdx ? [k] : [])); }
function togglePlay(){ simTimer ? pauseSim() : playSim(); }
function stopSim(quiet){ clearInterval(simTimer); simTimer = null; simStopAt = null; simK = simKey = null; if (simIdx!=null){ simIdx = null; if (!quiet) { render(); setMsg("Simulation closed"); } else setMsg(""); } }   // quietly: no "Playing…" left behind
function simStep(dir){
  if (editing && !commit()) return;
  if (simTimer) pauseSim();
  const st = EXEC.steps;
  if (simIdx==null) simIdx = st[stepIndexFor(curLine)]?.s1 ?? 0;
  let last = false;   // stepping past the last move goes to the program end
  if (dir > 0){ const n = st.find(s => s.s1 > s.s0 && s.s0 >= simIdx); if (n) simIdx = n.s1; else last = st.length > 0; }
  else { const ps = st.filter(s => s.s1 > s.s0 && s.s1 < simIdx); simIdx = ps.length ? ps[ps.length-1].s1 : 0; }
  resetStops(); simFollow(last ? st.length-1 : stepAtSeg(simIdx), true);
}
function simReset(){ if (simTimer) pauseSim(); simIdx = 0; simStops = new Set(); simStopAt = null; simFollow(0, true); ed.scrollTop = 0; setMsg("Back to the start. ▶ plays."); }
document.getElementById("s-play").onclick = togglePlay;
document.getElementById("s-fwd").onclick = () => simStep(1);
document.getElementById("s-back").onclick = () => simStep(-1);
document.getElementById("s-reset").onclick = simReset;
function setSimOpt(on){
  simOpt = on; document.getElementById("s-opt").setAttribute("aria-pressed", on);
  setMsg(on ? "Optional stop is on: the simulation pauses at M01 as well as M00." : "Optional stop is off: the simulation runs past M01 and pauses only at M00.");
}
function setSimBD(on){
  simBD = on; document.getElementById("s-bd").setAttribute("aria-pressed", on);
  if (simIdx!=null){ const li = curLine; EXEC = interpret(); const k = stepIndexFor(li); simIdx = EXEC.steps[k]?.s0 ?? 0; simK = k; resetStops(); }
  render();
  setMsg(on ? "Block delete is on: lines that start with / are skipped." : "Block delete is off: lines that start with / run like any other.");
}
function setSimRapids(on){
  simRapids = on; document.getElementById("s-rap").setAttribute("aria-pressed", on);
  drawViews();
  setMsg(on ? "Rapid moves are shown (dashed)." : "Rapid moves are hidden: the toolpath shows the cutting moves only.");
}
// Expanded view: the toolpath panel moves to the big area at the top left and back to the side panel.
function setSimX(on){
  simX = on;
  const panel = document.getElementById("simpanel"), v1 = document.getElementById("v1");
  document.getElementById("main").classList.toggle("simx", on);
  if (on) document.getElementById("simbig").appendChild(panel);
  else { document.getElementById("side").prepend(panel); v1.setAttribute("viewBox", "0 0 278 128"); v1.setAttribute("height", "128"); }
  if (on) v1.removeAttribute("height");
  document.getElementById("s-big").setAttribute("aria-pressed", on);
  document.getElementById("s-big").textContent = on ? "⤡" : "⤢";
  document.getElementById("s-big").title = on ? "Back to the normal view (Ctrl+Shift+E)" : "Expanded view (Ctrl+Shift+E)";
  render(); scrollToLn(ed.querySelector(`.ln[data-key="m${curLine}"]`));
  setMsg(on ? "Expanded view. Ctrl+Shift+E or ⤡ goes back." : "");
}
document.getElementById("s-opt").onclick = () => setSimOpt(!simOpt);
document.getElementById("s-bd").onclick = () => setSimBD(!simBD);
document.getElementById("s-rap").onclick = () => setSimRapids(!simRapids);
document.getElementById("s-big").onclick = () => setSimX(!simX);
// The moves still to come: greyed, hidden or shown like the rest (View menu). The toolpath button hides them, and a
// second press brings back whichever of grey or shown was picked before.
let futureShown = "grey";
function setFuture(f){
  if (f!=="hide") futureShown = f;
  future = f; document.getElementById("s-fut").setAttribute("aria-pressed", f==="hide");
  drawViews();
}
document.getElementById("s-fut").onclick = () => { setFuture(future==="hide" ? futureShown : "hide");
  setMsg(future==="hide" ? "The toolpath still to come is hidden: only the moves already run are drawn." : "The toolpath still to come is shown again."); };
window.addEventListener("resize", () => { if (simX && activeTab >= 0) drawViews(); });

document.getElementById("probs-l").addEventListener("mousedown", e => { const r = e.target.closest(".pr"); if (!r) return; e.preventDefault(); selectLine(+r.dataset.li); });
document.getElementById("probs-c").addEventListener("mousedown", e => { const b = e.target.closest(".pf"); if (!b) return; e.preventDefault(); probFilter[b.dataset.f] = !probFilter[b.dataset.f]; probsOpen = true; drawProblems(); });
function toggleProblems(open){ probsOpen = open ?? !probsOpen; drawProblems(); }
document.getElementById("probs-tg").onclick = () => toggleProblems();
document.getElementById("st-warn").onclick = () => toggleProblems(true);
function nextProblem(dir){
  const lines = [...new Set(PROBLEMS.filter(p => probFilter[p.sev]).map(p => p.li))];
  if (!lines.length){ setMsg("No problems in this file"); return; }
  const li = dir > 0 ? (lines.find(l => l > curLine) ?? lines[0]) : ([...lines].reverse().find(l => l < curLine) ?? lines[lines.length-1]);
  selectLine(li); const p = PBYLINE[li][0]; setMsg(`${p.title}: ${p.msg}`, p.sev!=="info");
}
