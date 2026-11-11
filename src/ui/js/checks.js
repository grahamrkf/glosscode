/* ---------- Checks (Problems panel) ----------
   Rule text, severities and per-control tables come from RULES (data/gcode-rules.json).
   checkProgram walks the program once in execution order, carrying the machine state (and reusing the last run's
   results for lines an edit didn't reach); checkLine runs one line's groups of checks, and each rule id emits its
   message from the table. */
let DIALECT = {}, PROBLEMS = [], PBYLINE = {}, probsOpen = true, probFilter = { error:true, warning:true, info:true };
function dialectFor(brand, type){
  const dialects = RULES.dialects || {}, chain = []; let b = brand;
  while (b && dialects[b] && !chain.includes(b)){ chain.unshift(b); b = dialects[b].inherits; }
  const out = {};
  // A type with a base (plasma on mill) takes the base type's tables along the whole chain first.
  for (const t of [baseType(type), type].filter(Boolean)) for (const name of chain){
    for (const [k, v] of Object.entries(dialects[name][t] || {})){
      const obj = x => x && typeof x==="object" && !Array.isArray(x);
      if (obj(v) && obj(out[k])){
        const m = {...out[k]};
        for (const [k2, v2] of Object.entries(v)){ if (v2===null) delete m[k2]; else m[k2] = v2; }
        out[k] = m;
      }
      else out[k] = v;
    }
    if (dialects[name].keywords) out.keywords = dialects[name].keywords;
  }
  if (out.toolLength){
    const on = out.toolLength.on;
    out.toolLength = {...out.toolLength, off:(out.modalGroups?.["tool length"] || []).find(c => !on.includes(c)) || "G49"};
  }
  out.verified = chain.length > 0 && chain.every(n => dialects[n].verified!==false);
  out.label = dialects[brand]?.label || brand;
  return out;
}
function setDialect(){
  const m = MACHINES[machineId]; DIALECT = dialectFor(m.brand, m.type);
  SYNTAX = DIALECT.blockSyntax || "";
  // Cycles that need an option the machine doesn't have (live tooling, a Y axis) are left out, so the menus, guide and checks all skip them.
  if (DIALECT.cycles) DIALECT.cycles = Object.fromEntries(Object.entries(DIALECT.cycles).filter(([, d]) => !(d.needs || []).some(n => !m[n])));
  buildColumns(DIALECT);
}
const SEV_RANK = { error:3, warning:2, info:1 };
const SEV_ICON = { error:"✕", warning:"⚠", info:"i" };
const fmt4 = n => (Math.round(n*10000)/10000).toString();

function checkProgram(full){
  const dialect = DIALECT, lathe = mtype()==="lathe", out = [], labelMap = labels();
  const emitTo = { list:out };
  const emit = (li, id, vars, sev) => {
    if (!emitTo.list) return;
    const r = RULES.rules[id]; if (!r) return;
    const msg = r.message.replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? "");
    emitTo.list.push({ li, id, sev: sev || r.severity, title:r.title, msg, why:r.why || "", vars });
  };
  if (SYNTAX==="klartext"){
    checkKlartext(emit, labelMap);
    if (!doc.some(isEnd)) emit(0, "no-program-end", { ends:"END PGM" });
    view.forEach((cells, li) => cells.forEach(c => { if (c.unk) emit(li, "unknown-word", { word:c.g }); }));
    return out.sort((a, b) => a.li - b.li || SEV_RANK[b.sev] - SEV_RANK[a.sev]);
  }
  const fc = feedCodes();
  const P = dialect.process?.on?.length ? dialect.process : null;   // a torch with known cut on and off codes takes the spindle checks' place
  const st = { F:null, Fmode:null, Fwarned:false, noFwarned:false, S:null, spin:null, spinWarned:false, torch:null, torchWarned:false, motion:null, cycle:null, cycleWords:{}, oneShot:false,
    dist:"abs", feed: lathe ? "perRev" : "perMin", units:"inch", plane: lathe ? "G18" : "G17", comp:"G40", D:null, T:null, pendingT:null,
    needTlo:false, tcLine:"", tloOn:false, clamp:false, mcall:false, perMinSeen:false, pos:{ X:null, Y:null, Z:null } };
  const K = { dialect, lathe, labelMap, emit, st, fc, P };   // what every line's checks share (see checkLine)
  const seen = new Set();
  // Reusing the last run's visits (see translateAll). Only which labels exist matters to a line's checks. A problem names
  // its line by number when it has no N label, and so does the tool change the state remembers ("line 40"), so after
  // lines are added or removed those numbers are moved too, and a problem that names a line is found again.
  const keys = doc.map(lineKey), sig = runSig(Object.keys(labelMap).sort().join());
  const R0 = !full && SYNTAX!=="klartext" && sameSig(CRUN?.sig, sig) ? CRUN : null, map = R0 && lineMap(R0.keys, keys);
  const seq = [], seqLi = [], occ = new Array(doc.length).fill(0), p2 = new Map();
  let prevK = R0 ? -1 : null;
  const moved = s => {   // a state from the last run, with its line numbers moved
    if (!map.shift || !s) return s;
    const m = /^line (\d+)$/.exec(s.tcLine || ""); if (!m) return s;
    const n = map.toNew(+m[1] - 1); return n < 0 ? null : { ...s, tcLine:"line " + (n + 1) };
  };
  const probsFor = (o, li) => !o.probs ? null : !map.shift ? o.probs : o.probs.some(p => /\bline \d/.test(p.msg)) ? null : o.probs.map(p => ({ ...p, li }));
  const take = (o, li, first, pre) => {   // the last run's visit o, if it still holds here
    const post = moved(o.post), pr = first ? probsFor(o, li) : null;
    if (!post || (first && !pr) || (pre && !(pre = moved(pre)))) return null;
    Object.assign(st, post); st.pos = { ...post.pos }; st.cycleWords = { ...post.cycleWords };   // the two a line changes in place
    if (pr) out.push(...pr); MEMO_STATS.reused++;
    return map.shift ? { pre, post, probs:pr } : o;
  };
  const read = (li, first) => {
    const pre = snapSt(st), n0 = out.length;
    emitTo.list = first ? out : null; checkLine(K, li); MEMO_STATS.read++;
    return { pre, post:snapSt(st), probs:first ? out.slice(n0) : null };
  };
  const visit = li => {
    const first = !seen.has(li); seen.add(li);
    const c = occ[li]++, oli = map ? map.toOld(li) : -1, ok = oli >= 0 ? R0.byLine[oli]?.[c] : undefined;
    let rec = prevK!=null && ok===prevK + 1 ? take(R0.seq[ok], li, first) : null;
    if (rec) prevK = ok;
    else { rec = read(li, first); const op = ok!==undefined ? moved(R0.seq[ok].post) : null; prevK = op && sameSt(rec.post, op) ? ok : null; }
    seq.push(rec); seqLi.push(li);
  };
  const visit2 = li => {   // a line the walk never reaches, in file order
    seen.add(li);
    const oli = map ? map.toOld(li) : -1, o = oli >= 0 ? R0.p2.get(oli) : null, pre = o && moved(o.pre);
    const rec = (pre && sameSt(pre, st) && take(o, li, true, o.pre)) || read(li, true);
    p2.set(li, rec);
  };
  // Walk in execution order, following local subprogram calls, then check lines never reached.
  { const stack = []; let i = 0, guard = 0;
    while (i < doc.length && guard++ < 5000 + 20 * doc.length){
      const toks = doc[i]; visit(i);
      if (isEnd(toks)) break;
      if (isReturn(toks) && stack.length){ i = stack.pop(); continue; }
      const tgt = callTarget(toks);
      if (tgt!=null && labelMap[tgt]!==undefined && stack.length < 8){ stack.push(i+1); i = labelMap[tgt]; continue; }
      i++;
    }
    doc.forEach((_, li) => { if (!seen.has(li)) visit2(li); });
  }
  emitTo.list = out;
  if (!full && SYNTAX!=="klartext") CRUN = { sig, keys, seq, byLine:visitsByLine(seqLi), p2 };
  if (!doc.some(isEnd)) emit(0, "no-program-end", { ends:(dialect.programEnds || ["M30"]).join(" or ") });
  view.forEach((cells, li) => cells.forEach(c => {
    if (c.unk && !(/^[GM]\d/.test(c.g) && dialect.foreign?.[pad2(c.g)])) emit(li, "unknown-word", { word:c.g });
  }));
  return out.sort((a, b) => a.li - b.li || SEV_RANK[b.sev] - SEV_RANK[a.sev]);
}

// One line's checks, in the order the control reads it. Each group below reads the line's words (ln) and the state
// carried from the lines before (K.st), updates the state, and emits the problems it finds.
const motionCodesFor = lathe => ["G00","G01","G02","G03", ...(lathe ? ["G32","G33"] : [])];
function checkLine(K, li){
  const { dialect, st } = K;
  const all = doc[li].filter(t => !isComment(t) && t[0]!=="/");
  const words = all.filter(t => /^[A-Z]/.test(t) && !isKw(t) && !isMacroTok(t)).map(t => ({ t, L:t[0], v:t.slice(1), n:parseFloat(t.slice(1)) }));
  const own = ownWords(all);
  const codes = words.filter(w => w.L==="G" || (w.L==="M" && !own.includes("M"))).map(w => pad2(w.t));
  const has = c => codes.includes(c);
  const byL = {}; words.forEach(w => (byL[w.L] ||= []).push(w));
  const get = l => byL[l]?.[0];
  const groups = dialect.modalGroups || {};
  const nLabel = /^N\d/.test(all[0] || "") ? all[0] : "line " + (li+1);
  if (st.oneShot){ st.cycle = null; st.cycleWords = {}; st.oneShot = false; }
  const cycCode = codes.find(c => dialect.cycles?.[c]), def = cycCode ? dialect.cycles[cycCode] : null;
  const ln = { li, all, words, own, codes, has, byL, get, groups, nLabel, cycCode, def };
  checkGrammar(K, ln);
  readLineModes(K, ln);
  checkToolChangeAndEnd(K, ln);
  checkSpindle(K, ln);
  checkToolLength(K, ln);
  checkCutterComp(K, ln);
  checkCycles(K, ln);
  checkMove(K, ln);
}

// Line grammar: empty values, brackets, labels, repeated addresses, codes from the same modal group, foreign codes
function checkGrammar(K, ln){
  const { dialect, labelMap, emit } = K;
  const { li, all, words, own, codes, byL, groups } = ln;
  words.forEach(w => { if (w.v==="") emit(li, "empty-value", { letter:w.L }); });
  all.forEach(t => {
    const o = (t.match(/\[/g) || []).length, c = (t.match(/\]/g) || []).length;
    if (o!==c) emit(li, "unbalanced-brackets", { word:t, open:o, close:c });
  });
  // N words after the first name lines to jump to (GOTO N90, G85 NA1)
  all.forEach((w, i) => {
    if (i > 0 && w[0]==="N" && !(SYNTAX==="fagor8060" && /^NR\d+$/.test(w)) && SYNTAX!=="fagor8055" && !own.includes("N") && labelMap[labelKey(w)]===undefined) {
      emit(li, "missing-label", { word:all[i-1] + " " + w, label:w });
    }
  });
  for (const [l, ws] of Object.entries(byL)) if (l!=="G" && l!=="M" && l!=="N" && ws.length > 1) emit(li, "dup-address", { letter:l, count:ws.length===2 ? "twice" : ws.length+" times", words:ws.map(w => w.t).join(", ") });
  if (dialect.mPerBlock && (byL.M || []).length > dialect.mPerBlock) {
    emit(li, "m-per-block", { max:dialect.mPerBlock, count:byL.M.length, words:byL.M.map(w => w.t).join(", ") });
  }
  for (const [g, list] of Object.entries(groups)){
    const hit = [...new Set(codes.filter(c => list.includes(c)))];
    if (hit.length > 1) emit(li, "modal-group-clash", { codes:hit.join(" and "), group:g });
  }
  for (const grp of dialect.mConflicts || []){
    const hit = [...new Set(codes.filter(c => grp.includes(c)))];
    if (hit.length > 1) emit(li, "m-conflict", { codes:hit.join(" and ") });
  }
  new Set(codes).forEach(c => { const f = dialect.foreign?.[c]; if (f) emit(li, "foreign-code", { text:f.text, code:c }, f.severity); });
}

// Modes set on this line: units, distance, feed mode, plane, speed clamp, F, S, D and T
function readLineModes(K, ln){
  const { dialect, lathe, emit, st, fc } = K;
  const { li, words, own, codes, has, get, groups, cycCode, def } = ln;
  {
    const uc = dialect.unitCodes===undefined ? { inch:"G20", mm:"G21" } : dialect.unitCodes;
    if (uc && has(uc.inch)) st.units = "inch";
    if (uc && has(uc.mm)) st.units = "mm";
  }
  const lblWords = dialect.cycles?.[codes.find(c => dialect.cycles?.[c])]?.labels || [];
  if (dialect.numbers?.noDecimal==="leastIncrement") words.forEach(w => {
    if (dialect.numbers.words.includes(w.L) && !lblWords.includes(w.L) && /^[-+]?\d+$/.test(w.v) && parseInt(w.v, 10)!==0){
      const unit = st.units==="inch" ? "in" : "mm", body = w.v.replace(/^\+/, "");
      emit(li, "missing-decimal", { word:w.t, letter:w.L, value:(parseInt(body,10)*dialect.numbers.increment[st.units]).toFixed(st.units==="inch" ? 4 : 3), unit, intended:body + ".", amount:body });
    }
  });
  for (const c of codes){
    if ((groups.distance || []).includes(c)) st.dist = isIncCode(c) ? "inc" : "abs";
    if (!dialect.cycles?.[c]){
      if (c===fc.perMin){ st.feed = "perMin"; st.perMinSeen = true; }
      if (c===fc.perRev) st.feed = "perRev";
      if (c==="G93") st.feed = "inverse";
    }
    if (["G17","G18","G19"].includes(c)) st.plane = c;
  }
  const clampLine = lathe && dialect.speedClamp && has(dialect.speedClamp.code) && get(dialect.speedClamp.word);
  if (clampLine) st.clamp = true;
  if (has("G96") && lathe && dialect.speedClamp && !st.clamp) emit(li, "css-no-clamp", { clamp:dialect.speedClamp.code + " " + dialect.speedClamp.word });
  const fW = get("F"), sW = get("S");
  if (fW && !(def?.leadF) && !(dialect.leadCodes || []).some(c => has(c) || (!cycCode && st.motion===c)) && !(has("G04") && (dialect.dwellWords || []).includes("F"))){
    st.F = fW.n; st.Fmode = st.feed; st.Fwarned = false; st.noFwarned = false;
    const lim = dialect.feedPlausible?.[st.feed]?.[st.units];
    if (lim!=null && fW.n > 0){
      const u = FEED_UNIT[st.feed]?.[st.units] || "";
      if (st.feed==="perRev" && fW.n > lim) {
        emit(li, "feed-plausibility", { f:fmtNum("F", fW.v, st).v, unit:u, size:"large for a per-rev feed", mode:fc.perRev + " (feed per rev)" });
      }
      if (st.feed==="perMin" && fW.n < lim) {
        emit(li, "feed-plausibility", { f:fmtNum("F", fW.v, st).v, unit:u, size:"small for a per-minute feed", mode:fc.perMin + " (feed per minute)" });
      }
    }
  }
  if (sW && !clampLine && !own.includes("S")) st.S = sW.n;
  if (get("D")) st.D = get("D").n;
  const tW = get("T");
  if (tW){ const n = lathe ? parseInt(tW.v.slice(0, 2), 10) : parseInt(tW.v, 10); st.pendingT = n; if (lathe) st.T = n; }
}

// Tool change and program end with a canned cycle or cutter comp left on
function checkToolChangeAndEnd(K, ln){
  const { dialect, lathe, emit, st } = K;
  const { li, all, has, nLabel } = ln;
  if (!lathe && dialect.toolChange && has(dialect.toolChange)){
    if (st.cycle && !has("G80")) emit(li, "cycle-left-on", { cycle:st.cycle, event:"tool change" });
    if (st.comp!=="G40" && !has("G40")) emit(li, "comp-left-on", { comp:st.comp, event:"tool change" });
    st.T = st.pendingT; st.tcLine = nLabel;
    // G43 that stays on through a tool change (Fagor 8055: the new D gives the length) needs no new call
    if (!(dialect.toolLength?.staysOn && st.tloOn)){ st.needTlo = !!dialect.toolLength; st.tloOn = false; }
  }
  if (isEnd(all)){
    if (st.cycle && !has("G80")) emit(li, "cycle-left-on", { cycle:st.cycle, event:"program end" });
    if (st.comp!=="G40" && !has("G40")) emit(li, "comp-left-on", { comp:st.comp, event:"program end" });
  }
}

// Spindle, or the torch on a plasma table
function checkSpindle(K, ln){
  const { dialect, emit, st, P } = K;
  const { li, all, codes } = ln;
  if (dialect.process){
    if (P) for (const c of codes) if (P.on.includes(c) || P.off.includes(c)){ st.torch = c; st.torchWarned = false; }
    if (P && isEnd(all) && P.on.includes(st.torch)) emit(li, "torch-on-at-end", { code:st.torch, off:P.off[0] });
  } else for (const c of codes){
    if (c==="M03" || c==="M04"){ if (st.S==null) emit(li, "no-speed", { code:c }); st.spin = c; st.spinWarned = false; }
    if (c==="M05"){ st.spin = "M05"; st.spinWarned = false; }
  }
}

// Tool length offset: which offset is on, and an H that doesn't match the tool
function checkToolLength(K, ln){
  const { dialect, emit, st } = K;
  const { li, codes, get, groups } = ln;
  const tl = dialect.toolLength;
  if (tl) for (const c of codes) if ((groups["tool length"] || []).includes(c)){
    st.tloOn = tl.on.includes(c);
    if (st.tloOn){
      st.needTlo = false;
      const h = get(tl.word);
      if (h && !isVarVal(h.t) && st.T!=null && parseInt(h.v, 10)!==st.T) emit(li, "tlo-h-mismatch", { h:h.t, t:"T"+st.T });
    }
  }
}

// Cutter comp
function checkCutterComp(K, ln){
  const { lathe, emit, st } = K;
  const { li, codes, has, get } = ln;
  ln.compNew = codes.find(c => c==="G41" || c==="G42");
  if (has("G40")) st.comp = "G40";
  if (ln.compNew){ st.comp = ln.compNew; if (!lathe && !get("D") && st.D==null) emit(li, "comp-no-d", { code:ln.compNew }); }
}

// Motion and canned cycles: the cycle's words and labels, pattern codes, subprogram labels, dwell and G28
function checkCycles(K, ln){
  const { dialect, lathe, labelMap, emit, st, fc } = K;
  const { li, all, words, codes, has, get, groups, cycCode, def } = ln;
  const motionCodes = motionCodesFor(lathe);
  const mc = codes.filter(c => motionCodes.includes(c)).pop();
  if (has("G80") && !(lathe && isOkuma())){ st.cycle = null; st.cycleWords = {}; }
  if (mc){ st.motion = mc; if (st.cycle && !cycCode){ st.cycle = null; st.cycleWords = {}; } }
  if (cycCode){
    if (!st.cycle || def.modal===false) st.cycleWords = {};
    st.cycle = cycCode; st.oneShot = def.modal===false;
  }
  const cwk = ln.cwk = codes.find(c => dialect.codeWords?.[c]);
  if (st.cycle && !cwk) words.forEach(w => { if (!"GMN".includes(w.L)) st.cycleWords[w.L] = true; });
  if (cycCode){
    const name = def.name, mean = dialect.wordMeaning || {};
    for (const r of def.requires || []){
      if (st.cycleWords[r]) continue;
      if (r==="F" && !def.leadF && st.F!=null) continue;
      emit(li, "cycle-missing-word", { cycle:cycCode, name, word:r, meaning:def.meaning?.[r] || mean[r] || "required" });
    }
    if (def.choices && !def.choices.some(set => set.some(l => st.cycleWords[l])))
      emit(li, "cycle-missing-choice", { cycle:cycCode, name, choices:def.choices.map(s => s.join(", ")).join(" or ") });
    const ok = new Set([...(def.requires || []), ...(def.optional || []), ...(def.choices || []).flat(), "N","G","M","S","T","H","D","O", ...(def.feed ? ["F"] : [])]);
    words.forEach(w => { if (!ok.has(w.L)) emit(li, "cycle-stray-word", { cycle:cycCode, name, word:w.t }); });
    // Labels in another program (Fagor 8065 lathe: the profile in global subroutine Q) can't be checked here
    if (!(def.labelProgram && get(def.labelProgram)))
      for (const l of def.labels || []){
        const w = get(l);
        if (w && !isVarVal(w.t) && labelMap["N"+parseInt(w.v, 10)]===undefined) emit(li, "missing-label", { word:w.t, label:"N"+parseInt(w.v, 10) });
      }
    if (def.needsFeedPerMin && st.feed==="perRev" && !st.perMinSeen) {
      emit(li, "cycle-needs-feed-per-min", { cycle:cycCode, name, perRev:fc.perRev, perMin:fc.perMin });
    }
    if (def.speed && st.S==null) emit(li, "no-speed", { code:`${cycCode} (${name.toLowerCase()})` });
  }
  // Codes with words of their own (Fagor 8055 patterns and irregular pockets): the words they need, the labels they name,
  // and, for a pattern, a canned cycle or modal subroutine (MCALL) to repeat at each point
  if (all.some(t => /^\(MCALL\b/.test(t))) st.mcall = true;
  if (all.some(t => /^\(MDOFF\b/.test(t))) st.mcall = false;
  if (cwk){
    const cd = dialect.codeWords[cwk], what = l => { const x = cd.words?.[l]?.[1]; return x ? `${l} (${x[0].toLowerCase()}${x.slice(1)})` : l; };
    for (const n of cd.need || []){
      if (n.of.filter(l => get(l)).length >= n.count) continue;
      const list = (ls, and) => ls.length > 1 ? ls.slice(0, -1).join(", ") + and + ls[ls.length-1] : ls[0];
      const need = n.of.length===1 ? what(n.of[0]) : n.count===1 ? list(n.of, " or ") : `${["", "one", "two", "three", "four"][n.count] || n.count} of ${list(n.of, " and ")}`;
      emit(li, "code-missing-word", { code:cwk, name:cd.name, need });
    }
    if (cd.needsCycle && !st.cycle && !st.mcall) emit(li, "pattern-no-cycle", { code:cwk, name:cd.name });
    if (!get("Q")) for (const l of cd.labels || []){
      const w = get(l);
      if (w && !isVarVal(w.t) && labelMap["N"+parseInt(w.v, 10)]===undefined) emit(li, "missing-label", { word:w.t, label:"N"+parseInt(w.v, 10) });
    }
  }
  for (const [code, sc] of Object.entries(dialect.subCalls || {})){
    if (sc.target!=="label" || !has(code)) continue;
    const w = get(sc.word);
    if (w && !isVarVal(w.t) && labelMap["N"+parseInt(w.v, 10)]===undefined) emit(li, "missing-label", { word:`${code} ${w.t}`, label:"N"+parseInt(w.v, 10) });
  }
  if (has("G04") && !(dialect.dwellWords || ["P"]).some(l => get(l))) emit(li, "dwell-no-time", { words:(dialect.dwellWords || ["P"]).join(" or ") });
  if (has("G04") && dialect.dwellNoDecimal==="ms"){
    const p = get("P");
    if (p && p.v!=="" && !p.v.includes(".")){ const ms = Math.abs(parseInt(p.v, 10)); emit(li, "dwell-milliseconds", { word:p.t, ms, sec:fmt4(ms/1000) }); }
  }
  if (has("G28") && !dialect.foreign?.G28 && (groups.distance || []).includes("G90") && st.dist==="abs"){
    const ax = words.filter(w => "XYZ".includes(w.L));
    if (ax.length) emit(li, "g28-absolute", { axes:ax.map(w => w.t).join(" "), zeros:ax.map(w => w.L + "0.").join(" ") });
  }
}

// The move: the feed, spindle and tool length it needs, arcs, a rapid below Z0, and where the tool ends up
function checkMove(K, ln){
  const { dialect, lathe, emit, st, fc, P } = K;
  const { li, words, codes, has, get, groups, cycCode, def } = ln;
  const NONMOVE = ["G04","G10","G28","G30","G50","G52","G53","G65","G92"].filter(c => !dialect.cycles?.[c] && !(groups["tool length"] || []).includes(c));
  const nonMove = codes.some(c => NONMOVE.includes(c) || (dialect.noMoveCodes || []).includes(c));
  const axisWords = words.filter(w => (lathe ? "XZUW" : "XYZ").includes(w.L));
  const centerL = { G17:"IJ", G18:"IK", G19:"JK" }[st.plane];
  const centers = words.filter(w => centerL.includes(w.L));
  let kind = null;
  if (nonMove) kind = null;
  else if (st.cycle && (cycCode || axisWords.length)) kind = "cycle";
  else if (axisWords.length || (["G02","G03"].includes(st.motion) && centers.length)) kind = st.motion==="G00" ? "rapid" : st.motion ? "feed" : null;
  const cdef = st.cycle ? dialect.cycles[st.cycle] : null;
  const moveName = kind==="cycle" ? `${st.cycle} cycle` : st.motion==="G01" ? "G01 move" : st.motion==="G02" || st.motion==="G03" ? `${st.motion} arc` : `${st.motion} move`;
  const needsFeed = (kind==="feed" && !(dialect.leadCodes || []).includes(st.motion)) || (kind==="cycle" && cdef?.feed);
  if (needsFeed){
    if (st.F==null){ if (!st.noFwarned) emit(li, "no-feed-rate", { move:moveName, code:st.motion }); st.noFwarned = true; }
    // a cycle that needs a feed per minute (Fagor 8065 lathe live tool cycles) uses the G94 feed even in G95
    else if (st.Fmode && st.Fmode!==st.feed && !st.Fwarned && !(kind==="cycle" && st.Fmode==="perMin" && cdef?.needsFeedPerMin)){
      st.Fwarned = true;
      emit(li, "feed-mode-changed", { f:fmtNum("F", String(st.F), st).v, old:fc[st.Fmode] || st.Fmode, new:fc[st.feed] || st.feed, reading:FEED_UNIT[st.feed]?.[st.units] || st.feed });
    }
  }
  const cuts = kind==="feed" || (kind==="cycle" && (cdef?.spindle || cdef?.feed) && !cdef?.startsSpindle);
  if (cuts && P && !P.on.includes(st.torch) && !st.torchWarned){
    st.torchWarned = true;
    emit(li, "torch-off-cut", { move:moveName, state: st.torch ? st.torch + " is active" : "it was never turned on" });
  }
  if (cuts && !dialect.process && st.spin!=="M03" && st.spin!=="M04" && !st.spinWarned){
    st.spinWarned = true;
    emit(li, "spindle-off-feed", { move:moveName, code:st.motion, spin: st.spin ? st.spin + " is active" : "it was never started" });
  }
  if (!lathe && st.needTlo && kind && kind!=="cycle" && get("Z")){
    st.needTlo = false;
    emit(li, "tlo-missing", { line:st.tcLine, tlo:dialect.toolLength?.label || "G43 H", word:get("Z").t });
  }
  else if (!lathe && st.needTlo && kind==="cycle"){ st.needTlo = false; emit(li, "tlo-missing", { line:st.tcLine, tlo:dialect.toolLength?.label || "G43 H" }); }

  // Where the tool ends up (radius values for lathe X, which is a diameter)
  const p0 = {...st.pos}, p1 = {...st.pos};
  const val = (w) => w.n * ((lathe && (w.L==="X" || w.L==="U")) ? 0.5 : 1);
  for (const w of axisWords){
    if (isVarVal(w.t)){ p1[w.L==="U" ? "X" : w.L==="W" ? "Z" : w.L] = null; continue; }   // known only when it runs
    if (isNaN(w.n)) continue;
    if (w.L==="U" || w.L==="W"){ const a = w.L==="U" ? "X" : "Z"; p1[a] = p1[a]==null ? null : p1[a] + val(w); }
    else if (st.dist==="inc") p1[w.L] = p1[w.L]==null ? null : p1[w.L] + val(w);
    else p1[w.L] = val(w);
  }
  if (kind==="feed" && ["G02","G03"].includes(st.motion)){
    const [a1, a2] = { G17:["X","Y"], G18:["X","Z"], G19:["Y","Z"] }[st.plane];
    const rL = dialect.arcRadius || "R", R = get(rL);
    if (!R && !centers.length) emit(li, "arc-no-center", { code:st.motion, radius:rL, centers:centerL.split("").join(" and ") });
    if (R && centers.length) emit(li, "arc-r-and-ijk", { radius:rL, centers:centers.map(w => w.L).join(" and ") });
    const known = [p0[a1], p0[a2], p1[a1], p1[a2]].every(v => v!=null);
    const tol = dialect.arcTolerance?.[st.units] ?? 0.001;
    if (known){
      const same = Math.hypot(p1[a1]-p0[a1], p1[a2]-p0[a2]) < tol;
      if (R && same) emit(li, "arc-full-circle-r", { radius:rL, centers:centerL.split("").join(" and ") });
      if (!R && centers.length){
        const off = l => get(l)?.n || 0;
        const ca = p0[a1] + off(centerL[0]), cb = p0[a2] + off(centerL[1]);
        const r1 = Math.hypot(p0[a1]-ca, p0[a2]-cb), r2 = Math.hypot(p1[a1]-ca, p1[a2]-cb);
        if (Math.abs(r1 - r2) > tol) emit(li, "arc-radius-mismatch", { r1:fmt4(r1), r2:fmt4(r2), diff:fmt4(Math.abs(r1-r2)) });
      }
    }
  }
  if (ln.compNew && ["G02","G03"].includes(st.motion) && kind==="feed") emit(li, "comp-start-on-arc", { code:ln.compNew });
  if (!lathe && kind==="rapid" && !ln.cwk && get("Z") && st.dist==="abs" && p1.Z!=null && p1.Z < 0 && st.tloOn) {
    emit(li, "rapid-below-zero", { z:fmtNum("Z", get("Z").v, st).v });
  }
  if (has("G65") || (ln.cwk && (dialect.noMoveCodes || []).includes(ln.cwk))) st.pos = { X:null, Y:null, Z:null };
  else if (nonMove){
    if (has("G28") || has("G30") || has("G53") || has("G92") || has("G50")) axisWords.forEach(w => { st.pos[w.L==="U" ? "X" : w.L==="W" ? "Z" : w.L] = null; });
  }
  else if (kind==="cycle"){ if (!lathe){ st.pos.X = p1.X; st.pos.Y = p1.Y; } }
  else st.pos = p1;
  // Modes a cycle leaves active (Fagor 8065 lathe: G00, G40 and G90 after G66, G68 and G69)
  for (const k of def?.after || []){
    if (motionCodesFor(lathe).includes(k)) st.motion = k;
    if (["G40","G41","G42"].includes(k)) st.comp = k;
    if ((groups.distance || []).includes(k)) st.dist = isIncCode(k) ? "inc" : "abs";
  }
}



/* A control whose rules are a first draft (not yet checked against its programming manual) gets one banner above the
   program, which can be dismissed. Dismissing it is remembered for that control in settings.json. */
let DRAFT_OK = new Set();
window.loadDraftDismissed = list => { if (Array.isArray(list)) DRAFT_OK = new Set(list); };
function drawDraftBar(){
  const bar = $("draftbar");
  const key = MACHINES[machineId]?.brand + "." + mtype();
  const show = activeTab >= 0 && !DIALECT.verified && !DRAFT_OK.has(key);
  bar.hidden = !show; if (!show) return;
  $("draftbar-t").textContent = `${DIALECT.label} rules are a first draft: they haven't been checked against the programming manual yet, so the gloss and checks may be wrong for this control.`;
}
$("draftbar-x").addEventListener("click", () => {
  DRAFT_OK.add(MACHINES[machineId]?.brand + "." + mtype()); window.saveDraftDismissed?.([...DRAFT_OK]); drawDraftBar();
});
function drawProblems(){
  const box = $("probs"); box.classList.toggle("closed", !probsOpen); box.classList.toggle("empty", !PROBLEMS.length);
  const cnt = sev => PROBLEMS.filter(p => p.sev===sev).length;
  $("probs-c").innerHTML = ["error","warning","info"].map(sev =>
    `<button class="pf ${sev}" data-f="${sev}" aria-pressed="${probFilter[sev]}" title="Show or hide ${sev}s">${SEV_ICON[sev]} ${cnt(sev)}</button>`).join("");
  $("probs-tg").textContent = probsOpen ? "▾" : "▸";
  const lab = li => /^N\d/.test(doc[li]?.[0] || "") ? doc[li][0] : (/^O\d/.test(doc[li]?.[0] || "") ? doc[li][0] : "Ln " + (li+1));
  const rows = PROBLEMS.filter(p => probFilter[p.sev]);
  $("probs-l").innerHTML = (rows.length ? rows.map(p =>
    `<div class="pr ${p.sev}${p.li===curLine?" on":""}" data-li="${p.li}" title="${esc(p.why)}"><span class="pi">${SEV_ICON[p.sev]}</span><span class="pn">${lab(p.li)}</span><span class="pt">${esc(p.msg)}</span><span class="pid">${p.id}</span></div>`).join("")
    : `<div class="pnone">${PROBLEMS.length ? "Nothing to show with these filters." : "No problems found for " + esc(DIALECT.label) + "."}</div>`);
}
