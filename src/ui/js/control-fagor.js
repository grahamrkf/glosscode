/* ---------- Fagor 8055 and 8060/8065 ----------
   The simulation of what only Fagor programs have: parameters and jumps, 8055 patterns that repeat the active cycle at more points, G66
   pockets from a profile, and the lathe cycles, which run where they are written and end back at the call point.
   They are methods of SimRun (run-program.js), added here. */
Object.assign(SimRun.prototype, {
  // Fagor 8055: (P1 = 2, P2 = P1*3) sets each parameter in turn
  fagorParams(t){
    const inner = t.slice(1, -1); let d = 0, from = 0; const parts = [];
    for (let k = 0; k <= inner.length; k++){ const ch = inner[k]; if (ch==="(") d++; else if (ch===")") d--; else if ((ch==="," && !d) || k===inner.length){ parts.push(inner.slice(from, k)); from = k+1; } }
    for (const a of parts){ const m = /^\s*(P\d+)\s*=(.+)$/.exec(a); if (m) this.NV[m[1]] = this.calc(m[2].replace(/\(/g, "[").replace(/\)/g, "]")); }
  },
  // Where a Fagor jump goes (to: the line of a label), null when its condition is false, undefined when t isn't one:
  // $GOTO N10 or $GOTO [NAME], $IF [cond] $GOTO N40 (== != >= <= > < compare, * is AND, + is OR), and on the 8055
  // (GOTO N10) and (IF (P1 EQ 2) GOTO N40), whose ( ) become [ ] for the condition.
  fagorJump(t, to){
    const fg = /^(?:\$IF (.+?) )?\$GOTO (N\d+|\[\w+\])$/.exec(t);
    if (fg){
      if (fg[1]!=null){ const v = this.calc(fg[1].replace(/==/g, " EQ ").replace(/!=/g, " NE ").replace(/>=/g, " GE ").replace(/<=/g, " LE ").replace(/>/g, " GT ").replace(/</g, " LT ").replace(/\]\s*\*\s*\[/g, "] AND [").replace(/\]\s*\+\s*\[/g, "] OR [")); if (!v) return null; }
      return to(fg[2]);
    }
    const f5 = /^\((?:IF (.+?) )?GOTO (N\d+)\)$/.exec(t);
    if (f5){
      if (f5[1]!=null){ const v = this.calc(f5[1].replace(/\(/g, "[").replace(/\)/g, "]")); if (!v) return null; }
      return to(f5[2]);
    }
    return undefined;
  },
  // Fagor 8055 multiple machining (G60-G65): the points after point 0 (where the tool is, already machined by the cycle line),
  // less the ones P to V skip (P5, or P10.013 for points 10 to 13), each machined with the active cycle.
  pattern(code, w, toks, li, T, dips){
    const R = Math.PI/180, P0 = {...this.p}, pts = [];
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
      if (this.cyc && !this.noCyc) this.hole({ x:q.x, y:q.y, z:this.p.z }, li, T, dips, via);
      else { const b = { x:q.x, y:q.y, z:this.p.z }; this.segs.push({a:{...this.p}, b, rapid:!via, kind: via ? "feed" : "rapid", li, tool:T}); this.p = b; }
    });
  },
  // Fagor 8055 G66 irregular pocket: the profile (the lines from label S to label E) is traced as the outline, then back to the start.
  pocket(w, li, T, dips){
    const kS = this.L[labelKey("N" + w.S)], kE = this.L[labelKey("N" + w.E)];
    if (w.S==null || w.E==null || kS===undefined || kE===undefined || kE < kS) return;
    const save = { p:{...this.p}, mode: this.mode, cyc: this.cyc, dist: this.dist }; this.cyc = null;
    for (let k = kS; k <= kE; k++) this.step(doc[k], k, true, dips);
    this.segs.push({a:{...this.p}, b:{...save.p}, rapid:true, kind:"rapid", li, tool:T});
    this.p = save.p; this.mode = save.mode; this.cyc = save.cyc; this.dist = save.dist;
  },
  // A Fagor 8055 or 8060/8065 lathe cycle, drawn simply: the roughing or grooving passes, the thread passes, the drilled hole, or the profile.
  // X is a diameter, as everywhere in the lathe view. Curved turning and facing (G84, G85) are drawn with straight passes.
  fagorLathe(code, w, li, T, dips){
    code = { G160:"G60", G161:"G61", G162:"G62", G163:"G63" }[code] || code;   // the 8060/8065 live tool cycles
    const S0 = {...this.p}, A = { x: w.X ?? this.p.x, y:0, z: w.Z ?? this.p.z }, E = { x: w.Q ?? A.x, z: w.R ?? A.z };
    let at = S0;
    const go = (b, rapid) => { const nb = { x:b.x, y:0, z:b.z }; this.segs.push({ a:{...at}, b:nb, rapid, kind: rapid ? "rapid" : "cyc", li, tool:T }); at = nb; };
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
      const kS = this.L[labelKey("N" + w.S)], kE = this.L[labelKey("N" + w.E)];
      if (w.S!=null && w.E!=null && kS!==undefined && kE!==undefined && kE >= kS){
        const save = { mode: this.mode, dist: this.dist }; this.p = {...A}; this.mode = 1;
        for (let k = kS; k <= kE; k++){ const s0 = this.segs.length; this.step(doc[k], k, true, dips); for (let q = s0; q < this.segs.length; q++) if (!this.segs[q].rapid) this.segs[q].kind = "cyc"; }
        at = {...this.p}; this.mode = save.mode; this.dist = save.dist;
      }
    }
    go(S0, true); this.p = S0;
  }
});
