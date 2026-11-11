/* ---------- Running the program, for the toolpath and the timeline ---------- */
// How many straight moves draw an arc of sweep sw (radians): a full circle gets "full" of them, a part of one its share
// (at least 2). Every arc used to get the full count, so a program of short arcs had 36 moves to draw and simulate for each.
const arcSteps = (sw, full) => Math.max(2, Math.min(full, Math.ceil(Math.abs(sw)/(2*Math.PI)*full - 1e-9)));
// Runs the program for the toolpath and the Z timeline: { segs (toolpath moves), steps (one per line run), vals,
// ghosts, boxes, wraps, alarm, notes, vars, tailUsed }. Klartext has its own reader (interpretKlartext).
function interpret(){
  const ex = SYNTAX==="klartext" ? interpretKlartext() : new SimRun().run();
  ex.time = timeRun(ex);   // how long each move takes (sim-time.js)
  return ex;
}

/* One run of a Fanuc-style program, line by line, as the control would run it. The constructor sets up the run's
   state (where the tool is, the modes, the macro variables); run() goes through the lines, following jumps, calls
   and returns, and step() works out what one line does. The other methods draw what a code does: canned cycles,
   bolt patterns, engraving, Okuma lathe cycles, threading passes and ,C/,R corners. */
class SimRun {
  constructor(){
    this.lathe = mtype()==="lathe";
    this.p = {x: this.lathe ? 2 : 0, y:0, z:1}; this.mode = 0; this.dist = "abs"; this.tool = null; this.pendingT = null;
    // Canned cycles (mills): the cycle code stays on until G80 or G00-G03, Z and R carry over to the next holes,
    // and G98 returns to the Z the cycle started at, G99 to R. L0 on the cycle line stores the cycle without drilling.
    this.ret = "G98"; this.cyc = null; this.cycZ = null; this.cycR = null; this.cycD = null; this.cycQ = null;
    // Macro variables (#1, #110…), set by "#110=-0.035" lines and read by words like X-#101 and Z#110.
    // Local subprograms (M97) share them with the main program. vals keeps what each word worked out to, per run.
    this.V = {}; this.vals = {};
    // Okuma: named variables (V1, VC2, DIA1…), set by "V1=3" and read by words like X=DIA1 and IF [V2 GE V1].
    // On an Okuma lathe, G50 X/Z moves the zero (G91 G50 Z0.44 shifts it, to make the next part further along the bar),
    // so p is where the tool really is and off is the program zero's shift from where it started.
    this.okL = this.lathe && isOkuma(); this.NV = {}; this.off = { x:0, z:0 };
    this.F = null;   // the feed rate as it runs (an F#111 is only known here)
    // For the move times (sim-time.js): the spindle speed as it runs, a lathe's speed clamp (G50 S), and the
    // active canned cycle's dwell (P, in seconds).
    this.S = null; this.clamp = null; this.cycP = null;
    this.L = labels();
    this.steps = [];
    // The toolpath. Each move is mirrored and turned (xfSeg) as it goes in.
    this.segs = [];
    this.segs.push = (...a) => { a.forEach(s => { this.xfSeg(s); s.F ??= this.F; s.S ??= this.S; s.clamp ??= this.clamp; }); return Array.prototype.push.apply(this.segs, a); };
    this.noCyc = false;   // a Fagor 8055 N0 repeat: the move without the active cycle
    // ,C and ,R corners (Fanuc style): a G01 line with one waits for the next G01 move, then both are cut short and joined by
    // the chamfer or radius. ghosts are the parts of the two moves out to the sharp corner, which the tool doesn't cut.
    this.ghosts = []; this.corner = null;
    this.turns = 0;   // how many times this line's arcs go round (a helix), for the timeline
    // Engraving (Haas G47): a grey box for each character's outer bounds, not the letters. engZ is the line's depth, for the timeline.
    this.boxes = []; this.engZ = null;
    // tail is the tailstock (in, out, or null until a tailstock code runs).
    this.tail = null;
    // Mills: G68 rotation and mirror imaging (Haas G101, Fanuc G51.1). p stays where the program says, as written; each move
    // is mirrored (mir: the line each axis is mirrored about, or null) and then turned (rot: center and angle in radians)
    // as it goes into segs, so arcs, holes and engraving all follow.
    this.rot = null; this.mir = { x:null, y:null };
    // Cutter comp (G41 left, G42 right, G40 off) and its D number: D0 means no offset. Feed moves made with it carry
    // comp ("L" or "R": the side of the move the tool's centre is on), drawn as a grey band on that side.
    this.comp = null; this.compD = null;
    // Haas G107 cylindrical mapping: Y goes round the A axis. wrap is the open span, wraps the finished ones.
    this.wrap = null; this.wraps = [];
    // A code the machine can't run (an option it doesn't have): the control alarms, so the simulation stops there.
    this.alarm = null;
    // Notes for the simulation (a G68 with no R): shown while the line's effect lasts, from step k until step until.
    this.notes = []; this.rotNote = null;
    // The Variables panel: every variable the program sets or reads, in run order. Start values (the machine's common
    // values, then this program's own) are set before the first line. VUSE[key]: set = the first line that sets it,
    // early = the first line that reads it before anything has set it, hist = [step, value] each time it's set.
    this.VUSE = {}; this.okNames = new Set(); this.curLi = 0;
    this.okVars = isOkuma();
    if (this.okVars) doc.forEach(tk => tk.forEach(t => { const m = /^([A-Z][A-Z0-9]+)=/.exec(t); if (m) this.okNames.add(m[1]); }));
    for (const [k, v] of Object.entries(varSeeds())){
      if (/^#\d+$/.test(k)) this.V[+k.slice(1)] = v; else this.NV[k] = v;
      this.use(k).hist.push([-1, v]); this.VUSE[k].seed = true;
    }
  }

  // Goes through the program from the top: each line runs (step) and becomes a step for the simulation. Stops at the
  // program end or an alarm; follows GOTO, IF, WHILE, subprogram calls (up to 8 deep) and returns.
  run(){
    const steps = this.steps, segs = this.segs, stack = [];
    let i = 0, guard = 0, entering = false;
    while (i < doc.length && guard++ < 20000){
      const li = i, toks = doc[i]; this.curLi = li;
      if (simBD && isBlockDel(toks)){ i++; continue; }   // Block delete is on: the control skips "/" lines
      // A Fagor local subroutine (%L NAME … M17) only runs when it's called
      if ((/^%L /.test(toks[0] || "") || (SYNTAX==="fagor8055" && toks.some(t => /^\(SUB ?\d+\)$/.test(t)))) && !entering){
        let k = i+1;
        while (k < doc.length && !isReturn(doc[k])) k++;
        i = k+1;
        continue;
      }
      entering = false;
      // An Okuma lathe's LAP contour (G81/G82/G83 … G80) only runs from a G85/G87 line: in order, it's passed over.
      if (this.okL && toks.some(t => isCode(t,"G81") || isCode(t,"G82") || isCode(t,"G83"))){
        let k = i+1;
        while (k < doc.length && !doc[k].some(t => isCode(t,"G80"))) k++;
        i = k+1;
        continue;
      }
      // Fagor 8055: an N after the first word runs the line that many times (N0: the move without the active cycle)
      const rep = SYNTAX==="fagor8055" ? toks.find((t, k) => refN(toks, k) && /^N\d+$/.test(t)) : null, reps = rep ? parseInt(rep.slice(1), 10) : 1;
      const s0 = segs.length, dips = []; this.turns = 0; this.engZ = null;
      this.noCyc = reps===0; for (let r = 0; r < Math.max(1, Math.min(reps, 999)); r++) this.step(toks, li, false, dips); this.noCyc = false;
      const stop = toks.some(t => isCode(t, "M00")) ? "M00" : toks.some(t => isCode(t, "M01")) ? "M01" : null;
      const kind = segs.length > s0 ? (this.engZ!=null ? "engrave" : segs.slice(s0).some(sg => sg.kind==="cyc") ? "cyc" : segs[segs.length-1].kind) : null;
      const tc = this.lathe ? tailCode(toks) : null; if (tc) this.tail = tc;
      steps.push({ li, v: this.lathe ? this.p.x/2 : this.p.z, s0, s1: segs.length, kind, stop, dips, turns: this.turns, ...(this.engZ!=null ? { engZ: this.engZ } : {}), calls: stack.map(r => r - 1), tail: this.tail, ...timelineValues(li, toks), ...(this.F!=null && lineState[li]?.F && !/^F[-+]?[\d.]+$/.test(lineState[li].F) ? { f:this.F } : {}) });
      if (this.alarm){ steps[steps.length-1].alarm = this.alarm.text; this.alarm.k = steps.length - 1; break; }   // the machine stops here
      if (isEnd(toks)) break;
      const j = this.jumpFrom(toks, i); if (j!=null){ i = j; continue; }
      if (isReturn(toks) && stack.length){ i = stack.pop(); continue; }
      const tgt = callTarget(toks);
      if (tgt!=null && this.L[tgt]!==undefined && stack.length < 8){ stack.push(i+1); i = this.L[tgt]; entering = true; continue; }
      i++;
    }
    if (this.wrap) this.wraps.push({ ...this.wrap, s1: segs.length });
    if (this.rotNote) this.rotNote.until = steps.length;
    return { segs, steps, vals: this.vals, ghosts: this.ghosts, boxes: this.boxes, wraps: this.wraps, alarm: this.alarm, notes: this.notes, vars: this.VUSE, tailUsed: steps.some(s => s.tail) };
  }

  // Mirroring and rotation (mills): where a point goes, and a direction
  odd(){ return (this.mir.x!=null) !== (this.mir.y!=null); }
  xfPt(q){
    if (this.lathe || (!this.rot && this.mir.x==null && this.mir.y==null)) return q;
    let x = q.x, y = q.y;
    if (this.mir.x!=null) x = 2*this.mir.x - x; if (this.mir.y!=null) y = 2*this.mir.y - y;
    if (this.rot){
      const dx = x - this.rot.cx, dy = y - this.rot.cy, c = Math.cos(this.rot.a), s = Math.sin(this.rot.a);
      x = this.rot.cx + dx*c - dy*s;
      y = this.rot.cy + dx*s + dy*c;
    }
    return { ...q, x, y };
  }
  xfVec(v){ const o = this.xfPt({ x:v.x, y:v.y }), z = this.xfPt({ x:0, y:0 }); return { x:o.x - z.x, y:o.y - z.y }; }
  // A move as it goes into segs: mirrored and turned, and marked with the cutter comp side and the G107 wrap
  xfSeg(s){
    if (s.xf) return s; s.xf = true;
    s.a = this.xfPt(s.a); s.b = this.xfPt(s.b);
    if (s.sweep && !this.lathe){ const u = this.xfVec({ x:s.sweep.ux, y:s.sweep.uy }); s.sweep = { ...s.sweep, ux:u.x, uy:u.y }; }
    if (this.comp && this.compD!==0 && !s.rapid && (s.kind==="feed" || s.kind==="arc")) s.comp = this.odd() ? (this.comp==="L" ? "R" : "L") : this.comp;
    if (this.wrap) s.wrap = true;
    return s;
  }

  // The Variables panel's record: a variable read (before anything set it?) and set
  use(k){ return (this.VUSE[k] ||= { set:null, early:null, hist:[] }); }
  noteRead(src){
    for (const m of src.matchAll(/#(\d+)/g)){
      const n = +m[1]; if (!(n > 0 && n < 1000)) continue;
      const u = this.use("#" + n); if (!(n in this.V) && u.set==null && u.early==null) u.early = this.curLi;
    }
    if (this.okVars) for (const m of src.matchAll(/[A-Z][A-Z0-9]*/g)){
      const nm = m[0]; if (!this.okNames.has(nm) && !/^V[A-Z]*\d+$/.test(nm)) continue;
      const u = this.use(nm); if (!(nm in this.NV) && u.set==null && u.early==null) u.early = this.curLi;
    }
  }
  noteSet(k, v){ const u = this.use(k); if (u.set==null) u.set = this.curLi; u.hist.push([this.steps.length, v]); }
  // Lathe drilling cycles on center (Haas and Fanuc style G81-G89), drawn like a mill's holes along Z
  latheDrill(c){ return this.lathe && !this.okL && !SYNTAX && /^G(8[1-9]|184)$/.test(c); }

  // Okuma names become their values ("[3]"); a V name that was never set reads as 0, another name can't be worked out.
  calc(src){
    this.noteRead(src);
    src = src.replace(/[A-Z][A-Z0-9]*/g, m => m in this.NV ? (this.NV[m]==null ? "#0" : "[" + this.NV[m] + "]") : this.okL && /^V[A-Z]*\d+$/.test(m) ? "[0]" : m);
    try { const v = window.evalMacro?.(src, this.V); return typeof v==="number" && isFinite(v) ? v : null; } catch { return null; }
  }
  // "[cond] rest" → ["cond", "rest"], or [null] when the [ ] don't match
  condOf(s){
    let d = 0; if (s[0]!=="[") return [null];
    for (let k = 0; k < s.length; k++){ if (s[k]==="[") d++; if (s[k]==="]" && --d===0) return [s.slice(1, k), s.slice(k+1).trim()]; }
    return [null];
  }
  // Where a line jumps to: GOTO N90 (Okuma), IF [..] N440 (Okuma), GOTO 100 and IF [..] GOTO 100 (Fanuc), WHILE/END loops.
  jumpFrom(toks, i){
    const to = n => this.L[labelKey(n)] ?? null, toNum = e => { const v = this.calc(e); return v==null ? null : to("N" + Math.round(v)); };
    for (let k = 0; k < toks.length; k++){
      const t = toks[k];
      const fj = this.fagorJump(t, to); if (fj!==undefined) return fj;   // Fagor $GOTO, $IF, (GOTO), (IF … GOTO)
      if (t==="GOTO" && /^N/.test(toks[k+1] || "")) return to(toks[k+1]);
      if (t.startsWith("GOTO ")) return toNum(t.slice(5));
      if (/^IF\s*\[/.test(t)){
        const [cond, rest] = this.condOf(t.slice(2).trim()); if (cond==null) return null;
        if (!this.calc(cond)) return null;
        if (/^N[A-Z0-9]+$/.test(rest)) return to(rest);
        const g = /^GOTO\s*(.+)$/.exec(rest); return g ? toNum(g[1]) : null;
      }
      const wh = /^WHILE\s*(\[.*\])\s*DO\s*(\d+)$/.exec(t);
      if (wh){
        const [cond] = this.condOf(wh[1]); if (cond==null) return null;
        if (this.calc(cond)) return null;
        for (let e = i+1; e < doc.length; e++) if (doc[e].includes("END" + wh[2])) return e+1;
        return null;
      }
      const en = /^END(\d+)$/.exec(t);
      if (en){ for (let b = i-1; b >= 0; b--) if (doc[b].some(x => new RegExp("^WHILE\\b.*DO\\s*" + en[1] + "$").test(x))) return b; return null; }
    }
    return null;
  }
  // What one line does: reads its words and modes, then draws its move, cycle or pattern. inLib: a line of a
  // library subprogram run by a G65 call; dips collects the depths of the holes it drills, for the timeline.
  step(toks, li, inLib, dips){
    // A G65 call to a library subprogram runs its lines, worked out with the values on the call.
    const lib = !inLib && window.libExpandCall?.(toks, li);
    if (lib){ lib.forEach(t => this.step(t, li, true, dips)); return; }
    // The tool: a lathe's turret indexes on T, a mill's tool changes on M06
    const tt = toks.find(t => /^T\d/.test(t));
    if (tt) this.pendingT = this.lathe ? "T" + parseInt(tt.slice(1, 3)) : "T" + parseInt(tt.slice(1));
    if (this.lathe && tt) this.tool = this.pendingT;
    if (toks.some(t => isCode(t,"M06"))) this.tool = this.pendingT;
    const { w, skip, unknown, shift } = this.readWords(toks, li, inLib);
    if ("D" in w && toks.some(t => isCode(t,"G41") || isCode(t,"G42"))) this.compD = w.D;
    // A code for an option this machine doesn't have: the control alarms. Its words move the option (G152 W the
    // tailstock), never the tool, so with the option nothing moves either.
    const oc = Object.keys(DIALECT.optionCodes || {}).find(c => toks.some(t => isCode(t, c)));
    if (oc){
      const o = DIALECT.optionCodes[oc];
      if (!MACHINES[machineId]?.[o.option]) this.alarm = { li, code:oc, text:o.text, label:o.label, at:this.xfPt({...this.p}) };
      return;
    }
    if (skip || unknown) return;
    const inc = this.dist==="inc";
    if (shift){   // G50 X Z: the tool's position becomes X Z. With G91 (or U W), the zero moves by the amounts.
      for (const [a, A, I] of [["x","X","U"], ["z","Z","W"]]){
        if (A in w) this.off[a] = inc ? this.off[a] - w[A] : this.p[a] - w[A];
        if (I in w) this.off[a] -= w[I];
      }
      return;
    }
    const T = this.tool || "T?", has = c => toks.some(t => isCode(t, c));
    if (!this.lathe && this.millSetting(w, has, li, T, dips)) return;
    if (!this.lathe && DIALECT.engrave && has(DIALECT.engrave.code)){ this.engrave(w, toks, li, T, inc); return; }
    if (this.okL && (has("G85") || has("G87"))){ this.lap(has("G87"), toks.find((t, k) => k > 0 && /^N[A-Z]/.test(t)), w, li, T); return; }
    // Fagor 8055: a pattern machines the active cycle at more points, G66 runs a pocket from its profile, G79 changes the cycle's words
    const cwc = !this.lathe && toks.map(t => /^G\d/.test(t) ? pad2(t) : null).find(k => k && DIALECT.codeWords?.[k]);
    if (cwc){ if (DIALECT.codeWords[cwc].needsCycle) this.pattern(cwc, w, toks, li, T, dips); else if (cwc==="G66") this.pocket(w, li, T, dips); return; }
    if (has("G79") && (DIALECT.noMoveCodes || []).includes("G79")){ if (this.cyc) this.cycWords(w, {...this.p}); return; }
    // Fagor 8055 lathe cycles: each runs where it's written, from its start point X Z, and ends back at the call point
    const flc = this.lathe && (SYNTAX==="fagor8055" || SYNTAX==="fagor8060") && toks.map(t => /^G\d/.test(t) ? pad2(t) : null).find(k => k && DIALECT.cycles?.[k]);
    if (flc){ this.fagorLathe(flc, w, li, T, dips); return; }
    if (!("X" in w || "Y" in w || "Z" in w || "U" in w || "W" in w)) return;
    const n = { x: "U" in w ? this.p.x + w.U : ("X" in w ? (inc ? this.p.x + w.X : w.X + this.off.x) : this.p.x),
                y: "Y" in w ? (inc ? this.p.y + w.Y : w.Y) : this.p.y,
                z: "W" in w ? this.p.z + w.W : ("Z" in w ? (inc ? this.p.z + w.Z : w.Z + this.off.z) : this.p.z) };
    if (this.okL && has("G74")){ this.groove(n, w, li, T); return; }
    if (this.okL && has("G73")){ this.grooveX(n, w, li, T); return; }
    if (this.okL && (has("G77") || has("G78"))){ this.tapZ(n, w, li, T); return; }
    if (this.okL && has("G71") && "H" in w){
      this.threadPasses(n, this.okumaThreadDepths(w, toks), 2*(w.I || 0), li, T, this.okumaThreadFlank(w, toks));
      return;
    }
    if (this.lathe && !SYNTAX && has("G76") && DIALECT.cycles?.G76?.requires?.includes("K") && "K" in w){
      this.threadPasses(n, this.haasThreadDepths(w), 2*(w.I || 0), li, T, null);
      return;
    }
    if (this.cyc && !this.noCyc){
      this.cycWords(w, n);
      if (w.L===0){   // stored for the holes that follow, nothing drilled here; the tool goes over to X Y (a bolt circle's center)
        if (!this.lathe && Math.hypot(n.x - this.p.x, n.y - this.p.y) > 1e-9){
          const b = { x:n.x, y:n.y, z:this.p.z };
          this.segs.push({ a:{...this.p}, b, rapid:true, kind:"rapid", li, tool:T });
          this.p = b;
        }
        return;
      }
      this.hole(n, li, T, dips); return;
    }
    this.move(n, w, toks, li, inLib, T);
  }

  // A line's words as numbers ({ X:1.5, F:20 }), with macro variables worked out and set, and the modes its G codes
  // set (motion, distance, return plane, cutter comp, canned cycle). skip: a line that doesn't move the tool (G28, G53,
  // G04, M97/M98 calls…); unknown: a position that can't be worked out; shift: a lathe zero shift (G50).
  readWords(toks, li, inLib){
    const w = {};
    let skip = false, unknown = false, shift = false;
    toks.forEach((t, idx) => {
      if (isComment(t) || skip) return;
      if (t[0]==="#"){
        const m = /^#(\d+)=(.+)$/.exec(t);
        if (m){ const v = this.calc(m[2]); this.V[+m[1]] = v; if (+m[1] > 0 && +m[1] < 1000) this.noteSet("#" + m[1], v); }
        return;
      }
      const nm = /^([A-Z][A-Z0-9]+)=(.+)$/.exec(t); if (nm){ const v = this.calc(nm[2]); this.NV[nm[1]] = v; if (this.okVars) this.noteSet(nm[1], v); return; }
      if (SYNTAX==="fagor8055" && t[0]==="("){ this.fagorParams(t); return; }   // (P1 = 2, P2 = P1*3)
      if (isMacroTok(t)) return;
      const k = t[0];
      let v = parseFloat(t.slice(1));
      // X1 with no decimal point is the smallest increment (0.0001 in) on Fanuc-style controls, as the gloss row shows
      const nums = DIALECT.numbers;
      if (nums?.noDecimal==="leastIncrement" && nums.words.includes(k) && /^[-+]?\d+$/.test(t.slice(1)) && !(k==="Q" && lineState[li]?.cycleCode && DIALECT.cycles?.[lineState[li].cycleCode]?.labels?.includes("Q")))
        v *= nums.increment[lineState[li]?.units || "inch"];
      if (isVarVal(t)){
        v = this.calc(t.slice(1).replace(/^=/, ""));
        if (!inLib){
          const key = li + ":" + idx, list = (this.vals[key] ||= []);
          if (!list.some(x => x===v || (x!=null && v!=null && Math.abs(x - v) < 1e-9))) list.push(v);
        }
        if (v==null){ if ("XYZUWIJKR".includes(k)) unknown = true; return; }
      }
      if (k==="G"){ if ([0,1,2,3].includes(v)){
        this.mode = v;
        this.cyc = null;
      } if ((DIALECT.modalGroups?.distance || []).includes(pad2(t))) this.dist = isIncCode(pad2(t)) ? "inc" : "abs"; if (!this.lathe && (v===98 || v===99)) this.ret = "G"+v;
        if (v===80) this.cyc = null;
        if (v===40) this.comp = null; if (v===41) this.comp = "L"; if (v===42) this.comp = "R";
        if ((!this.lathe || this.latheDrill(pad2(t))) && DIALECT.cycles?.[pad2(t)]){
          if (this.cyc==null){ this.cycZ = this.p.z; this.cycR = this.cycD = this.cycQ = this.cycP = null; }
          this.cyc = pad2(t);
        }
        if (this.lathe && pad2(t)===coordSetCode()){ shift = true; return; }   // a spindle clamp (G50 S, or G92 S in systems B and C), or with X/Z a zero shift
        if (v===28||v===53||v===50||v===4||(v===65 && !DIALECT.codeWords?.G65)){ skip = true; return; } }
      else if (k==="M" && (v===97 || v===98)) skip = true;
      else if (!isNaN(v)) w[k] = v;
    });
    if (!skip && "F" in w) this.F = w.F;
    if ("S" in w){ if (this.lathe && toks.some(t => isCode(t, clampCode()))) this.clamp = w.S; else this.S = w.S; }
    return { w, skip, unknown, shift };
  }

  // Mill settings that move nothing themselves, and the patterns that run a whole set of moves from one line:
  // mirror imaging, rotation, G107 cylindrical mapping, bolt patterns and circular pockets. True when the line was one.
  millSetting(w, has, li, T, dips){
    const M = DIALECT.mirror, R = DIALECT.rotate, C = DIALECT.cylMap, gs = o => Object.keys(o || {}).find(c => /^G\d/.test(c) && has(c));
    if (M?.on && has(M.on)){ for (const a of ["x", "y"]) if (a.toUpperCase() in w) this.mir[a] = M.about==="value" ? w[a.toUpperCase()] : 0; return true; }
    if (M?.off && has(M.off)){
      const ax = ["x", "y"].filter(a => a.toUpperCase() in w);
      (ax.length ? ax : ["x", "y"]).forEach(a => this.mir[a] = null);
      return true;
    }
    if (R?.on && has(R.on)){
      const [ca, cb] = R.center || ["X", "Y"], an = R.angle || "R";
      this.rot = { cx: ca in w ? w[ca] : this.p.x, cy: cb in w ? w[cb] : this.p.y, a: (w[an] || 0)*Math.PI/180 };
      if (this.rotNote) this.rotNote.until = this.steps.length;
      this.rotNote = null;
      if (!(an in w)){
        this.rotNote = { li, k:this.steps.length, until:null, short:`${R.on}: no ${an}, not turned`, text:`${R.on} has no ${an}: the angle isn't in the program${DIALECT.rotate?.setting ? ` (it comes from ${DIALECT.rotate.setting})` : ""}, so the toolpath isn't turned` };
        this.notes.push(this.rotNote);
      }
      return true;
    }
    if (R?.off && has(R.off)){ this.rot = null; if (this.rotNote){ this.rotNote.until = this.steps.length + 1; this.rotNote = null; } }
    if (C?.code && has(C.code)){   // G107 with words turns the mapping on; G107 alone turns it off. Nothing moves.
      if (this.wrap){ this.wraps.push({ ...this.wrap, s1: this.segs.length }); this.wrap = null; }
      if (Object.keys(w).some(k => k!=="F")) this.wrap = { li, s0: this.segs.length, d: Math.abs(w[C.diameter || "Q"] ?? 0) };
      return true;
    }
    const bp = gs(DIALECT.boltPatterns);
    if (bp){ this.bolt(DIALECT.boltPatterns[bp], w, this.dist==="inc", li, T, dips); return true; }
    const cp = gs(DIALECT.circlePockets);
    if (cp){ this.circPocket(DIALECT.circlePockets[cp]==="cw", w, this.dist==="inc", li, T); return true; }
    return false;
  }

  // A move to n at the motion mode's kind: a straight line (G00, G01, which may end in a ,C or ,R corner) or an arc (G02, G03).
  move(n, w, toks, li, inLib, T){
    const kind = (inLib ? null : this.lathe ? lineKind(li) : null) || (this.mode===0 ? "rapid" : (this.mode===2 || this.mode===3) ? "arc" : "feed");
    if (!this.lathe && (this.mode===2 || this.mode===3)){
      let cx = this.p.x + (w.I||0), cy = this.p.y + (w.J||0);
      if (!("I" in w) && !("J" in w) && w.R){   // by radius: the center is R from both ends (minus R: the longer way round)
        const dx = n.x - this.p.x;
        const dy = n.y - this.p.y;
        const ch = Math.hypot(dx, dy);
        const d = Math.sqrt(Math.max(0, w.R*w.R - ch*ch/4));
        const s = (this.mode===2 ? -1 : 1)*(w.R < 0 ? -1 : 1);
        if (ch > 1e-9){ cx = (this.p.x + n.x)/2 - s*d*dy/ch; cy = (this.p.y + n.y)/2 + s*d*dx/ch; }
      }
      const rr = Math.hypot(this.p.x-cx, this.p.y-cy);
      const a0 = Math.atan2(this.p.y-cy, this.p.x-cx), a1 = Math.atan2(n.y-cy, n.x-cx);
      let sw = a1 - a0; if (this.mode===3){ if (sw <= 0) sw += 2*Math.PI; } else { if (sw >= 0) sw -= 2*Math.PI; }
      this.turns += Math.abs(sw)/(2*Math.PI);
      let q = {...this.p};
      const ns = arcSteps(sw, 36);
      for (let s = 1; s <= ns; s++){
        const a = a0 + sw*s/ns;
        const nn = {x:cx+rr*Math.cos(a), y:cy+rr*Math.sin(a), z:this.p.z+(n.z-this.p.z)*s/ns};
        this.segs.push({a:q, b:nn, rapid:false, kind:"arc", li, tool:T});
        q = nn;
      }
    } else if (this.lathe && (this.mode===2 || this.mode===3)){
      let q = this.p;
      for (const pt of this.arcPts(this.p, n, w, this.mode)){ this.segs.push({a:{...q}, b:pt, rapid:false, kind, li, tool:T}); q = pt; }
    }
    else {
      const sg = {a:{...this.p}, b:n, rapid: this.mode===0, kind, li, tool:T};
      if (this.corner && this.mode===1 && this.corner.seg===this.segs.length-1) this.cornerTo(sg);
      this.corner = null;
      this.segs.push(sg);
      const cw = this.mode===1 && toks.find(t => /^,[CR][-+]?[\d.]/.test(t)), size = cw ? parseFloat(cw.slice(2)) : 0;
      if (size > 0) this.corner = { seg: this.segs.length-1, round: cw[1]==="R", size, li };
    }
    this.p = n;
  }
  // Joins the move waiting for its corner (segs[corner.seg]) to the move sg: each is cut short of the sharp corner,
  // by the chamfer size or by where the radius touches it, and the chamfer line or the radius goes between.
  // Worked out with X as a radius on a lathe, so a ,C0.05 is 0.05 along each side.
  cornerTo(sg){
    const A = this.segs[this.corner.seg], k = this.lathe ? 0.5 : 1;
    const sub = (a, b) => ({ x:(a.x-b.x)*k, y:a.y-b.y, z:a.z-b.z }), len = v => Math.hypot(v.x, v.y, v.z);
    const d1 = sub(A.b, A.a), d2 = sub(sg.b, sg.a), l1 = len(d1), l2 = len(d2);
    if (l1 < 1e-9 || l2 < 1e-9) return;
    const u1 = { x:d1.x/l1, y:d1.y/l1, z:d1.z/l1 }, u2 = { x:d2.x/l2, y:d2.y/l2, z:d2.z/l2 };
    const cos = Math.max(-1, Math.min(1, u1.x*u2.x + u1.y*u2.y + u1.z*u2.z)), turn = Math.acos(cos);
    if (turn < 1e-6 || turn > Math.PI - 1e-6) return;   // a straight line on, or straight back: no corner to cut
    const cut = this.corner.round ? this.corner.size * Math.tan(turn/2) : this.corner.size;
    if (cut > l1 + 1e-9 || cut > l2 + 1e-9) return;   // bigger than the moves: the control alarms; drawn sharp
    const P = A.b, at = (u, t) => ({ x:P.x + u.x*t/k, y:P.y + u.y*t, z:P.z + u.z*t });
    const q1 = at(u1, -cut), q2 = at(u2, cut);
    this.ghosts.push({ a:q1, b:{...P}, li:A.li }, { a:{...P}, b:q2, li:sg.li });
    A.b = q1; sg.a = q2;
    if (!this.corner.round){ this.segs.push({ a:{...q1}, b:{...q2}, rapid:false, kind:A.kind, li:A.li, tool:A.tool }); return; }
    // The radius: its center is the radius away from q1, square to the first move, toward the second
    const pn = { x:u2.x - cos*u1.x, y:u2.y - cos*u1.y, z:u2.z - cos*u1.z }, pl = len(pn), r = this.corner.size;
    const nv = { x:pn.x/pl, y:pn.y/pl, z:pn.z/pl };
    const v0 = { x:-nv.x*r, y:-nv.y*r, z:-nv.z*r }, c = { x:q1.x*k - v0.x, y:q1.y - v0.y, z:q1.z - v0.z };
    const v1 = { x:q2.x*k - c.x, y:q2.y - c.y, z:q2.z - c.z }, sn = Math.sin(turn), N = Math.max(4, Math.ceil(turn/(Math.PI/36)));
    let q = {...q1};
    for (let s = 1; s <= N; s++){
      const t = s/N, f0 = Math.sin((1-t)*turn)/sn, f1 = Math.sin(t*turn)/sn;
      const b = s===N ? {...q2} : { x:(c.x + v0.x*f0 + v1.x*f1)/k, y:c.y + v0.y*f0 + v1.y*f1, z:c.z + v0.z*f0 + v1.z*f1 };
      this.segs.push({ a:q, b, rapid:false, kind:A.kind, li:A.li, tool:A.tool }); q = b;
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
  engrave(w, toks, li, T, inc){
    const E = DIALECT.engrave, cm = toks.find((t, k) => k > 0 && t[0]==="(");
    const text = cm ? cm.slice(1).replace(/\)$/, "") : "", h = w.J*(DIALECT.engrave.charHeight ?? 1);
    const x0 = "X" in w ? (inc ? this.p.x + w.X : w.X) : this.p.x, y0 = "Y" in w ? (inc ? this.p.y + w.Y : w.Y) : this.p.y;
    const r = "R" in w ? w.R : this.p.z, z = "Z" in w ? w.Z : r;
    const go = (b, rapid, kind, extra) => {
      if (Math.hypot(b.x - this.p.x, b.y - this.p.y, b.z - this.p.z) < 1e-9) return;
      this.segs.push({ a:{...this.p}, b, rapid, kind, li, tool:T, ...extra });
      this.p = b;
    };
    if (!(w.J > 0) || !text.trim()){ go({ x:x0, y:y0, z:this.p.z }, true, "rapid"); return; }
    const an = (w.I || 0)*Math.PI/180, c = Math.cos(an), sn = Math.sin(an);
    const at = (u, v, zz) => ({ x:x0 + u*c - v*sn, y:y0 + u*sn + v*c, z:zz });
    let len = (E.charWidth ?? 1)*w.J*[...text].length, exact = false;
    const nx = inc ? null : this.nextEngrave(li);
    if (nx && nx.P===1 && Math.abs(nx.J - w.J) < 1e-6 && Math.abs((nx.I || 0) - (w.I || 0)) < 1e-6){
      const dx = (nx.X ?? x0) - x0, dy = (nx.Y ?? y0) - y0, u = dx*c + dy*sn, v = -dx*sn + dy*c;
      if (u > 1e-6 && Math.abs(v) < 1e-4){ len = u; exact = true; }
    }
    go({ x:x0, y:y0, z:this.p.z }, true, "rapid");
    if (this.p.z > r) go({ x:x0, y:y0, z:r }, true, "rapid");
    const s0 = this.segs.length, sweep = { h, ux:-sn, uy:c };
    go(at(0, 0, z), false, "engrave", { sweep });
    const n = Math.max(4, Math.min(60, [...text].length * 2));
    for (let k = 1; k <= n; k++) go(at(len*k/n, 0, z), false, "engrave", { sweep });
    this.boxes.push({ li, text, exact, s0, s1: this.segs.length, pts: [[0, 0], [len, 0], [len, h], [0, h]].map(([u, v]) => this.xfPt(at(u, v, z))) });
    go(at(len, 0, r), true, "rapid");
    this.engZ = z;
  }
  // The next line's G47 words (X Y J I P), when the next line with words is a G47 with plain numbers for them.
  nextEngrave(li){
    for (let k = li + 1; k < doc.length; k++){
      const t = doc[k].filter(x => !isComment(x) && !/^N\d+$/.test(x) && x!=="/");
      if (!t.length) continue;
      if (!t.some(x => isCode(x, DIALECT.engrave.code))) return null;
      const o = {};
      for (const x of t){
        const m = /^([XYJIP])([-+]?(?:\d+\.?\d*|\.\d+))$/.exec(x);
        if (m) o[m[1]] = parseFloat(m[2]); else if (/^[XYJIP]/.test(x)) return null;
      }
      return o.J > 0 ? o : null;
    }
    return null;
  }
  // A canned cycle's words on this line: where the hole starts (R) and ends (Z)
  cycWords(w, n){
    if (DIALECT.cycleRefZ){   // Fagor: Z is the reference plane and I the depth (G83: I is each peck, J of them)
      if ("Z" in w) this.cycR = w.Z;
      if ("I" in w) this.cycD = this.cyc==="G83" && "J" in w ? (this.cycR ?? this.p.z) + w.I * w.J : w.I;
      if (this.cyc==="G83" && "I" in w && "J" in w) this.cycQ = Math.abs(w.I);
      n.z = this.p.z;
    } else {
      if ("R" in w) this.cycR = w.R;
      if ("Z" in w) this.cycD = n.z;
      if ("Q" in w) this.cycQ = Math.abs(w.Q);
    }
    // A dwell at the bottom (G82, G89…: P, in milliseconds when it has no decimal point on Haas and Fanuc)
    const def = DIALECT.cycles?.[this.cyc], pt = (doc[this.curLi] || []).find(t => /^P[-+]?(\d+\.?\d*|\.\d+)$/.test(t));
    if (pt && def && [...(def.requires || []), ...(def.optional || [])].includes("P") && DIALECT.cycleRefZ==null)
      this.cycP = !pt.includes(".") && DIALECT.dwellNoDecimal==="ms" ? parseFloat(pt.slice(1))/1000 : parseFloat(pt.slice(1));
  }
  // A hole: over to X Y at the current height (rapid, or along via), rapid down to R, feed to the bottom, back up to R or the start.
  hole(n, li, T, dips, via){
    const r = this.cycR ?? 0.1, z = this.cycD ?? n.z, back = this.ret==="G99" ? r : Math.max(this.cycZ ?? r, r);
    if (via){
      let q = {...this.p};
      for (const v of via){ const b = { x:v.x, y:v.y, z:this.p.z }; this.segs.push({a:q, b, rapid:false, kind:"feed", li, tool:T}); q = b; }
    }
    else this.segs.push({a:{...this.p}, b:{x:n.x, y:n.y, z:this.p.z}, rapid:true, kind:"rapid", li, tool:T});
    if (this.p.z > r) this.segs.push({a:{x:n.x, y:n.y, z:this.p.z}, b:{x:n.x, y:n.y, z:r}, rapid:true, kind:"rapid", li, tool:T});
    this.segs.push({a:{x:n.x, y:n.y, z:r}, b:{x:n.x, y:n.y, z}, rapid:false, kind:"cyc", li, tool:T, hole:true, cyc:this.cyc, q:this.cycQ, dw:this.cycP});
    this.segs.push({a:{x:n.x, y:n.y, z}, b:{x:n.x, y:n.y, z:back}, rapid:true, kind:"rapid", li, tool:T});
    const pr = DIALECT.peckRetract?.[this.cyc];
    dips.push({ top: Math.max(this.p.z, r), r, z, back, cyc: this.cyc, q:this.cycQ, ...(pr ? { ret: pr[lineState[li]?.units==="mm" ? "mm" : "inch"] } : {}) });
    this.p = {x:n.x, y:n.y, z:back};
  }
  // Haas bolt hole patterns, each hole drilled with the active canned cycle (or just visited without one), about the
  // current position or X Y on the line: G70 a circle (I radius, minus for clockwise; J start angle; L holes), G71 an arc
  // (K the angle between holes), G72 a line (I apart, at angle J, starting I from the start position).
  bolt(kind, w, inc, li, T, dips){
    const c = { x: "X" in w ? (inc ? this.p.x + w.X : w.X) : this.p.x, y: "Y" in w ? (inc ? this.p.y + w.Y : w.Y) : this.p.y };
    const n = Math.max(0, Math.min(1000, Math.round(w.L ?? 1))), R = Math.PI/180, I = w.I || 0, J = w.J || 0, pts = [];
    if (kind==="line") for (let k = 1; k <= n; k++) pts.push({ x:c.x + k*I*Math.cos(J*R), y:c.y + k*I*Math.sin(J*R) });
    else {
      const st = kind==="circle" ? Math.sign(I || 1)*360/(n || 1) : (w.K || 0);
      for (let k = 0; k < n; k++){ const a = (J + k*st)*R; pts.push({ x:c.x + Math.abs(I)*Math.cos(a), y:c.y + Math.abs(I)*Math.sin(a) }); }
    }
    for (const q of pts){
      if (this.cyc && !this.noCyc) this.hole({ x:q.x, y:q.y, z:this.p.z }, li, T, dips);
      else { const b = { x:q.x, y:q.y, z:this.p.z }; this.segs.push({ a:{...this.p}, b, rapid:true, kind:"rapid", li, tool:T }); this.p = b; }
    }
    // The pattern ends back at its center (#72): the next G70 with no X Y uses the same center, not the last hole.
    if (pts.length && Math.hypot(this.p.x - c.x, this.p.y - c.y) > 1e-9){
      const b = { x:c.x, y:c.y, z:this.p.z }; this.segs.push({ a:{...this.p}, b, rapid:true, kind:"rapid", li, tool:T }); this.p = b;
    }
  }
  // Haas G12 (clockwise) / G13 (counterclockwise) circular pocket about the current position: down to Z, then a full circle
  // at each radius from I out to K in steps of Q, L times (G91: Z deeper each time), and back to the center. The circles
  // are the pocket's edge; the tool's centre runs inside them (the G42 side for G12, G41 for G13) unless D is D0.
  circPocket(cw, w, inc, li, T){
    const c = { x: "X" in w ? (inc ? this.p.x + w.X : w.X) : this.p.x, y: "Y" in w ? (inc ? this.p.y + w.Y : w.Y) : this.p.y };
    const I = Math.abs(w.I || 0), K = "K" in w ? Math.abs(w.K) : null, Q = Math.abs(w.Q || 0), rs = [];
    if (K!=null && Q > 0){ for (let r = I || Q; r < K - 1e-9 && rs.length < 200; r += Q) rs.push(r); rs.push(K); } else rs.push(K ?? I);
    const loops = Math.max(1, Math.min(50, Math.round(w.L || 1))), save = { comp: this.comp, compD: this.compD };
    if ("D" in w) this.compD = w.D;
    const go = (b, kind, rapid) => { this.segs.push({ a:{...this.p}, b, rapid:!!rapid, kind, li, tool:T }); this.p = b; };
    if (Math.hypot(this.p.x - c.x, this.p.y - c.y) > 1e-9) go({ x:c.x, y:c.y, z:this.p.z }, "rapid", true);
    let z = this.p.z;
    for (let l = 0; l < loops; l++){
      if ("Z" in w) z = inc ? z + w.Z : w.Z;
      this.comp = null; go({ x:c.x, y:c.y, z }, "feed");
      for (const r of rs.filter(r => r > 0)){
        this.comp = null; go({ x:c.x + r, y:c.y, z }, "feed");
        this.comp = cw ? "R" : "L";
        for (let s = 1; s <= 48; s++){ const a = (cw ? -1 : 1)*2*Math.PI*s/48; go({ x:c.x + r*Math.cos(a), y:c.y + r*Math.sin(a), z }, "arc"); }
        this.turns += 1;
      }
      this.comp = null; go({ x:c.x, y:c.y, z }, "feed");
    }
    this.comp = save.comp; this.compD = save.compD;
  }
  // A lathe arc from a to b (X as a diameter), by its radius (R, or L on Okuma) or its center (I for X as a radius, K for Z).
  // Drawn with Z across and X up, where G02 goes clockwise.
  arcPts(a, b, w, m){
    const A = { u:a.z, v:a.x/2 }, B = { u:b.z, v:b.x/2 }, r = w[DIALECT.arcRadius || "R"] ?? w.R;
    let C;
    if (r!=null){
      const du = B.u - A.u, dv = B.v - A.v, ch = Math.hypot(du, dv); if (ch < 1e-9) return [{...b}];
      const d = Math.sqrt(Math.max(0, r*r - ch*ch/4)), side = (m===2 ? 1 : -1) * (r < 0 ? -1 : 1);
      C = { u:(A.u + B.u)/2 + side*d*dv/ch, v:(A.v + B.v)/2 - side*d*du/ch };
    } else C = { u:A.u + (w.K || 0), v:A.v + (w.I || 0) };
    const rr = Math.hypot(A.u - C.u, A.v - C.v), a0 = Math.atan2(A.v - C.v, A.u - C.u), a1 = Math.atan2(B.v - C.v, B.u - C.u);
    let sw = a1 - a0; if (m===3){ if (sw <= 0) sw += 2*Math.PI; } else { if (sw >= 0) sw -= 2*Math.PI; }
    const ns = arcSteps(sw, 24), out = [];
    for (let s = 1; s < ns; s++){
      const an = a0 + sw*s/ns;
      out.push({ x:2*(C.v + rr*Math.sin(an)), y:0, z:C.u + rr*Math.cos(an), arc:true });
    }
    out.push({ ...b, arc:true }); return out;
  }
  // Haas one-line G76: K thread height and D first pass (radius). P3/P4 cut D each pass; P1/P2 (the default) keep the
  // amount cut the same, so pass n is at √n × D. Depths returned as diameters.
  haasThreadDepths(w){
    const K = Math.abs(w.K), D = Math.abs(w.D || 0) || K, out = [], even = w.P===3 || w.P===4;
    for (let k = 1; out.length < 200; k++){ const d = even ? k*D : Math.sqrt(k)*D; if (d >= K - 1e-9) break; out.push(2*d); }
    out.push(2*K);
    return { H: 2*K, depths: out };
  }
  // A one-line threading cycle (Okuma G71, Haas G76), drawn pass by pass: from the start point, in to each pass's depth
  // (shifted along Z for an angled infeed), along the thread to the end Z, out, and back to the start. The last pass is
  // at the finished diameter X on the line; the first at the top of the thread, H (a diameter) toward the start point.
  // taper is the diameter at the start Z less the one at the end.
  threadPasses(n, { H, depths }, taper, li, T, flank){
    const S = {...this.p}, dir = Math.sign(S.x - n.x) || 1, at = (x, z) => ({ x, y:0, z });
    const top0 = n.x + taper + dir*H, top1 = n.x + dir*H, zd = Math.sign(n.z - S.z) || -1;
    let q = S; const go = (b, rapid, kind) => { this.segs.push({ a:{...q}, b, rapid, kind: rapid ? "rapid" : kind || "cyc", li, tool:T }); q = b; };
    depths.forEach((d, k) => {
      const zs = S.z - zd*(flank ? flank(d, k) : 0);
      go(at(S.x, zs), true); go(at(top0 - dir*d, zs), true);
      go(at(top1 - dir*d, n.z), false); go(at(S.x, n.z), true);
    });
    go(S, true); this.p = S;
  }
}

// A lathe line's tailstock code: "in" (advance, quill forward or extend), "out" (retract or back), or null.
// Read from the dictionary's descriptions for this machine, so each control's own codes count.
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
