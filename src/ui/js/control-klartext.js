/* ---------- Heidenhain Klartext ----------
   Everything that only Klartext programs use, in one place: reading a block into words (tokKlartext), the words'
   readings and modes (klWord, klModes), labels, running the program for the toolpath (interpretKlartext) and its
   checks (checkKlartext). The rest of the UI calls these where SYNTAX is "klartext". */
// Heidenhain Klartext: "12 L X+10 Y-5 RL F200 M3". A bare number first is the block number. A function and its fixed
// words are one word ("TOOL CALL 5 Z", "CYCL DEF 200 DRILLING", "BLK FORM 0.1 Z", "APPR LCT"), and so is a statement
// that runs to the end of the line ("BEGIN PGM NAME MM", "LBL 1", "CALL LBL 1 REP 4", "FN 9: IF ...", "Q1 = Q2 * 3",
// "* - heading"). Then words: a name and its value ("X+10", "IX-5", "X+Q10", "DR+", "LEN15", "RL", "FMAX", "M3"),
// "POS1( X+25 Y+33 Z+0 )" pattern points, ";" comments to the end of the line and "~" (the block goes on).
// Spaces are made single, letters outside quotes upper case. gc_tokenize_syntax() in src/core/gc_doc.c mirrors this.
const KL_HEAD = /^(?:TOOL[ \t]+(?:CALL|DEF)(?:[ \t]+(?:"[^"]*"|QS\d+|\d+(?:\.\d+)?))?(?:[ \t]+[XYZ](?![A-Za-z0-9_+\-.]))?|BLK[ \t]+FORM[ \t]+(?:0\.1[ \t]+[XYZ]|0\.2|CYLINDER[ \t]+[XYZ]|ROTATION[ \t]+[XYZ]|FILE)|CYCL[ \t]+CALL(?:[ \t]+(?:PAT|POS))?|PATTERN[ \t]+DEF|(?:APPR|DEP)[ \t]+P?(?:LCT|LT|LN|CT)|CHF(?:[ \t]+\d*\.?\d+)?(?![A-Za-z0-9_.])|(?:LP|L|CC|CR|CTP|CT|CP|C|RND|FLT|FL|FCT|FC|FPOL|STOP)(?![A-Za-z0-9_]))/i;
const KL_WHOLE = /^(?:BEGIN[ \t]+PGM|END[ \t]+PGM|CALL[ \t]+(?:LBL|PGM|SELECTED)|LBL(?![A-Za-z0-9_])|SEL[ \t]+[A-Za-z]+|FN[ \t]*\d+[ \t]*:|Q[LRS]?\d+[ \t]*=)/i;
function tokKlartext(s){
  const out = [], n = s.length, isSp = c => /[ \t\n\r\f\v]/.test(c || ""), isAl = c => /[A-Za-z_]/.test(c || "");
  // Spaces made single and letters upper case, outside quotes
  const norm = t => {
    let o = "", q = false;
    for (const ch of t){ if (ch==='"') q = !q; if (!q && isSp(ch)){ if (o && o[o.length-1]!==" ") o += " "; continue; } o += q ? ch : ch.toUpperCase(); }
    return o.replace(/^ | $/g, "");
  };
  const VAL = /^(?:[-+]?(?:\d*\.?\d+|Q[LRS]?\d+)|[-+])/i;
  let i = 0;
  while (isSp(s[i])) i++;
  const bn = /^\d+(?![^ \t\n\r\f\v])/.exec(s.slice(i)); if (bn){ out.push(bn[0]); i += bn[0].length; while (isSp(s[i])) i++; }
  const rest = s.slice(i), cd = /^CYCL[ \t]+DEF[ \t]+\d+(?:\.\d+)?/i.exec(rest), h = !cd && KL_HEAD.exec(rest);
  if (s[i]==="*"){ out.push(rest.replace(/[ \t\n\r\f\v]+$/, "")); return out; }   // a structure block, as written
  if (KL_WHOLE.test(rest)){   // to a ";" outside quotes, with a "~" at its end kept apart
    let e = i, q = false; for (; e < n; e++){ if (s[e]==='"') q = !q; if (!q && s[e]===";") break; }
    let t = norm(s.slice(i, e)); const cont = /~$/.test(t); if (cont) t = t.replace(/ ?~$/, "");
    if (t) out.push(t); if (cont) out.push("~"); i = e;
  } else if (cd){   // CYCL DEF 200 DRILLING: the number and the words of the cycle's name (letters, "-", ".", "/")
    let e = i + cd[0].length;
    for (;;){
      let k = e;
      while (isSp(s[k])) k++;
      const m = /^[A-Za-z][A-Za-z_.\-\/]*/.exec(s.slice(k));
      if (!m || (s[k + m[0].length] && !isSp(s[k + m[0].length]) && s[k + m[0].length]!==";" && s[k + m[0].length]!=="~")) break;
      e = k + m[0].length;
    }
    out.push(norm(s.slice(i, e))); i = e;
  } else if (h){ out.push(norm(h[0])); i += h[0].length; }
  while (i < n){
    const c = s[i];
    if (isSp(c)){ i++; continue; }
    if (c===";"){ out.push(s.slice(i).replace(/[ \t\n\r\f\v]+$/, "")); break; }
    if (c==="~"){ out.push("~"); i++; continue; }
    if (c==='"'){ let e = i+1; while (e < n && s[e]!=='"') e++; if (e < n) e++; out.push(s.slice(i, e)); i = e; continue; }
    if (isAl(c)){
      let e = i; while (isAl(s[e])) e++;
      const name = s.slice(i, e), dg = /^\d+/.exec(s.slice(e))?.[0] || "";
      let k0 = e + dg.length; while (isSp(s[k0])) k0++;
      if (/^(?:POS|ROW|PAT|FRAME|CIRC|PITCHCIRC)$/i.test(name) && s[k0]==="("){   // a pattern point: POS1 ( X+25 Y+33 Z+0 )
        let k = k0; while (k < n && s[k]!==")") k++; if (k < n) k++;
        out.push(norm(s.slice(i, k)).replace(/ ?\( ?/, "(").replace(/ \)$/, ")")); i = k; continue;
      }
      if (dg && /^[-+]/.test(s[e + dg.length] || "")) e += dg.length;   // DR2+0.05: a name ending in digits
      let v = VAL.exec(s.slice(e)), k = e;
      if (!v){ while (isSp(s[k])) k++; if (k > e){ v = /^[-+]?(?:\d*\.?\d+|Q[LRS]?\d+)/i.exec(s.slice(k)); if (!v) k = e; } }   // "X +Q10", "LEN 12.5"
      if (v){ out.push((s.slice(i, e) + v[0]).toUpperCase()); i = k + v[0].length; continue; }
      out.push(s.slice(i, e).toUpperCase()); i = e; continue;
    }
    let e = i; while (e < n && !isSp(s[e]) && !isAl(s[e]) && !";~\"".includes(s[e])) e++; out.push(s.slice(i, e)); i = e;
  }
  return out;
}
// Klartext: the dictionary key a word starts with ("TOOL CALL 5 Z" → "TOOL CALL", "FN 9: IF …" → "FN 9",
// "CYCL DEF 200 DRILLING" → "CYCL DEF", "LBL 0"), or null for a word with a value (X+10, RL, M3).
function klKey(t){
  if (SYNTAX!=="klartext" || !/^[A-Z]/.test(t)) return null;
  const fn = /^FN (\d+):/.exec(t); if (fn) return "FN " + parseInt(fn[1], 10);
  if (t==="LBL 0") return t;
  const K = DICT.machineOverrides.heidenhain || {}, w = t.split(" ");
  for (let k = Math.min(w.length, 3); k > 0; k--){ const key = w.slice(0, k).join(" "); if (K[key] && !/^M\d/.test(key)) return key; }
  return null;
}
// The path functions that move the tool (CC only sets the circle center)
const KL_MOVE = /^(?:L|LP|C|CR|CT|CP|CTP|FL|FLT|FC|FCT|APPR .+|DEP .+)$/;
const KL_ARC = /^(?:C|CR|CT|CP|CTP|FC|FCT)$/;
const klHeadOf = toks => { for (const t of toks){ const k = klKey(t); if (k) return k; } return null; };
const klBlock = toks => /^\d+$/.test(toks?.[0] || "") ? parseInt(toks[0], 10) : null;
// A Klartext word's reading, or null for a word read the way G code is (X Y Z F S M with a number)
const KL_POINTS = { POS:"POINT", ROW:"ROW", PAT:"PATTERN", FRAME:"FRAME", CIRC:"CIRCLE", PITCHCIRC:"PITCHCIRCLE" };
function klWord(t, st){
  if (/^\d+$/.test(t)) return { g:t, e:"N"+t, d:`Block ${t}` };
  if (t==="~") return { g:t, e:"~", d:"The block goes on in the next line" };
  if (t[0]==='"') return { g:t, e:t, d:"A name, as written" };
  const key = klKey(t);
  if (key){
    const e = entry(key), rest = key.startsWith("FN ") ? t.slice(t.indexOf(":") + 1) : t.slice(key.length);
    let d = e.desc;
    if (key==="CYCL DEF"){ const n = /^ (\d+)/.exec(rest)?.[1], nm = n && DIALECT.klCycles?.[n]; if (nm) d += `. Cycle ${n}: ${nm}`; }
    return { g:t, e:sty(e) + rest, d, code:key };
  }
  const q = /^(Q[LRS]?\d+) ?= ?(.*)$/.exec(t);
  if (q){
    const qp = st?.klDef!=null && DIALECT.qParams?.[q[1]], num = /^[-+]?\d*\.?\d+$/.test(q[2]), v = num ? fmtNum("Q", q[2], st).v : q[2];
    if (qp) return { g:t, e:vw(qp[0], v), d:`${qp[1]} (${q[1]}, cycle ${st.klDef})` };
    return { g:t, e:t, d: num ? `Sets Q parameter ${q[1]} to ${v}` : `Sets Q parameter ${q[1]} to ${q[2]}, worked out when the line runs` };
  }
  const pt = /^(POS|ROW|PAT|FRAME|CIRC|PITCHCIRC)(\d*)\((.*)\)$/.exec(t);
  if (pt){ const nm = KL_POINTS[pt[1]]; return { g:t, e:nm + pt[2] + " " + pt[3], d:`Pattern ${nm.toLowerCase()} ${pt[2]}: ${pt[3]}` }; }
  // An axis, feed or speed from a Q parameter: X+Q10, FQ5
  if (/^[XYZABCFS][-+]?Q[LRS]?\d+$/.test(t)){
    const a = DICT.address[t[0]];
    return { g:t, e:vw(style==="short" ? ("FS".includes(t[0]) || !a ? t[0] : sty(a.abs || a)) : t[0]==="F" ? "feed" : t[0]==="S" ? "speed" : !a ? t[0] : sty(a.abs || a), t.slice(1)), d:`${t[0]} from Q parameter ${t.slice(1).replace(/^[-+]/, "")}, worked out when the line runs` };
  }
  const m = /^([A-Z]+)(.*)$/.exec(t); if (!m) return null;
  let name = m[1], val = m[2]; const KW = DIALECT.klWords || {};
  const dg = /^(\d+)([-+].*)$/.exec(val); if (dg && KW[name + dg[1]]){ name += dg[1]; val = dg[2]; }
  if (name.length===1 && "XYZFSMGT".includes(name)) return null;   // read the way G code is (the modes panel shows G codes)
  const v = val && val!=="+" && val!=="-" ? fmtNum("X", val, st).v : "";
  if (name.length===1 && "ABC".includes(name)) return { g:t, e:vw(name, v), d:`${name} axis position ${v}` };
  if (name==="R" && /^[-+]?0*\.?0*$/.test(val) && val!=="") return { g:t, e:sty(entry("G40")), d:"No tool radius compensation" };
  if (name==="DR" && (val==="+" || val==="-")) {
    return { g:t, e:sty(entry(val==="+" ? "G03" : "G02")), d: val==="+" ? "The arc turns counterclockwise" : "The arc turns clockwise" };
  }
  if (name==="DR") return { g:t, e:vw("DELTAR", v), d:`Tool radius oversize ${v}` };
  const k = KW[name]; if (k) return { g:t, e:v ? vw(k[0], v) : style==="short" ? k[0] : k[0].toLowerCase(), d:k[1] + (v ? " " + v : "") };
  return { g:t, e:"?" + t, unk:true, d:`${name} isn't a Klartext word GlossCode knows.` };
}

// Klartext: CYCL DEF's Q parameter lines (the block goes on while a line ends in "~"), units from BEGIN PGM,
// the tool from TOOL CALL, the move (FMAX a rapid, DR+ a counterclockwise arc) and radius compensation (RL, RR, R0)
function klModes(toks, st, set){
  if (!st.klCont) st.klDef = null;
  const last = toks[toks.length-1] || "";
  st.klCont = last==="~" || (last[0]===";" && /~\s*$/.test(last));
  for (const t of toks){
    const k = klKey(t); if (!k) continue;
    if (k==="CYCL DEF") st.klDef = /^CYCL DEF (\d+)/.exec(t)[1];
    if (k==="BEGIN PGM"){ if (/ MM$/.test(t)){ st.units = "mm"; set("unitCode", "G21"); } if (/ INCH$/.test(t)){ st.units = "inch"; set("unitCode", "G20"); } }
    if (k==="TOOL CALL"){ const n = /^TOOL CALL (\d+)/.exec(t); if (n) set("T", "T" + n[1]); }
    if (KL_MOVE.test(k)){
      set("motion", KL_ARC.test(k) ? (toks.includes("DR+") ? "G03" : "G02") : toks.includes("FMAX") ? "G00" : "G01");
      set("klMove", k + (toks.includes("FMAX") ? " FMAX" : KL_ARC.test(k) && toks.includes("DR+") ? " DR+" : KL_ARC.test(k) && toks.includes("DR-") ? " DR-" : ""));
    }
  }
  for (const [w, g] of [["RL","G41"], ["RR","G42"], ["R0","G40"]]) if (toks.includes(w)){ set("comp", g); set("klComp", w); }
}
// A Klartext label's key: "LBL 5" (LBL 05 is the same label) or 'LBL "NAME"'
const klLabel = x => "LBL " + (/^\d+$/.test(x) ? parseInt(x, 10) : x);

// Heidenhain Klartext, as it runs: path functions (L, LP, C around CC, CR, CP, CT, APPR and DEP drawn to their end
// points), FMAX rapids, Q parameters (FN 0-8 and formulas), CYCL DEF with its Q parameter lines, CYCL CALL, CYCL CALL POS,
// CYCL CALL PAT with PATTERN DEF points, M99 and M89, cycle 7 datum shifts, CALL LBL subprograms (LBL 0 returns),
// CALL LBL n REP m repeats, FN 9-12 jumps, and TOOL CALL. FK free contours, RND and CHF corners and tilting are not drawn.
function interpretKlartext(){
  const segs = [], steps = [], labelMap = labels(), stack = [], Q = {}, vals = {};
  let pos = { x:0, y:0, z:0 }, cc = { x:0, y:0 }, tool = null, feed = null, dir = null, cdef = null, inDef = false, m89 = false;
  const off = { x:0, y:0, z:0 }, reps = {}, pat = [];
  let i = 0, guard = 0;
  const qv = s => {
    const m = /^([-+]?)(Q[LRS]?\d+)$/.exec(s);
    if (m){ const v = Q[m[2]]; return v==null ? null : m[1]==="-" ? -v : v; }
    const v = parseFloat(s);
    return isNaN(v) ? null : v;
  };
  const calc = e => {
    let bad = false;
    const src = e.replace(/Q[LRS]?\d+/g, m => {
      const v = Q[m];
      if (v==null){ bad = true; return "0"; }
      return "[" + v + "]";
    }).replace(/\bDIV\b/g, "/").replace(/\(/g, "[").replace(/\)/g, "]");
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
        if (yes && labelMap[klLabel(jf[4])]!==undefined) jump = labelMap[klLabel(jf[4])];
      }
    }
    if (cdef && goesOn && (h==="CYCL DEF" || cont)) inDef = true;
    const w = words(all), T = tool || "T?", has = c => all.some(t => isCode(t, c));
    if (all.some(t => /^F(?:[-+]?[\d.]|Q)/.test(t))){ const f = all.find(t => /^F(?:[-+]?[\d.]|Q)/.test(t)); feed = qv(f.slice(1)); }
    const machine = has("M91") || has("M92");   // machine coordinates: the move isn't drawn
    if (h && KL_MOVE.test(h) && !machine) move(h, w, all, li, T);
    if (h==="CC") cc = { x: "X" in w ? w.X + off.x : "IX" in w ? cc.x + w.IX : pos.x, y: "Y" in w ? w.Y + off.y : "IY" in w ? cc.y + w.IY : pos.y };
    if (h && /^CYCL CALL/.test(h) || has("M99") || (m89 && h && KL_MOVE.test(h))){
      if (h==="CYCL CALL POS"){ const n = { x: "X" in w ? w.X + off.x : pos.x, y: "Y" in w ? w.Y + off.y : pos.y }; runCycle(n.x, n.y, null, li, T, dips); }
      else if (h==="CYCL CALL PAT") pat.forEach(q => runCycle(q.x + off.x, q.y + off.y, q.z, li, T, dips));
      else runCycle(pos.x, pos.y, null, li, T, dips);
      if (has("M99")) m89 = false;
    }
    if (has("M89")) m89 = true;
    const stop = h==="STOP" || has("M00") ? "M00" : has("M01") ? "M01" : null;
    const kind = segs.length > s0 ? (segs.slice(s0).some(sg => sg.kind==="cyc") ? "cyc" : segs[segs.length-1].kind) : null;
    steps.push({ li, v:pos.z, s0, s1:segs.length, kind, stop, dips, calls: stack.map(r => r - 1), tail:null, ...timelineValues(li, toks), ...(feed!=null ? { f:feed } : {}) });
    if (isEnd(toks)) break;
    if (jump!=null){ i = jump; continue; }
    if (isReturn(toks) && stack.length){ i = stack.pop(); continue; }
    const rc = all.map(t => /^CALL LBL ("[^"]*"|\d+) REP ?(\d+)/.exec(t)).find(Boolean);
    if (rc){   // repeat the section from the label: REP 2 runs it 2 more times
      const to = labelMap[klLabel(rc[1])];
      if (to!==undefined){ if (!(li in reps)) reps[li] = +rc[2]; if (reps[li] > 0){ reps[li]--; i = to; continue; } delete reps[li]; }
      i++; continue;
    }
    const tgt = callTarget(toks);
    if (tgt!=null && labelMap[tgt]!==undefined && stack.length < 8){ stack.push(i+1); i = labelMap[tgt]; continue; }
    i++;
  }
  return { segs, steps, vals, tailUsed:false };

  // A block's words with values: X+10 → X:10, IX-5 → IX:-5, PA+30, R5, F200 (Q parameters worked out)
  function words(all){
    const w = {};
    for (const t of all){
      if (klKey(t)) continue;
      const m = /^([A-Z]+)([-+]?(?:\d*\.?\d+|Q[LRS]?\d+))$/.exec(t);
      if (m){ const v = qv(m[2]); if (v!=null) w[m[1]] = v; }
    }
    return w;
  }
  function seg(a, b, kind, li, T){
    if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-9) return;
    segs.push({ a:{...a}, b:{...b}, rapid: kind==="rapid", kind, li, tool:T });
  }
  function arc(c, n, ccw, li, T, full){
    const r = Math.hypot(pos.x - c.x, pos.y - c.y), a0 = Math.atan2(pos.y - c.y, pos.x - c.x), a1 = Math.atan2(n.y - c.y, n.x - c.x);
    let sw = a1 - a0; if (ccw){ if (sw <= 1e-9) sw += 2*Math.PI; } else if (sw >= -1e-9) sw -= 2*Math.PI;
    if (!full && Math.abs(Math.abs(sw) - 2*Math.PI) < 1e-6 && Math.hypot(n.x - pos.x, n.y - pos.y) > 1e-6) sw = 0;
    let q = {...pos};
    const ns = arcSteps(sw, 36);
    for (let s = 1; s <= ns; s++){
      const a = a0 + sw*s/ns, b = { x:c.x + r*Math.cos(a), y:c.y + r*Math.sin(a), z:pos.z + (n.z - pos.z)*s/ns };
      seg(q, b, "arc", li, T);
      q = b;
    }
    dir = { x: ccw ? -Math.sin(a0 + sw) : Math.sin(a0 + sw), y: ccw ? Math.cos(a0 + sw) : -Math.cos(a0 + sw) };
    pos = { ...n };
  }
  function move(h, w, all, li, T){
    const rapid = all.includes("FMAX"), ccw = all.includes("DR+");
    const ax = (a, A) => A in w ? w[A] + off[a] : "I" + A in w ? pos[a] + w["I" + A] : pos[a];
    let n = { x:ax("x", "X"), y:ax("y", "Y"), z:ax("z", "Z") };
    if (/^(?:LP|CP|CTP)$|^(?:APPR|DEP) P/.test(h)){
      const pr0 = Math.hypot(pos.x - cc.x, pos.y - cc.y), pa0 = Math.atan2(pos.y - cc.y, pos.x - cc.x)*180/Math.PI;
      const pr = "PR" in w ? w.PR : pr0 + (w.IPR || 0), pa = ("PA" in w ? w.PA : pa0 + (w.IPA || 0))*Math.PI/180;
      n.x = cc.x + pr*Math.cos(pa); n.y = cc.y + pr*Math.sin(pa);
      if (h==="CP"){ arc(cc, n, ccw, li, T, "IPA" in w && Math.abs(w.IPA) >= 360); return; }
    }
    if (h==="C"){ const full = !("X" in w || "Y" in w || "IX" in w || "IY" in w); arc(cc, n, ccw, li, T, full); return; }
    if (h==="CR" && "R" in w){
      const d = Math.hypot(n.x - pos.x, n.y - pos.y), r = Math.abs(w.R);
      if (d > 1e-9 && r >= d/2 - 1e-9){
        const mx = (pos.x + n.x)/2, my = (pos.y + n.y)/2, hgt = Math.sqrt(Math.max(0, r*r - d*d/4)), ux = -(n.y - pos.y)/d, uy = (n.x - pos.x)/d;
        const big = w.R < 0, side = (ccw ? 1 : -1) * (big ? -1 : 1);   // the center is left of the chord for a short CCW arc
        arc({ x:mx + side*hgt*ux, y:my + side*hgt*uy }, n, ccw, li, T); return;
      }
    }
    if (h==="CT" && dir){
      const dx = n.x - pos.x, dy = n.y - pos.y, dn = -dir.y*dx + dir.x*dy;
      if (Math.abs(dn) > 1e-9){ const s = (dx*dx + dy*dy)/(2*dn); arc({ x:pos.x - dir.y*s, y:pos.y + dir.x*s }, n, s > 0, li, T); return; }
    }
    const kind = rapid ? "rapid" : "feed", d = Math.hypot(n.x - pos.x, n.y - pos.y);
    if (d > 1e-9) dir = { x:(n.x - pos.x)/d, y:(n.y - pos.y)/d };
    seg(pos, n, kind, li, T); pos = n;
  }
  // PATTERN DEF points: POS (one point), ROW, PAT (rows and columns), CIRC and PITCHCIRC (points on a circle)
  function patPoints(kind, inner){
    const v = {}; for (const m of inner.matchAll(/([A-Z]+)([-+]?(?:\d*\.?\d+|Q[LRS]?\d+))/g)) v[m[1]] = qv(m[2]);
    const z = v.Z ?? null, R = Math.PI/180, X = v.X ?? 0, Y = v.Y ?? 0;
    if (kind==="POS"){
      const lp = pat[pat.length-1] || { x:0, y:0 };
      pat.push({ x: v.X ?? (v.IX!=null ? lp.x + v.IX : 0), y: v.Y ?? (v.IY!=null ? lp.y + v.IY : 0), z });
      return;
    }   // IX IY: from the point before
    if (kind==="ROW"){
      const n = Math.max(1, Math.min(999, Math.round(v.NUM ?? 1))), a = (v.ROT ?? 0)*R;
      for (let k = 0; k < n; k++) pat.push({ x:X + k*(v.D ?? 0)*Math.cos(a), y:Y + k*(v.D ?? 0)*Math.sin(a), z });
      return;
    }
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
    const q = k => cdef.q[k] ?? null;
    const s = surf ?? q("Q203") ?? 0;
    const top = s + Math.abs(q("Q200") ?? 2);
    const z = s + (q("Q201") ?? 0);
    const back = s + Math.max(Math.abs(q("Q200") ?? 2), q("Q204") ?? 0);
    if (Math.abs(pos.z - top) > 1e-9 && pos.z < top){ seg(pos, { ...pos, z:top }, "rapid", li, T); pos = { ...pos, z:top }; }
    seg(pos, { x, y, z:pos.z }, "rapid", li, T);
    if (pos.z > top) seg({ x, y, z:pos.z }, { x, y, z:top }, "rapid", li, T);
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
    dips.push({ top: Math.max(pos.z, top), r:top, z, back });
    pos = { x, y, z:back };
  }
}

// Klartext checks, in file order: block numbers, the program name, cycle calls with no CYCL DEF, calls and jumps to
// labels that aren't there, the first feed move with no F or with the spindle stopped, and M codes that contradict.
function checkKlartext(emit, L){
  let prev = null, begin = null, def = false, F = false, spin = null, noF = false, spinWarned = false;
  doc.forEach((toks, li) => {
    const n = klBlock(toks);
    if (n!=null){ if (prev!=null && n <= prev) emit(li, "block-number-order", { n, prev }); prev = n; }
    const all = toks.filter(t => !isComment(t)), codes = [...new Set(all.filter(t => /^M\d+$/.test(t)).map(pad2))];
    for (const t of all){
      const k = klKey(t);
      if (k==="BEGIN PGM") begin = /^BEGIN PGM (\S+)/.exec(t)?.[1] ?? null;
      if (k==="END PGM"){ const e = /^END PGM (\S+)/.exec(t)?.[1]; if (begin!=null && e!=null && e!==begin) emit(li, "pgm-name-mismatch", { end:e, begin }); }
      if (k==="CYCL DEF") def = true;
      if ((/^CYCL CALL/.test(t) || isCode(t, "M99") || isCode(t, "M89")) && !def) emit(li, "cycle-call-no-def", { word:t });
      const lb = /^CALL LBL ("[^"]*"|\d+)/.exec(t) || (/^FN (?:9|1[0-2]):/.test(t) ? / GOTO LBL ("[^"]*"|\d+)/.exec(t) : null);
      if (lb && !/^0+$/.test(lb[1]) && L[klLabel(lb[1])]===undefined) emit(li, "missing-label", { word:t, label:klLabel(lb[1]) });
    }
    for (const grp of DIALECT.mConflicts || []){
      const hit = codes.filter(c => grp.includes(c));
      if (hit.length > 1) emit(li, "m-conflict", { codes:hit.join(" and ") });
    }
    if (all.some(t => /^F(?:[-+]?[\d.]|Q|AUTO$)/.test(t))) F = true;
    for (const c of codes){ if (["M03","M04","M13","M14"].includes(c)) spin = c; if (c==="M05") spin = "M05"; }
    const h = klHeadOf(all);
    if (h && KL_MOVE.test(h) && !all.includes("FMAX")){
      const move = `${h} move`;
      if (!F && !noF){ noF = true; emit(li, "no-feed-rate", { move }); }
      if (!["M03","M04","M13","M14"].includes(spin) && !spinWarned){
        spinWarned = true;
        emit(li, "spindle-off-feed", { move, spin: spin ? spin + " is active" : "it was never started" });
      }
    }
  });
}
