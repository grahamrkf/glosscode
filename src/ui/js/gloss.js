/* ---------- Dictionary and modes ---------- */
// Where dictionary overrides come from, most specific first: the dialect itself, then (while a
// dialect sets "inheritWords": true) the dialect it inherits.
// Okuma's own language (no G54, LAP contours, V variables), on any Okuma control: okuma, okumau10l, okuma7000l, okumae100l
const isOkuma = (brand = MACHINES[machineId].brand) => brandChain(brand).includes("okuma");
function brandChain(brand = MACHINES[machineId].brand){
  const out = []; let b = brand;
  while (b && !out.includes(b)){ out.push(b); if (RULES.dialects[b]?.inheritWords !== true) break; b = RULES.dialects[b].inherits; }
  return out;
}
// A machine type can start from another's tables and words: a plasma machine reads G code the way its
// control's mill does (RULES.machineTypes), so "tormach.plasma" falls back to "tormach.mill".
const baseType = (t = mtype()) => RULES.machineTypes?.[t]?.base || null;
function entry(key){
  const types = [mtype(), baseType()].filter(Boolean);
  for (const b of brandChain()){
    for (const t of types){ const ov = DICT.machineOverrides[b+"."+t]?.[key]; if (ov) return ov; }
    const ov = DICT.machineOverrides[b]?.[key];
    if (ov) return ov;
  }
  const e = DICT.codes[key]; if (!e) return null;
  return (e.words || e.short) ? e : (types.map(t => e[t]).find(x => x != null) ?? null);
}
function newState(){
  const lathe = mtype()==="lathe";
  return { units:"inch", dist:"abs", feed: lathe ? "perRev" : "perMin", spin:"rpm", cycle:false, dwell:false, sub:false, local:false,
    motion:null, cycleCode:null, oneShot:false, plane: lathe ? "G18" : "G17", unitCode:"G20", distCode:"G90", feedCode: feedCodes()[lathe ? "perRev" : "perMin"], spinCode:"G97",
    comp:"G40", tlen: DIALECT.toolLength?.off || "G49", tlenOn:false, wcs: isOkuma() ? (lathe ? null : "G15 H1") : "G54", spinDir:"M05", cool:"M09", torch:null, F:null, S:null, T:null, H:null, chg:[] };
}
// G-codes for feed per minute and per rev on this control (G94/G95, or G98/G99 on Fanuc-style lathes)
// A plasma control with no feed mode codes has none (Hypertherm's G98 ends a loop).
function feedCodes(){
  const g = DIALECT.modalGroups?.["feed mode"] || [], none = !!DIALECT.process && !g.length;
  return { perMin: g.includes("G94") ? "G94" : none ? null : "G98", perRev: g.includes("G95") ? "G95" : none ? null : "G99" };
}
// The lathe code that clamps the spindle speed and, with X or Z, sets the coordinates:
// G50 in G code system A, G92 in systems B and C.
const clampCode = () => DIALECT.speedClamp?.code || "G50";
// The lathe code that, with X or Z, sets the coordinates: the clamp code (G50, or G92 in systems B and C) unless the dialect names another (Fagor 8060 lathe: G92, with G192 for the speed limit)
const coordSetCode = () => DIALECT.coordSet || clampCode();
// Incremental positions: G91, or G191 on a Mitsubishi lathe (whose G90/G91 are other codes there).
const isIncCode = k => k==="G91" || k==="G191";
// The letters a cycle on this line reads as its own words, not as F, S or M (Fagor 8055 lathe G68: S is a label, F the last pass feed, M a stock)
function ownWords(toks){
  for (const t of toks){ if (!/^G\d/.test(t)) continue; const o = DIALECT.cycles?.[pad2(t)]?.ownWords; if (o) return o; }
  return [];
}
function applyModes(toks, st){
  st.dwell = false; st.sub = false; st.local = false; st.lib = null; st.chg = []; st.subWord = null; st.codeW = null;
  st.zeroShift = mtype()==="lathe" && toks.some(t => isCode(t, coordSetCode())) && toks.some(t => /^[XZUW](?:[-+]?[\d.#[]|[-+][A-Z]|=)/.test(t));
  // Okuma automatic chamfer or rounding (G75, G76): L on that line is the corner's size
  st.corner = toks.map(pad2).find(k => /^G\d/.test(k) && entry(k + ".L")) || null;
  // pos, cyc and ever are copied, not changed in place, because lineState keeps a shallow copy of every line's state.
  st.pos = { ...st.pos }; st.posW = { ...st.posW }; st.cyc = { ...st.cyc }; st.ever = { ...st.ever };
  if (st.oneShot){ st.cycle = false; st.cycleCode = null; st.oneShot = false; st.cyc = {}; }
  const set = (f, v) => { st[f] = v; st.chg.push(f); st.ever[f] = 1; };
  const D = DIALECT, groups = D.modalGroups || {}, fc = feedCodes();
  const wcsLine = toks.some(t => isCode(t,"G15")), own = ownWords(toks);
  let after = [];   // modes the line's cycle leaves active (Fagor 8065 lathe: G00, G40 and G90 after G68)
  for (const t of toks){
    if (own.includes(t[0])) continue;   // a cycle's own word (Fagor 8055 lathe: S is a label, M a finish stock)
    if (/^[FSTH](?:[-+]?[\d.]+|[-+]?[#[].*)$/.test(t)){
      if (t[0]==="H" && wcsLine) set("wcs", "G15 " + t); else if (!(t[0]==="S" && toks.some(w => isCode(w, clampCode())) && mtype()==="lathe")) set(t[0], t);
      continue;
    }
    if (t==="CALL") st.sub = true;
    if (!/^[GM]\d/.test(t)) continue;
    const k = pad2(t), cyc = D.cycles?.[k];
    if (["G00","G01","G02","G03"].includes(k)){ set("motion", k); st.cycleCode = null; st.cycle = false; st.cyc = {}; }
    if (["G17","G18","G19"].includes(k)) set("plane", k);
    const uc = DIALECT.unitCodes===undefined ? { inch:"G20", mm:"G21" } : DIALECT.unitCodes;
    if (uc && k===uc.inch){ st.units="inch"; set("unitCode", k); } if (uc && k===uc.mm){ st.units="mm"; set("unitCode", k); }
    if ((groups.distance || []).includes(k)){ st.dist = isIncCode(k) ? "inc" : "abs"; set("distCode", k); }
    if (k===fc.perMin && !cyc){ st.feed="perMin"; set("feedCode", k); }
    if (k===fc.perRev && !cyc){ st.feed="perRev"; set("feedCode", k); }
    if (!D.process && !D.noCss){ if (k==="G96"){ st.spin="css"; set("spinCode", k); } if (k==="G97"){ st.spin="rpm"; set("spinCode", k); } }
    if (["G40","G41","G42"].includes(k)) set("comp", k);
    if ((groups["tool length"] || []).includes(k)){ set("tlen", k); st.tlenOn = (D.toolLength?.on || []).includes(k); }
    if ((groups["work offset"] || []).includes(k) && k!=="G15") set("wcs", k);
    if (cyc){ st.cycle = true; set("cycleCode", k); st.oneShot = cyc.modal===false; after = cyc.after || after; }
    if (k==="G80" && !(mtype()==="lathe" && isOkuma())){
      st.cycle = false;
      set("cycleCode", null);
      st.cyc = {};
      if (mtype()!=="lathe") st.pos.Z = st.posW.Z = null;
    }
    if (D.process){ if (D.process.on.includes(k) || D.process.off.includes(k)) set("torch", k); }   // a plasma torch, not a spindle and coolant
    else {
      if (["M03","M04","M05"].includes(k)) set("spinDir", k);
      if (["M08","M09","M88","M89"].includes(k)) set("cool", k);
    }
    if (k==="G04") st.dwell = true;
    if (D.codeWords?.[k]){ st.codeW = k; continue; }   // a code whose words mean something of their own (Fagor 8055 G60-G68 patterns and pockets)
    if (k==="M98" || k==="M97" || k==="G65") st.sub = true;
    { const sw = D.subCalls?.[k]?.word; if (sw && sw!=="P"){ st.sub = true; st.subWord = sw; } }
    if (k==="M97") st.local = true;
    if (k==="G65") st.lib = window.libFor?.(toks) || null;   // a library subprogram: its arguments read by name
  }
  for (const k of after){
    if (["G00","G01","G02","G03"].includes(k)) set("motion", k);
    if (["G40","G41","G42"].includes(k)) set("comp", k);
    if ((groups.distance || []).includes(k)){ st.dist = isIncCode(k) ? "inc" : "abs"; set("distCode", k); }
  }
  if (SYNTAX==="klartext") klModes(toks, st, set);
  trackCarry(toks, st);
}
// Where each axis was last sent (X as written, so a lathe X is a diameter), and the R and Q an active canned
// cycle keeps using. Column view shows these greyed out on lines that don't write them.
const AXES = { X:["X","U"], Y:["Y","V"], Z:["Z","W"] };
function trackCarry(toks, st){
  const lathe = mtype()==="lathe";
  if (SYNTAX==="klartext"){   // only a path function moves the tool; IX IY IZ move it from where it is, polar moves aren't followed
    const h = klHeadOf(toks); if (!h || !KL_MOVE.test(h)) return;
    if (/^(?:LP|CP|CTP)$|^(?:APPR|DEP) P/.test(h)){ st.pos = { ...st.pos, X:null, Y:null }; st.posW = { ...st.posW, X:null, Y:null }; }
    for (const A of ["X","Y","Z"]){
      const ta = toks.find(t => new RegExp("^" + A + "[-+]?[\\d.]+$").test(t));
      const ti = toks.find(t => new RegExp("^I" + A + "[-+]?[\\d.]+$").test(t));
      const tq = toks.find(t => new RegExp("^I?" + A + "[-+]?Q").test(t));
      if (tq){ st.pos[A] = null; st.posW[A] = null; continue; }
      if (ta){ st.pos[A] = parseFloat(ta.slice(1)); st.posW[A] = ta; }
      else if (ti){ st.pos[A] = st.pos[A]!=null ? st.pos[A] + parseFloat(ti.slice(2)) : null; st.posW[A] = null; }
    }
    return;
  }
  if (st.cycle) for (const t of toks) if (/^[RQ][-+]?[\d.]+$/.test(t)) st.cyc[t[0]] = t;
  const has = c => toks.some(t => isCode(t, c));
  if (has("G04") || has("G65") || has("M97") || has("M98") || toks.includes("CALL")) return;   // X and P there are a dwell or arguments
  if ((DIALECT.noMoveCodes || []).some(has)) return;   // X and Y there are a pattern's sizes
  const unknown = ["G28","G30","G53","G52","G92"].some(has) || (lathe && has(coordSetCode())) || (lathe && st.cycle);
  for (const [A, [abs, inc]] of Object.entries(AXES)){
    const isVal = t => /^.[-+]?[\d.]+$/.test(t) || isVarVal(t);
    const ta = toks.find(t => t[0]===abs && isVal(t)), ti = toks.find(t => t[0]===inc && isVal(t));
    if (!ta && !ti) continue;
    st.posW[A] = null;   // the word as written, shown when it still says where the axis is
    if ((ta && isVarVal(ta)) || (!ta && isVarVal(ti))){ if (ta && st.dist!=="inc") st.posW[A] = ta; st.pos[A] = null; continue; }   // worked out when it runs
    if (unknown || (st.cycle && st.dist==="inc" && A==="Z")){ st.pos[A] = null; continue; }
    if (ta && st.dist!=="inc") st.posW[A] = ta;
    const val = t => parseFloat(fmtNum(t[0], t.slice(1), st).v);
    if (ta) st.pos[A] = st.dist==="inc" ? (st.pos[A]!=null ? st.pos[A] + val(ta) : null) : val(ta);
    else if (lathe) st.pos[A] = st.pos[A]!=null ? st.pos[A] + val(ti) : null;   // U V W add to the position on a lathe
  }
}
// Numbers in the English line always show their decimal point, so X1. reads X1.0.
// A distance word written with no decimal point (X1) is read the way the control reads it:
// as the smallest increment, 0.0001 in or 0.001 mm on Fanuc-style controls.
function fmtNum(L, raw, st){
  if (raw==="" || raw==null) return { v:"" };
  if (/^(?:[-+]?[#[]|[-+][A-Z]|=|P\d)/.test(raw)) return { v:raw };   // a macro variable or expression: worked out when the line runs
  const sign = raw[0]==="-" ? "-" : "", body = raw.replace(/^[-+]/, "");
  if (body.includes(".")){
    let x = body; if (x.startsWith(".")) x = "0" + x; if (x.endsWith(".")) x += "0";
    return { v: sign + x };
  }
  const nums = DIALECT.numbers;
  if (nums?.noDecimal==="leastIncrement" && nums.words.includes(L) && /^\d+$/.test(body)){
    const n = parseInt(body, 10); if (n===0) return { v:"0.0" };
    const inc = nums.increment[st.units], d = st.units==="inch" ? 4 : 3;
    return { v: sign + (n*inc).toFixed(d), implied:true, intended: sign + body + "." };
  }
  if (L==="F") return { v: sign + body + ".0" };
  return { v: sign + body };
}
// Units come from DICT.address (F: IPM/IPR/MMPM/MMPR, S: RPM/SFM/SMM) and show in small lower case after the number.
const FEED_UNIT = { perMin:{ inch:"ipm", mm:"mmpm" }, perRev:{ inch:"ipr", mm:"mmpr" } };
const SPEED_UNIT = { rpm:{ inch:"rpm", mm:"rpm" }, css:{ inch:"sfm", mm:"smm" } };
const UNIT_WORDS = { ipm:"inches per minute", ipr:"inches per rev", mmpm:"mm per minute", mmpr:"mm per rev", rpm:"RPM", sfm:"surface feet per minute", smm:"surface meters per minute" };
// A code is control-specific when its full word isn't one the base dictionary uses for any code:
// only this control (or builder) has it. The gloss row marks these with a dotted underline.
let BASEW = null, BASEW_OF = null;
function isCs(e){
  if (!e?.words || e.words.startsWith("torch.")) return false;   // torch words are standard on every plasma control
  if (BASEW_OF!==DICT.codes){ BASEW = new Set(); BASEW_OF = DICT.codes;
    for (const v of Object.values(DICT.codes)){
      if (v.words) BASEW.add(v.words);
      for (const x of Object.values(v)) if (x && typeof x==="object" && x.words) BASEW.add(x.words);
    } }
  return !BASEW.has(e.words);
}
function word(t, st, ctx){
  if (isComment(t)) return { g:t, e:"", cm:true, d:"Comment, kept as written" };
  if (SYNTAX==="klartext"){ const kw = klWord(t, st); if (kw) return kw; }
  if (SYNTAX==="fagor8060"){
    // Labels (N10: and [NAME]), the NR repeat count, and statements read by their first word ($IF, #CALL, %L, LL)
    if (/^N\d+:$/.test(t)) return { g:t, e:"N"+t.slice(1), d:`Sequence number ${t.slice(1, -1)}, a label other lines can jump to` };
    if (/^\[\w+\]$/.test(t)) return { g:t, e:vw("LABEL", t), d:`Label ${t.slice(1, -1)}, a place other lines can jump to` };
    if (/^NR\d+$/.test(t)) return { g:t, e:vsty(REPT, t.slice(2)), d:`Run this line ${t.slice(2)} times` };
    const w1 = /^(?:[#$][A-Z]+|%L(?= )|%|LL?(?= ))/.exec(t)?.[0];
    if (w1){
      const e = entry(w1), rest = t.slice(w1.length);
      return e ? { g:t, e:sty(e)+(rest && rest[0]!==" " ? " " : "")+rest, d:e.desc, code:w1 } : { g:t, e:"?"+t, unk:true, d:`${w1} isn't a statement GlossCode knows on this control.` };
    }
    if (st?.dwell && /^\d*\.?\d+$/.test(t)) return { g:t, e:vsty(DICT.address.P.dwell, t), d:`Dwell for ${t} seconds` };
  }
  if (SYNTAX==="fagor8055"){
    // The header line, and statements in ( ): an assignment reads as written, others by their first word
    if (t[0]==="%"){ const e = entry("%"), rest = t.slice(1); if (e) return { g:t, e:sty(e)+(rest && rest[0]!==" " ? " " : "")+rest, d:e.desc, code:"%" }; }
    if (t[0]==="("){
      const inner = t.slice(1, t.endsWith(")") ? -1 : undefined);
      if (/^[A-Z][A-Z0-9]*(?:\([^)]*\))? ?=/.test(inner)) return { g:t, e:inner, d:"Sets parameters or variables, worked out when the line runs" };
      const w1 = /^[A-Z]+/.exec(inner)?.[0], e = w1 ? entry("(" + w1) : null;
      if (e){ const rest = inner.slice(w1.length); return { g:t, e:sty(e)+(rest && rest[0]!==" " ? " " : "")+rest, d:e.desc, code:"("+w1 }; }
      return { g:t, e:"?"+t, unk:true, d:`${w1 || t} isn't a statement GlossCode knows on this control.` };
    }
  }
  // Text that isn't a word is kept and shown as written: ";" (end of block), "%" (program start and end), or flagged.
  if (/^,[CR]/.test(t) && DICT.address[t.slice(0, 2)]){   // ,C chamfer and ,R corner radius
    const a = DICT.address[t.slice(0, 2)], v = fmtNum("X", t.slice(2), st).v;
    return { g:t, e:vsty(a, v), d:`${a.desc} ${v}` };
  }
  if (!/^[A-Za-z#\/]/.test(t)){
    if (t===";") return { g:t, e:";", d:"End of block (;)", code:";" };
    if (t==="%") return { g:t, e:"%", d:"Program start or end mark (%), kept as written", code:"%" };
    if (t==="\x1a") return { g:t, e:"EOF", d:"End-of-file mark (Ctrl+Z) that older systems write after the last line, kept as written" };
    return { g:t, e:"?"+t, unk:true, d:`${t} isn't G-code GlossCode can read. It's kept as written.` };
  }
  if (t[0]==="/"){
    const e = entry("/");
    if (!e) return { g:t, e:"?/", unk:true, d:"Block delete isn't in the dictionary." };
    return { g:t, e:t.length > 1 ? vsty(e, t.slice(1)) : sty(e), d:e.desc + (t.length > 1 ? ` (switch ${t.slice(1)})` : ""), code:"/" };
  }
  if (isMacroTok(t)) return macroWord(t);
  if (isKw(t)){
    // A statement with arguments (Okuma PS LC,[0,0],[-2,55]) reads by its first word, and the rest as written
    const e = entry(t), w1 = /^[A-Z]+/.exec(t)[0], e1 = !e && w1!==t ? entry(w1) : null;
    if (e1) return { g:t, e:sty(e1) + t.slice(w1.length), d:e1.desc, code:w1 };
    return e ? { g:t, e:sty(e), d:e.desc, code:t, ...(isCs(e) ? { cs:true } : {}) } : { g:t, e:"?"+t, unk:true, d:`${t} isn't a keyword on this machine.` };
  }
  const letter = t[0], raw = t.slice(1), num = fmtNum(letter, raw, st), value = num.v;
  const own = st.cycleCode && (DIALECT.cycles?.[st.cycleCode]?.ownWords || []).includes(letter);
  if ((letter==="G" || letter==="M") && /^.P\d/.test(t)) return { g:t, e:t, d:`${letter} code from parameter ${raw}, known when the line runs` };
  if (letter==="G" || (letter==="M" && !own)){
    const k = pad2(t);
    const e = (k===coordSetCode() && st.zeroShift && entry(k + ".shift")) || entry(k);   // a lathe G50 (G92 in systems B and C) with X or Z sets the coordinates
    if (!e) return { g:t, e:"?"+k, unk:true, d:`${k} isn't in the dictionary or this machine's file.` };
    return { g:t, e:sty(e), d:e.desc, code:k, ...(isCs(e) ? { cs:true } : {}) };
  }
  // A subprogram call whose program word isn't P (Mitsubishi M2/M0: G22 L2200 P5, P the repeat count)
  if (st.subWord && (letter===st.subWord || letter==="P")) {
    return letter==="P" ? { g:t, e:vsty(REPT, value), d:`Repeat ${value} times` } : { g:t, e:vsty({ ...DICT.address.P.sub, short:letter }, value), d:`Program number ${value}` };
  }
  // On a code with words of its own (Fagor 8055 G60 linear pattern: X is its length, K the number of points)
  if (st.codeW && letter!=="N"){
    const cd = DIALECT.codeWords[st.codeW], cw = cd.words?.[letter];
    if (cw) return { g:t, e:vw(cw[0], (cd.labels || []).includes(letter) ? raw : value), ...(num.implied ? { imp:true } : {}), d:`${cw[1]} (${st.codeW})` };
  }
  // On a G65 line that calls a library subprogram, each argument reads as the name the library gives it.
  if (st.lib && letter!=="N" && letter!=="O"){ const lw = window.libWord?.(st.lib, letter, raw, num, st); if (lw) return lw; }
  // Inside a canned cycle, a word can mean something special (Haas G76 A is the tool angle). cycleHelp says so.
  if (st.cycleCode && (letter!=="N" || ctx==="ref") && (!"FSXYZ".includes(letter) || (letter==="Z" && DIALECT.cycleRefZ) || own)){
    const cw = cycleWord(st.cycleCode, letter);
    if (cw?.en) return { g:t, e:vw(cw.en, value), ...(num.implied ? { imp:true } : {}), d:`${cw.what} (${st.cycleCode})` };
  }
  const address = DICT.address[letter];
  if (!address) {
    // Okuma lathes give an arc's radius with L (G03 X Z L), where other controls use R
    if (letter==="L" && st.corner){
      const x = entry(st.corner + ".L");
      return { g:t, e:vsty(x, value), ...(num.implied ? { imp:true } : {}), d:`${x.desc} ${value}` };
    }
    if (letter===DIALECT.arcRadius && ["G02","G03"].includes(st.motion) && !st.cycleCode) {
      return { g:t, e:vsty(DICT.address.R.arc, value), ...(num.implied ? { imp:true } : {}), d:"Arc radius" };
    }
    return { g:t, e:"?"+letter, unk:true, d:`Address letter ${letter} isn't in the dictionary.` };
  }
  // A later N word names another line: the one a GOTO or IF jumps to, or where an Okuma LAP contour starts (G85 NA1)
  // Fagor 8055: an N after the first word repeats the line (N0 makes the move without the active cycle)
  if (letter==="N" && ctx==="ref" && SYNTAX==="fagor8055") {
    return { g:t, e:vsty(REPT, raw), d: /^0+$/.test(raw) ? "Make the move without running the active cycle" : `Run this line ${raw} times` };
  }
  if (letter==="N" && ctx==="ref") return { g:t, e:"N"+raw, d:`The line labeled N${raw}` };
  // G04 F2. on controls that give the dwell time with F (Okuma)
  if (letter==="K" && st.dwell && (DIALECT.dwellWords || []).includes("K")){
    if (DIALECT.dwellHundredths) {
      return { g:t, e:vsty({ words:"dwell", short:"DWL" }, value), d:`Dwell for ${value} hundredths of a second` };
    }   // Fagor 8055: K50 is half a second
    const x = DICT.address.P.dwell; return { g:t, e:vsty(x, value), d:`Dwell for ${value} seconds` };
  }
  if (letter==="F" && st.dwell && (DIALECT.dwellWords || []).includes("F")){
    const x = DICT.address.P.dwell;
    return { g:t, e:vsty(x, value), d:`Dwell for ${value} seconds` };
  }
  const imp = num.implied ? { imp:true, d2:`No decimal point, so this reads as ${value} ${st.units==="inch"?"in":"mm"}. Write ${letter}${num.intended} for ${num.intended.replace(/\.$/,"")} ${st.units==="inch"?"in":"mm"}.` } : {};
  if (letter==="F"){
    const u = FEED_UNIT[st.feed]?.[st.units] || "";
    return { g:t, e:vw(style==="short" ? "F" : "feed", value), u:style==="short" ? u : "", d:`Feed rate ${value} ${UNIT_WORDS[u] || ""}` };
  }
  if (letter==="S"){
    const u = SPEED_UNIT[st.spin][st.units];
    return { g:t, e:vw(style==="short" ? "S" : "speed", value), u:style==="short" ? u : "", d: st.spin==="css" ? `Surface speed ${value} ${UNIT_WORDS[u]}` : `Spindle speed ${value} RPM` };
  }
  if ("XYZ".includes(letter)){
    const x = address[st.dist];
    return { g:t, e:vsty(x, value), ...imp, d: imp.d2 || (st.dist==="inc" ? `Move ${value} in ${letter} from where the tool is` : `${letter} position ${value}`) };
  }
  if (letter==="U"||letter==="W"){
    if (mtype()!=="lathe") return { g:t, e:"?"+letter, unk:true, d:`${letter} is only used on lathes.` };
    return { g:t, e:vsty(address.lathe, value), ...imp, d: imp.d2 || address.lathe.desc+" "+value };
  }
  if (letter==="R"){
    const x = st.cycle ? address.cycle : address.arc;
    return { g:t, e:vsty(x, value), ...imp, d: imp.d2 || (st.cycle ? "Retract plane for the drilling cycle" : "Arc radius") };
  }
  const cy = st.cycleCode && DIALECT.cycles?.[st.cycleCode];
  if (cy?.labels?.includes(letter)) {
    return { g:t, e:vw(letter==="P" ? "FROM" : "TO", raw), d:`${letter==="P" ? "First" : "Last"} line of the contour, N${raw}` };
  }
  if (cy && mtype()==="lathe" && letter==="D") return { g:t, e:vw("DEPTH", value), d:`Depth of each pass, ${value}` };
  if (cy && mtype()==="lathe" && letter==="K" && cy.leadF) return { g:t, e:vw("THDHT", value), d:`Thread height, ${value}` };
  if (letter==="H" && (ctx==="wcs" || (st.chg?.includes("wcs") && String(st.wcs).startsWith("G15")))) {
    return { g:t, e:vw(style==="short" ? "WOFS" : "woffset", raw), d:`Work offset number ${raw}` };
  }
  if (letter==="P" && st.local) return { g:t, e:vw(style==="short" ? "LBL" : "label", value), d:`Jump to the line labeled N${value} and run it until M99` };
  if (letter==="P"){
    const x = st.sub ? address.sub : address.dwell;
    return { g:t, e:vsty(x, value), d: st.sub ? `Program number ${value}` : `Dwell for ${value} seconds` };
  }
  if (letter==="N") return { g:t, e:"N"+value, ...imp, d: imp.d2 || `${address.desc} ${value}` };   // a sequence number reads as written: N10
  const ax = address[mtype()]?.words ? address[mtype()] : address;   // a letter can read differently on one machine type (D is the kerf on a plasma table)
  return { g:t, e:vsty(ax, value), ...imp, d: imp.d2 || `${ax.desc} ${value}` };
}
// Macro text: "#110=-0.035" sets a variable; IF, WHILE and END are macro statements. They read as written.
function macroWord(t){
  if (t[0]==="#"){
    const m = /^(#(?:\d+|\[.*\]))=(.+)$/.exec(t);
    if (!m) return { g:t, e:"?"+t, unk:true, d:`${t} has no = and value, so it doesn't set the variable.` };
    return { g:t, e:t, d:/^[-+]?[\d.]+$/.test(m[2]) ? `Sets macro variable ${m[1]} to ${m[2]}` : `Sets macro variable ${m[1]} to ${m[2]}, worked out when the line runs` };
  }
  { const m = /^([A-Z][A-Z0-9]+)=(.+)$/.exec(t);   // Okuma: V1=3 (a common variable) or DIA1=160 (a local variable)
    if (m) {
      return { g:t, e:t, d:/^[-+]?[\d.]+$/.test(m[2]) ? `Sets variable ${m[1]} to ${m[2]}` : `Sets variable ${m[1]} to ${m[2]}, worked out when the line runs` };
    } }
  if (t.startsWith("GOTO ")) return { g:t, e:t, d:`Jump to N${t.slice(5).replace(/^N/, "")}` };
  if (t.startsWith("IF")) return { g:t, e:t, d:"Macro IF statement: when the condition in [ ] is true, the rest of the line runs" };
  if (t.startsWith("WHILE")) return { g:t, e:t, d:"Macro WHILE loop: runs the lines down to the matching END while the condition in [ ] is true" };
  return { g:t, e:t, d:`End of WHILE loop ${t.slice(3)}` };
}
// Only a line's first word (after a "/") is its sequence number; a later N word names a line to jump to.
const refN = (toks, i) => toks[i][0]==="N" && i > (/^\/\d?$/.test(toks[0] || "") ? 1 : 0);
// Modes are tracked in the order the machine runs the lines, so a subprogram
// is read with the modes active at its call. Lines never run fall back to file order.
/* ---------- Reading again only what an edit changed ----------
   translateAll and checkProgram walk the program in run order, carrying the machine state (modes, units, plane, feed,
   speed, tool, offsets, comp, position, cycle words) from line to line. Each run keeps every visit's state after the
   line. After an edit the walk starts again, and a visit is taken from the last run when its line is unchanged and the
   visit before it was too, or was read again and ended in the same state as last time. So the lines from an edit on
   are read again until the state matches the last run, and from there on until the next edited line nothing is read.
   Each call of a subprogram is its own visit, matched separately, and an edit to a label, a call or a jump just walks
   a different way: a visit is only reused when it follows the same visit it followed last time. Anything that changes
   how every line reads (another machine, the word style, the dictionary, which labels exist) starts afresh.
   memoCheck(true) in the developer console also reads and draws everything the slow way after each change and reports
   any line where the two differ (a test mode, for finding a state this misses). */
let MEMO_CHECK = false;
window.memoCheck = on => { MEMO_CHECK = on!==false; TRUN = CRUN = null; return MEMO_CHECK; };
function memoCompare(){
  const v = view, ls = lineState, pr = PROBLEMS, bad = [];
  translateAll(true); const pf = checkProgram(true);
  const j = x => JSON.stringify(x, (k, v) => v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : v);   // key order aside
  for (let li = 0; li < doc.length && bad.length < 5; li++){
    if (j(v[li])!==j(view[li])) bad.push(`line ${li+1}: gloss`);
    else if (j(ls[li])!==j(lineState[li])) bad.push(`line ${li+1}: modes ` + Object.keys({ ...ls[li], ...lineState[li] }).filter(k => j(ls[li]?.[k])!==j(lineState[li]?.[k])).map(k => `${k} ${j(ls[li]?.[k])} (should be ${j(lineState[li]?.[k])})`).join(", "));
  }
  if (j(pr)!==j(pf)) bad.push(`problems differ: ${pr.length} vs ${pf.length}`);
  PROBLEMS = pf;
  if (bad.length){
    TRUN = CRUN = null;
    console.warn("Re-reading only the changed lines gave different results:\n" + bad.join("\n"));
    setMsg("memoCheck: re-reading only the changed lines gave different results (see the console).", true);
  }
  return bad;
}
// A copy of a state two levels deep (pos, cyc, ever and the like are objects of plain values).
function snapSt(st){
  const o = {};
  for (const k in st){ const v = st[k]; o[k] = v && typeof v==="object" ? (Array.isArray(v) ? v.slice() : { ...v }) : v; }
  return o;
}
function sameVal(x, y, d){
  if (x===y) return true;
  if (!d || !x || !y || typeof x!=="object" || typeof y!=="object" || Array.isArray(x)!==Array.isArray(y)) return false;
  if (Array.isArray(x)) return x.length===y.length && x.every((v, i) => sameVal(v, y[i], d - 1));
  for (const k in x) if (!sameVal(x[k], y[k], d - 1)) return false;
  for (const k in y) if (!(k in x)) return false;
  return true;
}
const sameSt = (a, b) => sameVal(a, b, 3);
// What every line's reading depends on besides its own words and the state it starts in.
function runSig(extra){
  return { s:[machineId, style, SYNTAX, mtype(), extra || ""].join("|"), ids:[DIALECT, DICT.codes, DICT.address, DICT.machineOverrides, RULES.rules, MACHINES[machineId], COLS] };
}
const sameSig = (a, b) => !!a && !!b && a.s===b.s && a.ids.every((x, i) => x===b.ids[i]);
const lineKey = toks => toks.join("\u0001");
// The lines before and after the edited block are the last run's lines, moved by the number of lines added or removed;
// the edited block's lines have no old line.
function lineMap(oldKeys, keys){
  const m = oldKeys.length, n = keys.length; let p = 0, s = 0;
  while (p < m && p < n && oldKeys[p]===keys[p]) p++;
  while (s < m - p && s < n - p && oldKeys[m-1-s]===keys[n-1-s]) s++;
  return { toOld: li => li < p ? li : li >= n - s ? li - n + m : -1, toNew: o => o < p ? o : o >= m - s ? o + n - m : -1, shift: n - m };
}
// Each line's visits in a run, by line: the index of the line's first, second… visit in the run's list.
function visitsByLine(seqLi){ const by = []; seqLi.forEach((li, k) => (by[li] ||= []).push(k)); return by; }
let MEMO_STATS = { read:0, reused:0 };
let TRUN = null, CRUN = null;
function translateAll(full){
  view = []; lineState = [];
  const seen = new Array(doc.length).fill(false), keys = doc.map(lineKey), sig = runSig();
  const P = !full && sameSig(TRUN?.sig, sig) ? TRUN : null, map = P && lineMap(P.keys, keys);
  const seq = [], seqLi = [], occ = new Array(doc.length).fill(0), p2 = new Map();
  let prevK = P ? -1 : null;   // the last run's visit that this run's last visit matched; null while lines are being read again
  const read = (li, st) => { const pre = {...st}; applyModes(doc[li], st); MEMO_STATS.read++; return { pre, post:{...st} }; };
  const first = (li, st, rec) => {
    if (seen[li]) return; seen[li] = true;
    if (!rec.view){ rec.ls = {...st, lib:null}; rec.view = doc[li].map((t, i) => word(t, st, refN(doc[li], i) ? "ref" : undefined)); }
    lineState[li] = rec.ls; view[li] = rec.view;
  };
  const visit = (li, st) => {
    const c = occ[li]++, oli = map ? map.toOld(li) : -1, ok = oli >= 0 ? P.byLine[oli]?.[c] : undefined;
    let rec;
    if (prevK!=null && ok===prevK + 1){ rec = P.seq[ok]; Object.assign(st, rec.post); prevK = ok; MEMO_STATS.reused++; }
    else { rec = read(li, st); prevK = ok!==undefined && sameSt(rec.post, P.seq[ok].post) ? ok : null; }
    seq.push(rec); seqLi.push(li); first(li, st, rec);
  };
  const st = newState(), L = labels(), stack = []; let i = 0, guard = 0;
  while (i < doc.length && guard++ < 5000 + 20 * doc.length){
    const toks = doc[i]; visit(i, st);
    if (isEnd(toks)) break;
    if (isReturn(toks) && stack.length){ i = stack.pop(); continue; }
    const tgt = callTarget(toks);
    if (tgt!=null && L[tgt]!==undefined && stack.length < 8){ stack.push(i+1); i = L[tgt]; continue; }
    i++;
  }
  // Lines the walk never reaches are read in file order, each from the line above it.
  const st2 = newState();
  doc.forEach((_, li) => {
    if (seen[li]){ Object.assign(st2, lineState[li]); return; }
    const oli = map ? map.toOld(li) : -1, o = oli >= 0 ? P.p2.get(oli) : null;
    let rec;
    if (o && sameSt(o.pre, st2)){ rec = o; Object.assign(st2, o.post); MEMO_STATS.reused++; } else rec = read(li, st2);
    p2.set(li, rec); first(li, st2, rec);
  });
  if (!full) TRUN = { sig, keys, seq, byLine:visitsByLine(seqLi), p2 };
}
function lineKind(li){
  const st = lineState[li], toks = doc[li] || [];
  if (SYNTAX==="klartext"){
    const h = klHeadOf(toks);
    if (!st || !h || !KL_MOVE.test(h)) return null;
    return st.motion==="G00" ? "rapid" : KL_ARC.test(h) ? "arc" : "feed";
  }
  if (!st || !toks.some(t => /^[XYZUW][-+]?[\d.#[]/.test(t)) || toks.some(t => isCode(t,"G65") && !DIALECT.codeWords?.G65)) return null;
  if (toks.some(t => isCode(t,"G28") || isCode(t,"G53"))) return "rapid";
  if (st.cycleCode) return "cyc";
  return st.motion==="G00" ? "rapid" : st.motion==="G01" ? "feed" : (st.motion==="G02"||st.motion==="G03") ? "arc" : null;
}

/* ---------- Canned cycle help data (RULES.cycleHelp) ----------
   Base entries are Fanuc-style ("mill", "lathe"); "haas.lathe" and the like override them for one control.
   Word entries are [example, what it does, English word]. */
function cycleHelp(code){
  const type = mtype(), CH = RULES.cycleHelp || {};
  let b = MACHINES[machineId].brand; const seen = [];
  while (b && RULES.dialects[b] && !seen.includes(b)){ seen.unshift(b); b = RULES.dialects[b].inherits; }
  const layers = [CH[type], ...seen.map(n => CH[n+"."+type])].filter(Boolean);
  const out = { words:{} };
  for (const ly of layers) Object.assign(out.words, ly.common?.words || {});
  for (const ly of layers){
    const e = ly[code];
    if (!e) continue;
    for (const [k, v] of Object.entries(e)){ if (k==="words") Object.assign(out.words, v); else out[k] = v; }
  }
  return out;
}
function cycleWord(code, L){
  if (!DIALECT.cycles?.[code]) return null;
  const w = cycleHelp(code).words[L]; return w ? { ex:w[0], what:w[1], en:w[2] } : null;
}

function codeWords(){
  const out = [], seen = new Set();
  const add = (k, e) => { if (!e || seen.has(k)) return; seen.add(k); out.push({ k, short:e.short, words:e.words, d:e.desc, pref:!!e.preferred }); };
  for (const b of brandChain()) for (const k of Object.keys({...DICT.machineOverrides[b+"."+mtype()], ...DICT.machineOverrides[b]})) if (!isKw(k)) add(k, entry(k));
  for (const k of Object.keys(DICT.codes)) add(k, entry(k));
  return out;
}

/* ---------- Word order ----------
   Program › Sort words puts each line's words in the order of the machine's rules (`columns` in gcode-rules.json),
   most used first: motion and cycle codes, X Y Z, arc and cycle words, F, S, spindle, tool, coolant, then setup
   G-codes, other M-codes, rare words and the comment. A word goes with the first group that matches it. */
const DEFAULT_COLS = [
  { id:"N", label:"N", letters:["N"] },
  { id:"MOT", label:"G", groups:["motion","canned cycle"], cycles:true, codes:["G96","G97"] },
  { id:"X", label:"X", letters:["X","U"] }, { id:"Y", label:"Y", letters:["Y","V"] }, { id:"Z", label:"Z", letters:["Z","W"] },
  { id:"ARC", label:"I J K R Q", letters:["I","J","K","R","Q"] },
  { id:"F", label:"F", letters:["F"] }, { id:"S", label:"S", letters:["S"] },
  { id:"SPIN", label:"Spindle", codes:["M03","M04","M05"] },
  { id:"T", label:"T H D", letters:["T","H","D"] },
  { id:"COOL", label:"Coolant", codes:["M07","M08","M09"] },
  { id:"G", label:"Other G", letters:["G"] }, { id:"M", label:"M", letters:["M"] },
  { id:"OTHER", label:"Other", other:true }, { id:"NOTE", label:"Comment", comments:true }
];
let COLS = [];
function buildColumns(D){
  COLS = (D.columns || DEFAULT_COLS).map(c => {
    const codes = new Set([...(c.codes || []), ...(c.groups || []).flatMap(g => D.modalGroups?.[g] || []), ...(c.cycles ? Object.keys(D.cycles || {}) : []),
      ...(c.process ? [...(D.process?.on || []), ...(D.process?.off || [])] : [])]);
    const letters = new Set(c.letters || []);
    const test = t => {
      if (isComment(t)) return !!c.comments;
      if (c.block) return /^\d+$/.test(t);       // Klartext block number
      if (c.klHeads) return !!klKey(t);          // Klartext path function or statement
      if (c.other) return true;
      if (/^[GM]\d/.test(t) && codes.has(pad2(t))) return true;
      return letters.has(t[0]) && (!"GM".includes(t[0]) || /^[GM]\d/.test(t)) && !isKw(t);
    };
    return { ...c, test };
  });
  colMemo = new Map();
}
let colMemo = new Map();
const numWord = (L, n) => { const r = (Math.round(n*10000)/10000).toString(); return L + (r.includes(".") ? r : r + "."); };
const colOf = t => { let i = colMemo.get(t); if (i===undefined){ i = COLS.findIndex(c => c.test(t)); colMemo.set(t, i); } return i; };

/* ---------- Word hints ----------
   Words a code on this line still needs, shown as grey "R##" text after the line's words. The data comes from
   the dialect: canned cycle requires/choices, wordHints (arcs, G43 H, G41 D), dwellWords and subCalls.
   When a code takes one of several sets (R, or I and J), using any word of one set hides the other sets. */
const ARC_CENTERS = { G17:["I","J"], G18:["I","K"], G19:["J","K"] };
function hintItems(li){
  const toks = doc[li], st = lineState[li]; if (!toks || !st) return [];
  const D = DIALECT, words = toks.filter(t => !isComment(t) && !isKw(t));
  const present = new Set(words.map(t => t[0]));
  const codes = [...new Set(words.filter(t => /^[GM]\d/.test(t)).map(pad2)), ...toks.filter(t => isKw(t))];
  const items = [];
  for (const c of codes){
    const cyc = D.cycles?.[c];
    if (cyc){
      for (const r of cyc.requires || []){ if (r==="F" && !cyc.leadF && st.F!=null) continue; items.push({ code:c, sets:[[r]] }); }
      if (cyc.choices) items.push({ code:c, sets:cyc.choices });
    }
    const wh = D.wordHints?.[c];
    if (wh?.arc) items.push({ code:c, sets:[["R"], ARC_CENTERS[st.plane] || ["I","J"]] });
    for (const r of wh?.requires || []) items.push({ code:c, sets:[[r]] });
    if (c==="G04") items.push({ code:c, sets:(D.dwellWords || ["P"]).map(l => [l]) });
    const sc = D.subCalls?.[c]; if (sc) items.push({ code:c, sets:[[sc.word]] });
  }
  const out = [], have = new Set();
  for (const it of items){
    const chosen = it.sets.find(set => set.some(l => present.has(l)));
    (chosen ? [chosen] : it.sets).forEach((set, si) => set.filter(l => !present.has(l)).forEach((l, k) => {
      if (have.has(l)) return; have.add(l); out.push({ L:l, code:it.code, sets:it.sets, alt: !chosen && si>0 && k===0 });
    }));
  }
  return out;
}
// The English word a hint fills in: RAD for an arc R, RPLN for a cycle R, ANGLE for Haas G76 A, and so on.
function englishPrefix(L, st){ const w = word(L+"1.", st); return w.unk ? L : w.e.replace(/1\.0?$/, ""); }
function hintMeaning(h){
  const cw = cycleWord(h.code, h.L); if (cw) return cw.what;
  if (DIALECT.wordHints?.[h.code]?.arc) return h.L==="R" ? "Arc radius" : `Distance from the start point to the arc center along ${{I:"X",J:"Y",K:"Z"}[h.L]}`;
  if (h.code==="G04") return "Dwell time";
  if (DIALECT.subCalls?.[h.code]) return DIALECT.subCalls[h.code].target==="label" ? "N number of the subprogram to run" : "Program number to call";
  if (h.L==="H") return "Length offset number, usually the same as the tool number";
  if (h.L==="D") return "Diameter offset number for cutter comp";
  const m = DIALECT.wordMeaning?.[h.L]; return m ? m[0].toUpperCase() + m.slice(1) : (DICT.address[h.L]?.desc || "");
}
const needsText = h => h.sets.map(s => s.join(" and ")).join(", or ");

function sortLine(toks){
  const sorted = toks.map((t, i) => ({ t, i, c: colOf(t) })).sort((a, b) => a.c - b.c || a.i - b.i).map(x => x.t);
  const changed = sorted.some((t, i) => t !== toks[i]);
  toks.splice(0, toks.length, ...sorted);
  return changed;
}
function sortWords(scope){
  if (editing && !commit()) return;
  const before = snap();
  const lines = scope==="line" ? [curLine] : doc.map((_, i) => i);
  let n = 0; lines.forEach(li => { if (sortLine(doc[li])) n++; });
  if (!n){ setMsg(scope==="line" ? "This line is already in order." : "Every line is already in order."); return; }
  undoStack.push(before); redoStack = [];
  render();
  setMsg(`Sorted words on ${n} line${n>1?"s":""}. Ctrl+Z puts them back.`);
}
