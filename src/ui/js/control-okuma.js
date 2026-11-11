/* ---------- Okuma lathes (OSP) ----------
   The simulation of the Okuma lathe cycles: LAP roughing and finishing from a contour (G85, G87), G74 and G73
   grooving, G77/G78 tapping and G71 threading passes. They are methods of SimRun (run-program.js), added here. */
Object.assign(SimRun.prototype, {
  // The points of a LAP contour (the lines from "NA1 G81" to G80), starting at the tool's position.
  lapPath(name, S){
    const k0 = name!=null ? this.L[labelKey(name)] : undefined; if (k0===undefined) return null;
    const pts = [{...S}]; let q = {...S}, m = this.mode;
    for (let k = k0; k < doc.length; k++){
      const tk = doc[k]; if (k > k0 && tk.some(t => isCode(t,"G80"))) break;
      const w = {};
      for (const t of tk){
        if (isComment(t) || isMacroTok(t) || /^N/.test(t)) continue;
        const v = isVarVal(t) ? this.calc(t.slice(1).replace(/^=/, "")) : parseFloat(t.slice(1)); if (v==null || isNaN(v)) continue;
        if (t[0]==="G"){ if ([0,1,2,3].includes(v)) m = v; } else w[t[0]] = v;
      }
      if (!("X" in w || "Z" in w || "U" in w || "W" in w)) continue;
      const nq = { x: "U" in w ? q.x + w.U : "X" in w ? (this.dist==="inc" ? q.x + w.X : w.X + this.off.x) : q.x, y:0,
                   z: "W" in w ? q.z + w.W : "Z" in w ? (this.dist==="inc" ? q.z + w.Z : w.Z + this.off.z) : q.z };
      if (m===2 || m===3) pts.push(...this.arcPts(q, nq, w, m)); else pts.push({ ...nq, rapid: m===0 });
      q = nq;
    }
    return { pts, face: doc[k0].some(t => isCode(t,"G82")) };
  },
  // G85 (rough) and G87 (finish) on an Okuma lathe. Roughing cuts along Z (G81 contour) or X (G82) in steps of D
  // (X as a diameter), leaving U and W on the contour, then follows the contour once at that allowance.
  // Finishing follows the contour. Both end back at the start point.
  lap(finish, name, w, li, T){
    const S = {...this.p}, path = this.lapPath(name, S); if (!path) return;
    let at = S;
    const go = (b, rapid, kind) => { this.segs.push({ a:{...at}, b:{...b, y:0}, rapid, kind: rapid ? "rapid" : kind || "feed", li, tool:T }); at = b; };
    const follow = C => { go(C[0], true); C.slice(1).forEach(c => go(c, !!c.rapid, c.arc ? "arc" : "feed")); };
    if (finish){ path.pts.slice(1).forEach(c => go(c, !!c.rapid, c.arc ? "arc" : "feed")); go(S, true); this.p = S; return; }
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
    go(S, true); follow([pt(C[0][sa], S[ca]), ...C]); go(S, true); this.p = S;
  },
  // G74 on an Okuma lathe: grooves (or a drilled hole) cut along Z to the depth on this line, one at the start X and then
  // one every I (a diameter) until the X on the line, each fed in and pulled back out; then back to the start point.
  groove(n, w, li, T){
    const S = {...this.p}, I = Math.abs(w.I || 0), dx = Math.sign(n.x - S.x), xs = [];
    if (I > 0 && dx) for (let x = S.x; dx*(n.x - x) > 1e-9 && xs.length < 500; x += dx*I) xs.push(x);
    xs.push(n.x);
    let at = S;
    const go = (b, rapid, extra) => {
      this.segs.push({ a:{...at}, b:{...b}, rapid, kind: rapid ? "rapid" : "cyc", li, tool:T, ...extra });
      at = b;
    };
    // at X0 it's a drilled hole: marked with a circle at the bottom
    for (const x of xs){ go({ x, y:0, z:S.z }, true); go({ x, y:0, z:n.z }, false, Math.abs(x) < 1e-6 ? { hole:true } : null); go({ x, y:0, z:S.z }, true); }
    go(S, true); this.p = S;
  },
  // G73 on an Okuma lathe: grooves cut along X to the X on this line, one at the start Z and then one every K
  // until the Z on the line, each fed in and pulled back out; then back to the start point. The pecks (D) aren't drawn.
  grooveX(n, w, li, T){
    const S = {...this.p}, K = Math.abs(w.K || 0), dz = Math.sign(n.z - S.z), zs = [];
    if (K > 0 && dz) for (let z = S.z; dz*(n.z - z) > 1e-9 && zs.length < 500; z += dz*K) zs.push(z);
    zs.push(n.z);
    let at = S; const go = (b, rapid) => { this.segs.push({ a:{...at}, b:{...b}, rapid, kind: rapid ? "rapid" : "cyc", li, tool:T }); at = b; };
    for (const z of zs){ go({ x:S.x, y:0, z }, true); go({ x:n.x, y:0, z }, false); go({ x:S.x, y:0, z }, true); }
    go(S, true); this.p = S;
  },
  // G77 (G78 left hand) tapping on an Okuma lathe: X over to the X on the line, rapid K toward the hole, tap (feed) to Z,
  // feed back out with the spindle reversed, then rapid back to the start Z.
  tapZ(n, w, li, T){
    const S = {...this.p}, dz = Math.sign(n.z - S.z) || -1, z1 = S.z + dz*Math.abs(w.K || 0);
    let at = S;
    const go = (b, rapid, extra) => {
      if (Math.hypot(b.x - at.x, b.z - at.z) < 1e-9) return;
      this.segs.push({ a:{...at}, b:{...b}, rapid, kind: rapid ? "rapid" : "cyc", li, tool:T, ...extra });
      at = b;
    };
    go({ x:n.x, y:0, z:S.z }, true); go({ x:n.x, y:0, z:z1 }, true);
    go({ x:n.x, y:0, z:n.z }, false, { hole:true }); go({ x:n.x, y:0, z:z1 }, false); go({ x:n.x, y:0, z:S.z }, true);
    this.p = { x:n.x, y:0, z:S.z };
  },
  // Okuma G71 passes (OSP-U10L manual, section 16 4-3): each pass's depth from the top of the thread, as a diameter.
  // H thread height, D first cut, U finishing allowance (all diameters). M73 (pattern 1, the default here): D each pass
  // until within D of H - U, then what's left in halves (D/2, D/4, D/8, D/8), then U. M74: D each pass to H - U, then U.
  // M75: pass n at √n × D to H - U, then U (pattern 3; pattern 4 is a parameter, not drawn differently).
  okumaThreadDepths(w, toks){
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
  },
  // How each Okuma pass starts along Z with an infeed angle B: M32 down the left face (the default), M34 the right face,
  // M33 zigzag (alternate faces). B0 feeds straight in.
  okumaThreadFlank(w, toks){
    const B = Math.abs(w.B || 0); if (!(B > 0)) return null;
    const t = Math.tan(B/2*Math.PI/180), m = c => toks.some(x => isCode(x, c));
    const side = m("M34") ? () => 1 : m("M33") ? k => (k % 2 ? 1 : -1) : () => -1;
    return (d, k) => side(k) * (d/2) * t;
  }
});
