/* ---------- Subprogram library ----------
   Reusable subprograms with named variables, like a slotting routine used on many parts where only the
   positions and depths change. Each one is a file in a library folder: built in, the shop's folder, or the
   user's own (the same three places as machine definition files; see docs/subprogram-library.md).
   Insert › Subprogram library… finds one, takes its values, and puts it in the program either as a call
   (G65 P9101 X.. Y..; the O program has to be on the control) or written in as plain lines worked out from
   the values (any control, no macro option needed). A G65 line that calls a library subprogram reads its
   arguments by name, shows the lines it runs inline in green, and the toolpath preview follows it. */
(() => {
const $ = id => document.getElementById(id);
// The built-in library (data/library/*.json, in data.js) and, in the page opened in a browser, a shop's example
// library (docs/subprogram-library/examples/*.json, in samples.js).
const LIBRARY = BUILTIN_LIBRARY.concat(typeof SAMPLES !== "undefined" ? SAMPLES.library : []);
const LIB = LIBRARY.map(e => ({ ...e }));

// Fanuc custom macro argument letters (G65 argument specification I). G, L, N, O and P can't be passed.
const ARG_VAR = { A:1, B:2, C:3, I:4, J:5, K:6, D:7, E:8, F:9, H:11, M:13, Q:17, R:18, S:19, T:20, U:21, V:22, W:23, X:24, Y:25, Z:26 };
const VAR_ARG = Object.fromEntries(Object.entries(ARG_VAR).map(([L, n]) => [n, L]));
const SOURCES = {
  builtin: { label:"Built-in", dir:"C:\\Program Files\\GlossCode\\library" },
  shop:    { label:"Shop",     dir:"S:\\CNC\\GlossCode\\library" },
  mine:    { label:"Mine",     dir:"%APPDATA%\\GlossCode\\library" }
};
const KINDS = { distance:"Distance", feed:"Feed", speed:"Speed", count:"Count", angle:"Angle", time:"Seconds" };
// Which definition ids a mockup machine counts as. Haas mills extend Fanuc mills (docs/machine-definitions.md), so a
// subprogram written for fanuc.mill also works on haas.mill. Okuma is its own family.
const EXTENDS = { haas:["fanuc"], generic:["fanuc"], okumau10l:["okuma"], okuma7000l:["okuma"], okumae100l:["okuma"] };
const MACHINE_IDS = [["fanuc.mill", "Fanuc-style mill"], ["fanuc.lathe", "Fanuc-style lathe"], ["haas.mill", "Haas mill only"], ["haas.lathe", "Haas lathe only"], ["okuma.mill", "Okuma mill"], ["okuma.lathe", "Okuma lathe"]];
const idsFor = m => [m.brand, ...(EXTENDS[m.brand] || [])].map(b => b + "." + m.type);
const procOf = id => id.split(".")[1];
// "yes": written for this machine. "process": same kind of machine, another control (can be written in, with a warning). "no": wrong kind of machine.
function fits(e, m = MACHINES[machineId]){
  if ((e.machines || []).some(id => idsFor(m).includes(id))) return "yes";
  return (e.machines || []).some(id => procOf(id)===m.type) ? "process" : "no";
}
const canCall = (e, m = MACHINES[machineId]) => fits(e, m)==="yes" && !!m.macro;
const progOf = toks => { const p = toks.find(t => /^P\d+$/.test(t)); return p ? parseInt(p.slice(1), 10) : null; };
const isG65 = toks => toks.some(t => isCode(t, "G65"));
function byProgram(n){
  const hits = LIB.filter(e => e.program===n);
  return hits.find(e => fits(e)==="yes") || hits[0] || null;
}
function libFor(toks){ if (!toks || !isG65(toks)) return null; const n = progOf(toks); return n==null ? null : byProgram(n); }
const callsIn = e => doc.filter(t => isG65(t) && progOf(t)===e.program).length;
const defaultFor = (a, units) => a.default==null ? "" : typeof a.default==="object" ? (a.default[units] ?? "") : String(a.default);

/* ---------- English for a G65 line ---------- */
function libWord(e, L, raw, f, st){
  const t = L + raw;
  if (L==="P") return { g:t, e:sty(e.word) || "O" + e.program, d:`Library subprogram O${e.program}: ${e.name}` };
  const a = e.args.find(x => x.letter===L);
  if (!a) return { g:t, e:"?" + L, unk:true, d:`${e.name} has no ${L} variable.` };
  const unit = a.kind==="feed" ? (FEED_UNIT[st.feed]?.[st.units] || "") : a.kind==="speed" ? SPEED_UNIT[st.spin][st.units] : "";
  const imp = f.implied && a.kind==="distance" ? { imp:true } : {};
  return { g:t, e:vw(a.name, f.v), u:style==="short" ? unit : "", ...imp, d:`${a.desc}: ${f.v}${unit ? " " + unit : ""} (#${ARG_VAR[L]} in O${e.program})` };
}

/* ---------- Working out the lines a call runs ----------
   A small macro reader: #vars and #[expr], arithmetic in [ ], ABS SQRT SIN COS TAN ASIN ACOS ATAN[a]/[b] LN EXP ROUND FIX FUP
   BIN BCD, EQ NE GT GE LT LE AND OR XOR (Fanuc 21i Custom Macro B, docs/manual-reviews/fanuc-custom-macro-b.md),
   #n=..., IF [..] THEN #n=..., IF [..] GOTO n, GOTO n, WHILE [..] DOn / ENDn, and #3000=n (alarm). Anything else
   is an error, and that subprogram can only be called, not written in. */
const DEG = 180/Math.PI;
const FN = { ABS:Math.abs, SQRT:x => { if (x < 0) throw "SQRT of a negative number"; return Math.sqrt(x); },
  SIN:d => Math.sin(d/DEG), COS:d => Math.cos(d/DEG), TAN:d => Math.tan(d/DEG),
  ASIN:x => { if (Math.abs(x) > 1) throw "ASIN needs a value from -1 to 1"; return Math.asin(x)*DEG; },
  ACOS:x => { if (Math.abs(x) > 1) throw "ACOS needs a value from -1 to 1"; return Math.acos(x)*DEG; },
  ATAN:x => Math.atan(x)*DEG,
  LN:x => { if (x <= 0) throw "LN needs a value above 0"; return Math.log(x); }, EXP:Math.exp,
  // ROUND, FIX and FUP work on the size of the number: ROUND[-1.5] = -2, FUP[-1.2] = -2, FIX[-1.2] = -1
  ROUND:x => Math.sign(x)*Math.round(Math.abs(x)), FIX:Math.trunc, FUP:x => Math.sign(x)*Math.ceil(Math.abs(x)),
  BIN:x => { const d = String(Math.trunc(Math.abs(x)).toString(16)); if (/[a-f]/.test(d)) throw "BIN needs BCD digits 0 to 9"; return +d; },
  BCD:x => { if (x < 0) throw "BCD of a negative number"; return parseInt(String(Math.trunc(x)), 16); } };
// ATAN[a]/[b]: the angle of the point (b, a), 0 to 360 degrees (Fanuc, with parameter NAT off)
const atan2 = (a, b) => { const d = Math.atan2(a, b)*DEG; return d < 0 ? d + 360 : d; };
const bits = (op, a, b) => { const x = Math.trunc(a ?? 0), y = Math.trunc(b ?? 0); return op==="AND" ? x & y : op==="OR" ? x | y : x ^ y; };
const near = (a, b) => Math.abs(a - b) < 1e-9;
const CMP = { EQ:(a, b) => a===b || (a!=null && b!=null && near(a, b)), NE:(a, b) => !CMP.EQ(a, b),
  GT:(a, b) => (a ?? 0) > (b ?? 0) && !near(a ?? 0, b ?? 0), GE:(a, b) => (a ?? 0) > (b ?? 0) || near(a ?? 0, b ?? 0),
  LT:(a, b) => (a ?? 0) < (b ?? 0) && !near(a ?? 0, b ?? 0), LE:(a, b) => (a ?? 0) < (b ?? 0) || near(a ?? 0, b ?? 0) };
function evalExpr(src, V){
  const tk = src.replace(/\s+/g, "").match(/#\d+|\d*\.\d+|\d+\.?|[A-Z]+|[-+*\/\[\]]|./g) || [];
  let i = 0;
  const peek = () => tk[i], next = () => tk[i++];
  const prim = () => {
    const t = next();
    if (t==="["){ const v = or(); if (next()!=="]") throw "a [ has no matching ]"; return v; }
    if (t==="-"){ const v = prim(); return v==null ? null : -v; }
    if (t==="+") return prim();
    if (t && t[0]==="#" && t.length > 1){ const n = +t.slice(1); return n===0 ? null : (V[n] ?? null); }
    if (t==="#"){   // #[expr]: the variable whose number the expression gives
      if (next()!=="[") throw "# needs a number or [ ]"; const n = or(); if (next()!=="]") throw "a [ has no matching ]";
      const k = Math.round(n ?? 0); return k===0 ? null : (V[k] ?? null);
    }
    if (t && /^[\d.]/.test(t)) return parseFloat(t);
    if (FN[t]){
      if (next()!=="[") throw `${t} needs [ ]`; const v = or(); if (next()!=="]") throw "a [ has no matching ]";
      if (t==="ATAN" && peek()==="/" && tk[i+1]==="["){ i += 2; const b = or(); if (next()!=="]") throw "a [ has no matching ]"; return atan2(v ?? 0, b ?? 0); }
      return FN[t](v ?? 0);
    }
    throw `can't read "${t ?? "the end of the line"}"`;
  };
  const mul = () => { let a = prim(); while (peek()==="*" || peek()==="/"){ const op = next(), b = prim() ?? 0; if (op==="/" && b===0) throw "division by zero"; a = op==="*" ? (a ?? 0)*b : (a ?? 0)/b; } return a; };
  const add = () => { let a = mul(); while (peek()==="+" || peek()==="-"){ const op = next(), b = mul() ?? 0; a = op==="+" ? (a ?? 0)+b : (a ?? 0)-b; } return a; };
  const cmp = () => { const a = add(); if (CMP[peek()]){ const op = next(); return CMP[op](a, add()) ? 1 : 0; } return a; };
  // AND, OR and XOR work bit by bit, so [#1 GT 0] AND [#2 LT 5] (each 1 or 0) is true when both are
  const and = () => { let a = cmp(); while (peek()==="AND"){ next(); a = bits("AND", a, cmp()); } return a; };
  const or = () => { let a = and(); while (peek()==="OR" || peek()==="XOR"){ const op = next(); a = bits(op, a, and()); } return a; };
  const v = or(); if (i < tk.length) throw `can't read "${tk.slice(i).join("")}"`; return v;
}
// "[cond] rest" → ["cond", "rest"]
function bracket(s){
  if (s[0]!=="[") throw "expected [";
  let d = 0; for (let i = 0; i < s.length; i++){ if (s[i]==="[") d++; if (s[i]==="]" && --d===0) return [s.slice(1, i), s.slice(i+1).trim()]; }
  throw "a [ has no matching ]";
}
function fmtVal(L, n, units){
  if ("GMNOLHDT".includes(L) && near(n, Math.round(n))) return L + Math.round(n);
  const d = units==="mm" ? 3 : 4;
  let x = (Math.round(n * 10**d) / 10**d).toFixed(d).replace(/0+$/, "");
  if (/^-0\.$/.test(x)) x = "0.";
  return L + x;
}
function splitWords(s){
  const out = []; s = s.replace(/\s+/g, ""); let i = 0;
  while (i < s.length){
    const L = s[i]; if (!/[A-Z]/.test(L)) throw `can't read "${s.slice(i)}"`; i++;
    let d = 0, v = "";
    while (i < s.length){ const c = s[i]; if (c==="[") d++; if (c==="]") d--; if (!d && /[A-Z]/.test(c)) break; v += c; i++; }
    out.push([L, v]);
  }
  return out;
}
// Runs the body with the values given. Returns { lines:[[tokens]...] } or { error }.
function expand(e, vals, units){
  const V = {};
  for (const [L, v] of Object.entries(vals)) if (v!=="" && v!=null && ARG_VAR[L]) V[ARG_VAR[L]] = parseFloat(v);
  const body = e.body.map(l => l.toUpperCase());
  const labels = {}, loopEnd = {}, stack = [];
  let unmatched = false;
  body.forEach((l, i) => {
    const s = l.replace(/\([^)]*\)/g, "").trim();
    const n = s.match(/^N(\d+)/); if (n) labels[+n[1]] = i;
    const w = s.replace(/^N\d+\s*/, "");
    let m;
    if ((m = w.match(/^WHILE\s*\[.*\]\s*DO(\d)$/))) stack.push([m[1], i]);
    else if ((m = w.match(/^END(\d)$/))){ const top = stack.pop(); if (!top || top[0]!==m[1]) unmatched = true; else loopEnd[top[1]] = i; }
  });
  if (unmatched || stack.length) return { error:`O${e.program} has a WHILE and an END that don't match.` };
  const lines = []; let pc = 0, steps = 0;
  const err = (i, msg) => ({ error:`O${e.program} line ${i+1}: ${msg}.` });
  {
    while (pc < body.length){
      if (++steps > 20000) return { error:`O${e.program} ran more than 20,000 lines. Is a loop missing its step?` };
      const raw = body[pc], cm = (raw.match(/\([^)]*\)/g) || []).join(" ");
      let s = raw.replace(/\([^)]*\)/g, "").trim().replace(/^N\d+\s*/, "");
      const at = pc; pc++;
      if (!s || s==="%" || /^O\d+/.test(s)) continue;
      if (/^M0?99$/.test(s.replace(/\s+/g, ""))) break;
      let m;
      try {
        if ((m = s.match(/^#(\d+)\s*=(.+)$/))){
          const n = +m[1], v = evalExpr(m[2], V);
          if (n===3000) return { error:`O${e.program} stopped with alarm ${v}${cm ? " " + cm : ""}.` , alarm:true };
          V[n] = v; continue;
        }
        if (/^IF\s*\[/.test(s)){
          const [cond, rest] = bracket(s.replace(/^IF\s*/, "")), ok = evalExpr(cond, V);
          if ((m = rest.match(/^THEN\s*#(\d+)\s*=(.+)$/))){ if (ok){ const n = +m[1], v = evalExpr(m[2], V); if (n===3000) return { error:`O${e.program} stopped with alarm ${v}${cm ? " " + cm : ""}.`, alarm:true }; V[n] = v; } continue; }
          if ((m = rest.match(/^GOTO\s*(\d+)$/))){ if (ok){ if (labels[+m[1]]===undefined) throw `GOTO ${m[1]} has no N${m[1]}`; pc = labels[+m[1]]; } continue; }
          throw "after IF [..] only THEN #n=... or GOTO n can be written in";
        }
        if ((m = s.match(/^GOTO\s*(\d+)$/))){ if (labels[+m[1]]===undefined) throw `GOTO ${m[1]} has no N${m[1]}`; pc = labels[+m[1]]; continue; }
        if (/^WHILE/.test(s)){ const [cond] = bracket(s.replace(/^WHILE\s*/, "")); if (!evalExpr(cond, V)) pc = loopEnd[at] + 1; continue; }
        if (/^END\d$/.test(s)){ pc = +Object.keys(loopEnd).find(k => loopEnd[k]===at); continue; }
        const toks = [];
        for (const [L, v] of splitWords(s)){
          if (/[#\[]/.test(v)){ const n = evalExpr(v, V); if (n==null) continue; toks.push(fmtVal(L, n, units)); }
          else toks.push(L + v);
        }
        if (cm) toks.push(cm);
        if (toks.length) lines.push(toks);
        if (lines.length > 2000) return { error:`O${e.program} writes more than 2,000 lines. Call it instead.` };
      } catch (x){ return err(at, typeof x==="string" ? x : "can't be read"); }
    }
  }
  return { lines };
}
// The values a G65 line passes, by letter.
function callVals(toks){ const v = {}; toks.forEach(t => { if (/^[A-Z][-+]?[\d.]+$/.test(t) && ARG_VAR[t[0]]) v[t[0]] = t.slice(1); }); return v; }
const cache = new Map();
function expandCall(toks, li){
  const e = libFor(toks); if (!e) return null;
  const units = lineState[li]?.units || "inch", key = e.id + "|" + toks.join(" ") + "|" + units + "|" + e.body.join("\n");
  if (!cache.has(key)){ if (cache.size > 200) cache.clear(); cache.set(key, expand(e, callVals(toks), units)); }
  return cache.get(key);
}

/* ---------- Showing a call's lines inline ---------- */
function rowCells(toks, st){
  const W = COLW();
  return toks.map(t => { const c = word(t, st); return { g:t, e:c.e || "", u:c.u || "", cm:!!c.cm, w:Math.max(W, t.length + 1, (c.e || "").length + (c.u ? 3 : 1)) }; });
}
function rowsFor(lines, st0){
  const st = { ...st0, chg:[] };
  return lines.map(toks => {
    applyModes(toks, st);
    const cells = rowCells(toks, st);
    const moves = toks.some(t => /^[XYZUW][-+]?[\d.]/.test(t));
    const kind = !moves ? null : st.cycleCode ? "cyc" : st.motion==="G00" ? "rapid" : st.motion==="G01" ? "feed" : (st.motion==="G02" || st.motion==="G03") ? "arc" : null;
    return { cells, kind };
  });
}
const cellHTML = (c, en) => en ? `<span class="lc${c.cm ? " cm" : ""}" style="width:${c.w}ch">${esc(c.e)}${c.u ? `<small class="u">${esc(c.u)}</small>` : ""}</span>`
                               : `<span class="lc${c.cm ? " cm" : ""}" style="width:${c.w}ch">${esc(c.g)}</span>`;
function libRows(li){
  const r = expandCall(doc[li], li); if (!r) return [];
  if (r.error) return [{ error:r.error }];
  return rowsFor(r.lines, lineState[li] || newState());
}
function libRowHTML(row, li){
  const e = libFor(doc[li]), from = doc[li][0];
  const title = `Run by the call on ${from}: ${e.name} (O${e.program}) with these values. Change the values on the call line, or the subprogram in Insert › Subprogram library.`;
  if (row.error) return `<div class="ln lib" data-li="${li}" title="${esc(title)}"><div class="r gc"><span class="gut">⤷</span><span class="lc err">${esc(row.error)} The preview and checks skip it.</span></div></div>`;
  // The subprogram's code as text, its gloss above
  const nc = /^N\d/.test(row.cells[0]?.g || ""), cs = nc ? row.cells.slice(1) : row.cells, gl = cs.filter(c => !c.cm && c.e && c.e!==c.g).map(c => `<span class="gw">${esc(c.e)}</span>`).join(" ");
  return `<div class="ln lib${row.kind ? " k-" + row.kind : ""}" data-li="${li}" title="${esc(title)}"><div class="r en${gl ? "" : " none"}"><span class="gut"></span><span class="tn"></span><span class="tg">${gl}</span></div>`
    + `<div class="r gc"><span class="gut">⤷</span><span class="tn">${nc ? esc(row.cells[0].g) : ""}</span><span class="tc">${esc(cs.map(c => c.g).join(" "))}</span></div></div>`;
}
function libButton(li){
  const toks = doc[li]; if (!isG65(toks)) return "";
  const n = progOf(toks); if (n==null) return "";
  const e = byProgram(n);
  if (!e) return `<span class="xp bad" title="Not in any library folder. That's fine if O${n} is already on the control; GlossCode just can't show what it does.">O${n} isn't in the library</span>`;
  return `<button class="xp lib" data-x="${li}" title="${esc(e.name)} · ${SOURCES[e.source].label} library">${expanded.has(li) ? "▾ hide" : "▸ show"} O${n} ${esc(sty(e.word) || "")}</button>`;
}
Object.assign(window, { evalMacro:evalExpr, libFor, libWord, libRows, libRowHTML, libButton, libExpandCall:(toks, li) => { const r = expandCall(toks, li); return r && !r.error ? r.lines : null; } });

/* ---------- Insert › Subprogram library… ---------- */
const ldlg = $("ldlg");
let lSel = null, lQ = "", lScope = "machine";
const lVals = {}, lMode = {};
function matches(e, q){
  if (!q) return true;
  const hay = [e.name, e.word?.words, e.word?.long, e.word?.short, e.category, e.about, e.author, "O" + e.program, String(e.program), ...(e.tags || []), ...e.args.flatMap(a => [a.name, a.desc])].join(" ").toUpperCase();
  return q.toUpperCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}
function listed(){
  return LIB.filter(e => (lScope==="all" || fits(e)==="yes") && matches(e, lQ))
    .sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.program - b.program);
}
function openLibrary(id){
  if (editing && !commit()) return;
  if (simIdx!=null) stopSim(true);
  closeMenu();
  lQ = ""; $("l-q").value = "";
  const pick = id ? LIB.find(e => e.id===id) : null;
  lScope = pick && fits(pick)!=="yes" ? "all" : "machine";
  lSel = pick?.id || listed()[0]?.id || null;
  drawLibrary(); ldlg.hidden = false;
  $("l-q").focus();
}
function closeLibrary(){ ldlg.hidden = true; ed.focus({ preventScroll:true }); }
const srcChip = e => `<i class="src ${e.source}">${SOURCES[e.source].label}</i>${e.private ? `<i class="src priv">Private</i>` : ""}`;
function machinesText(e){ return (e.machines || []).map(id => MACHINE_IDS.find(x => x[0]===id)?.[1] || id).join(", "); }

function drawLibrary(){
  const m = MACHINES[machineId], list = listed();
  setPressed($("l-mine"), $("l-all"), lScope==="machine");
  $("l-mine").textContent = `For ${m.name}`;
  $("l-title").textContent = `Subprogram library · ${m.name} (${m.type})`;
  if (!list.some(e => e.id===lSel)) lSel = list[0]?.id || null;
  let html = "", cat = null;
  for (const e of list){
    if (e.category!==cat){ cat = e.category; html += `<div class="cgrp">${esc(cat || "Other")}</div>`; }
    const f = fits(e), n = callsIn(e);
    html += `<div class="ci lci${e.id===lSel ? " sel" : ""}${f!=="yes" ? " other" : ""}" data-id="${esc(e.id)}"><b>O${e.program}</b><span>${esc(e.name)}${srcChip(e)}<em>${esc(e.word?.words || e.word?.long || "")}${n ? ` · ${n} call${n > 1 ? "s" : ""} in this file` : ""}${f!=="yes" ? ` · ${esc(machinesText(e))}` : ""}</em></span></div>`;
  }
  const hidden = LIB.filter(e => fits(e)!=="yes" && matches(e, lQ)).length;
  if (!list.length) html = `<div class="cgrp">${lQ ? `Nothing matches "${esc(lQ)}".` : `No subprograms for ${esc(m.name)} yet.`}${lScope==="machine" && hidden ? ` ${hidden} more for other machines under All.` : ""}</div>`;
  else if (lScope==="machine" && hidden) html += `<div class="cgrp">${hidden} more for other machines under All.</div>`;
  $("llist").innerHTML = html;
  const e = LIB.find(x => x.id===lSel);
  $("l-edit").disabled = !e;
  $("l-edit").textContent = e?.source==="builtin" ? "View…" : "Edit…";
  if (!e){ $("lmain").innerHTML = `<div class="lempty">Pick a subprogram, or make one with <b>New…</b>. A subprogram from this program (an M97 block like N1000…M99) can be saved with <b>Insert › Save N1000 to the library…</b> while the cursor is in it.</div>`; $("l-ok").disabled = true; $("l-msg").textContent = ""; return; }
  const st = lineState[curLine] || newState(), units = st.units, v = lVals[e.id] ||= {};
  const f = fits(e), call = canCall(e, m);
  if (!lMode[e.id] || (lMode[e.id]==="call" && !call)) lMode[e.id] = call ? "call" : "inline";
  const rows = e.args.map(a => {
    const def = defaultFor(a, units), en = a.name;
    const chip = a.required && !def ? `<span class="need req">Required</span>` : def ? `<span class="need opt">Default ${esc(def)}</span>` : `<span class="need opt">Optional</span>`;
    return `<span class="w">${a.letter}</span><span class="e">${esc(en)}</span><input data-l="${a.letter}" value="${esc(v[a.letter] || "")}" placeholder="${esc(def)}" inputmode="decimal" autocomplete="off"><span>${chip}</span><span class="what">${esc(a.desc)}${a.kind==="feed" ? ` <small>(${FEED_UNIT[st.feed]?.[units] || ""})</small>` : ""}</span>`;
  }).join("");
  const n = callsIn(e), file = `${SOURCES[e.source].dir}\\${e.id}.json`;
  const callWhy = f!=="yes" ? `Written for ${machinesText(e)}, not ${m.name}.` : !m.macro ? `${m.name} has no macro option (G65). Machine profiles… can turn it on.` : `O${e.program} has to be loaded on the control. Export… in Edit saves it as O${e.program}.nc.`;
  $("lmain").innerHTML = `<h4><code>O${e.program}</code>${esc(e.name)}<small>${esc(e.word?.words || e.word?.long || "")} ${srcChip(e)}${e.verified===false ? `<i class="src unv">Not proven on a machine</i>` : ""}</small></h4>`
    + `<p class="about" style="margin:0">${esc(e.about || "")}</p>`
    + `<div class="lmeta"><span>Works on ${esc(machinesText(e))}</span><span>Saved in <code>${esc(file)}</code></span>${e.author ? `<span>By ${esc(e.author)}</span>` : ""}${n ? `<span>Called ${n} time${n > 1 ? "s" : ""} in this file</span>` : ""}</div>`
    + `<div class="iform">${rows}</div>`
    + `<div class="lmode"><label class="${call ? "" : "off"}"><input type="radio" name="l-mode" value="call"${lMode[e.id]==="call" ? " checked" : ""}${call ? "" : " disabled"}> <span><b>Call it</b> with one G65 line. <small>${esc(callWhy)}</small></span></label>`
    + `<label class="${f==="no" ? "off" : ""}"><input type="radio" name="l-mode" value="inline"${lMode[e.id]==="inline" ? " checked" : ""}${f==="no" ? " disabled" : ""}> <span><b>Write the lines in</b>, worked out from these values. <small>Works on any ${esc(m.type)}, even without the macro option. Changing a value later means inserting it again.</small></span></label></div>`
    + `<div class="cex lprev" id="l-prev"></div>`;
  $("lmain").querySelectorAll('input[name="l-mode"]').forEach(x => x.onchange = () => { lMode[e.id] = x.value; updateLibrary(); });
  updateLibrary();
}
// The words for the call: typed values, or the default. A distance or feed typed without a decimal point gets one.
function buildLib(e){
  const st = lineState[curLine] || newState(), units = st.units, v = lVals[e.id] || {};
  const words = [], vals = {}, bad = [], missing = [];
  for (const a of e.args){
    let t = (v[a.letter] || "").trim().toUpperCase() || defaultFor(a, units);
    if (!t){ if (a.required) missing.push(a.letter); continue; }
    const intOnly = a.kind==="count";
    if (intOnly ? !/^\d+$/.test(t) : !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)){ bad.push(a.letter); continue; }
    if (["distance", "feed", "angle"].includes(a.kind) && !t.includes(".")) t += ".";
    t = t.replace(/^\+/, "").replace(/^(-?)\./, "$10.");
    words.push(a.letter + t); vals[a.letter] = t;
  }
  return { words, vals, bad, missing, units };
}
function nNumbersFor(k){
  if (!autoN || !k) return { ns:[] };
  let cur = null, next = null;
  for (let i = curLine; i >= 0 && cur===null; i--) cur = nOf(doc[i]);
  for (let i = curLine+1; i < doc.length && next===null; i++) next = nOf(doc[i]);
  const base = cur ?? 0; let step = N_STEP;
  if (next!=null && base + k*step >= next){ step = Math.floor((next - base) / (k+1)); if (step < 1) return { ns:[], msg:`No room for ${k} N numbers before N${next}, so the new lines have none. Program › Renumber makes room.` }; }
  return { ns:Array.from({ length:k }, (_, i) => base + (i+1)*step) };
}
function libLines(e){
  const b = buildLib(e), notes = [];
  if (b.bad.length || b.missing.length) return { ok:false, b };
  if (lMode[e.id]==="call"){
    const nn = nNumbersFor(1);
    return { ok:true, b, lines:[[...(nn.ns.length ? ["N" + nn.ns[0]] : []), "G65", "P" + e.program, ...b.words]], note:nn.msg };
  }
  const r = expand(e, b.vals, b.units);
  if (r.error) return { ok:false, b, error:r.error };
  const nn = nNumbersFor(r.lines.length);
  const head = [`(${e.word?.words || e.word?.long || e.name} O${e.program} ${b.words.join(" ")})`];
  return { ok:true, b, lines:[head, ...r.lines.map((t, i) => nn.ns.length ? ["N" + nn.ns[i], ...t] : t)], note:nn.msg };
}
function updateLibrary(){
  const e = LIB.find(x => x.id===lSel); if (!e) return;
  const r = libLines(e), notes = [];
  ldlg.querySelectorAll(".iform input").forEach(x => x.classList.toggle("bad", r.b.bad.includes(x.dataset.l)));
  const where = nOf(doc[curLine])!=null ? "N" + nOf(doc[curLine]) : "line " + (curLine+1);
  if (r.ok){
    const st = { ...(lineState[curLine] || newState()) };
    const rows = rowsFor(r.lines, st);
    $("l-prev").innerHTML = `<div class="lbl">Goes in below ${where}${r.lines.length > 1 ? ` · ${r.lines.length} lines` : ""}</div>`
      + rows.map(row => (row.cells.every(c => c.cm) ? "" : `<div class="r en"><span class="gut"></span>${row.cells.map(c => cellHTML(c, true)).join("")}</div>`) + `<div class="r gc"><span class="gut"></span>${row.cells.map(c => cellHTML(c, false)).join("")}</div>`).join("");
  } else $("l-prev").innerHTML = `<div class="lbl">Goes in below ${where}</div>`;
  if (r.b.bad.length) notes.push(`<span class="warn">${r.b.bad.join(", ")} ${r.b.bad.length > 1 ? "need numbers" : "needs a number"}.</span>`);
  else if (r.b.missing.length) notes.push(`Fill in ${r.b.missing.join(", ")} to insert.`);
  if (r.error) notes.push(`<span class="warn">${esc(r.error)}</span>`);
  if (fits(e)==="process") notes.push(`<span class="warn">Written for ${esc(machinesText(e))}. Check the lines suit this control.</span>`);
  if (e.units && e.units!==r.b.units && e.args.some(a => a.default!=null && typeof a.default!=="object")) notes.push(`Defaults are in ${e.units==="mm" ? "mm" : "inches"}.`);
  if (r.note) notes.push(`<span class="warn">${esc(r.note)}</span>`);
  $("l-msg").innerHTML = notes.join(" ");
  $("l-ok").disabled = !r.ok;
}
function insertLib(){
  const e = LIB.find(x => x.id===lSel); if (!e) return;
  const r = libLines(e); if (!r.ok) return;
  const li = curLine;
  pushUndo();
  doc.splice(li+1, 0, ...r.lines.map(t => [...t]));
  expanded = new Set([...expanded].map(i => i > li ? i + r.lines.length : i));
  closeLibrary();
  selectLine(li+1);
  setMsg(lMode[e.id]==="call" ? `Added ${r.lines[0].join(" ")}. ▸ show on the line lists what it runs.` : `Wrote in ${r.lines.length - 1} lines of ${e.name}. Ctrl+Z takes them back out.`);
}
$("llist").addEventListener("click", ev => { const it = ev.target.closest(".lci"); if (!it) return; lSel = it.dataset.id; drawLibrary(); });
$("llist").addEventListener("dblclick", ev => { if (ev.target.closest(".lci") && !$("l-ok").disabled) insertLib(); });
$("l-q").addEventListener("input", () => { lQ = $("l-q").value.trim(); drawLibrary(); });
$("l-mine").onclick = () => { lScope = "machine"; drawLibrary(); };
$("l-all").onclick = () => { lScope = "all"; drawLibrary(); };
ldlg.addEventListener("input", ev => { const L = ev.target.dataset?.l; if (!L || !lSel) return; (lVals[lSel] ||= {})[L] = ev.target.value; updateLibrary(); });
$("l-ok").onclick = insertLib;
$("l-cancel").onclick = $("l-x").onclick = closeLibrary;
$("l-new").onclick = () => openEditor(null);
$("l-edit").onclick = () => lSel && openEditor(lSel);
ldlg.addEventListener("keydown", ev => {
  ev.stopPropagation();
  if (ev.key==="Escape"){ ev.preventDefault(); closeLibrary(); }
  else if (ev.key==="Enter" && ev.target.tagName==="INPUT" && ev.target.type!=="radio" && !$("l-ok").disabled){ ev.preventDefault(); insertLib(); }
});

/* ---------- New / Edit a library subprogram ---------- */
const sdlg = $("sdlg");
let draft = null, editId = null, readOnly = false, delArmed = false;
function freeProgram(from = 9100){ let n = from; while (LIB.some(e => e.program===n)) n++; return n; }
function slug(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "subprogram"; }
function openEditor(id, seed){
  const src = id ? LIB.find(e => e.id===id) : null, m = MACHINES[machineId];
  draft = src ? JSON.parse(JSON.stringify(src)) : seed || {
    glosscode:"subprogram/1", id:"", name:"", word:{ words:"", short:"" }, program:freeProgram(), category:"", tags:[],
    machines:[isOkuma(m.brand) ? "okuma." + m.type : "fanuc." + m.type], units:(lineState[curLine] || newState()).units,
    source:"mine", args:[], body:[`O${freeProgram()}`, "", "M99"], about:""
  };
  editId = id; readOnly = src?.source==="builtin"; delArmed = false;
  drawEditor(); sdlg.hidden = false;
  (readOnly ? $("s-copy") : $("s-name")).focus();
}
function closeEditor(){ sdlg.hidden = true; if (!ldlg.hidden) drawLibrary(); else ed.focus({ preventScroll:true }); }
function drawEditor(){
  const d = draft, ro = readOnly;
  $("s-title").textContent = editId ? (ro ? `${d.name} · built in, read-only` : `Edit ${d.name}`) : "New library subprogram";
  $("s-name").value = d.name; $("s-long").value = d.word?.words || (d.word?.long ? "sub." + d.word.long.toLowerCase() : ""); $("s-short").value = d.word?.short || "";
  $("s-prog").value = d.program || ""; $("s-cat").value = d.category || ""; $("s-tags").value = (d.tags || []).join(", ");
  $("s-units").value = d.units || "inch"; $("s-about").value = d.about || ""; $("s-notes").value = d.notes || "";
  $("s-where").value = d.source==="shop" ? "shop" : "mine"; $("s-priv").checked = !!d.private;
  $("s-cats").innerHTML = [...new Set(LIB.map(e => e.category).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join("");
  $("s-machines").innerHTML = MACHINE_IDS.map(([id, label]) => `<label><input type="checkbox" value="${id}"${(d.machines || []).includes(id) ? " checked" : ""}${ro ? " disabled" : ""}> ${esc(label)} <small style="color:#999">${id}</small></label>`).join("");
  ["s-name", "s-long", "s-short", "s-prog", "s-cat", "s-tags", "s-about", "s-notes", "s-body"].forEach(id => $(id).readOnly = ro);
  ["s-units", "s-where", "s-priv", "s-scan", "s-add"].forEach(id => $(id).disabled = ro);
  $("s-body").value = d.body.join("\n");
  drawVars();
  $("s-del").hidden = ro || !editId; $("s-del").textContent = "Delete";
  $("s-copy").hidden = !ro; $("s-save").hidden = ro;
  $("s-cancel").textContent = ro ? "Close" : "Cancel";
  checkDraft();
}
function drawVars(){
  const ro = readOnly, opts = sel => Object.keys(ARG_VAR).map(L => `<option${L===sel ? " selected" : ""}>${L}</option>`).join("");
  $("s-vars").innerHTML = draft.args.map((a, i) => `<tr data-i="${i}">`
    + `<td><select data-f="letter"${ro ? " disabled" : ""}>${opts(a.letter)}</select></td><td class="v">#${ARG_VAR[a.letter]}</td>`
    + `<td><input class="mono" data-f="name" value="${esc(a.name)}" maxlength="5"${ro ? " readonly" : ""}></td>`
    + `<td><select data-f="kind"${ro ? " disabled" : ""}>${Object.entries(KINDS).map(([k, l]) => `<option value="${k}"${k===a.kind ? " selected" : ""}>${l}</option>`).join("")}</select></td>`
    + `<td style="text-align:center"><input type="checkbox" data-f="required"${a.required ? " checked" : ""}${ro ? " disabled" : ""} style="width:auto"></td>`
    + `<td><input class="mono" data-f="default" value="${esc(defaultFor(a, draft.units || "inch"))}"${ro ? " readonly" : ""}></td>`
    + `<td><input data-f="desc" value="${esc(a.desc || "")}"${ro ? " readonly" : ""}></td>`
    + `<td>${ro ? "" : `<button data-del="${i}" title="Remove">✕</button>`}</td></tr>`).join("")
    || `<tr><td colspan="8" style="color:#888;padding:8px 4px">No variables yet. Write #24 for X, #25 for Y and so on in the body, then <b>Add from body</b>.</td></tr>`;
}
function readEditor(){
  if (readOnly) return;
  const d = draft;
  d.name = $("s-name").value.trim();
  d.word = { words:$("s-long").value.trim().toLowerCase(), short:$("s-short").value.trim().toUpperCase() };
  d.program = parseInt($("s-prog").value, 10) || null;
  d.category = $("s-cat").value.trim();
  d.tags = $("s-tags").value.split(",").map(s => s.trim()).filter(Boolean);
  d.units = $("s-units").value; d.about = $("s-about").value.trim(); d.notes = $("s-notes").value.trim() || undefined;
  d.source = $("s-where").value; d.private = $("s-priv").checked || undefined;
  d.machines = [...$("s-machines").querySelectorAll("input:checked")].map(x => x.value);
  d.body = $("s-body").value.toUpperCase().split("\n").map(s => s.replace(/\s+$/, ""));
}
// Problems with the draft, shown as you type: e = can't save, w = worth a look, i = for information.
function problems(){
  const d = draft, out = [], used = new Set();
  if (!d.name) out.push(["e", "Give it a name."]);
  if (!d.program) out.push(["e", "It needs a program number (the O number it has on the control)."]);
  const clash = LIB.find(e => e.program===d.program && e.id!==editId);
  if (d.program && clash) out.push(["w", `O${d.program} is also ${clash.name} (${SOURCES[clash.source].label}). A call would find whichever is on the control.`]);
  if (!d.word.words) out.push(["e", "Give it a full gloss word, such as sub.slotmill (it's what P reads as on the call line)."]);
  if (d.word.words.length > 28 || d.word.short.length > 8) out.push(["e", "Gloss words are 28 characters (full) and 8 (short) at most."]);
  else if (d.word.words && !/^[a-z][a-z0-9]*(\.[a-z0-9]+){0,2}$/.test(d.word.words)) out.push(["w", "Full words are lower case, in up to three parts separated by periods, like sub.slotmill."]);
  if (!d.machines.length) out.push(["e", "Tick at least one kind of machine it works on."]);
  d.args.forEach(a => {
    if (used.has(a.letter)) out.push(["e", `${a.letter} is used for two variables.`]); used.add(a.letter);
    if (!/^[A-Z][A-Z0-9]{0,4}$/.test(a.name || "")) out.push(["e", `${a.letter}'s gloss name should be 1–5 letters or digits, starting with a letter.`]);
    else if (a.name.length > 4) out.push(["i", `${a.name} plus its value may not fit a column. Four letters or fewer (DEP, STEP, FEED) always do.`]);
  });
  const body = d.body.join("\n"), refs = new Set([...body.matchAll(/#(\d+)/g)].map(m => +m[1]));
  const undeclared = [...refs].filter(n => VAR_ARG[n] && !d.args.some(a => ARG_VAR[a.letter]===n));
  if (undeclared.length) out.push(["w", `The body reads ${undeclared.map(n => `#${n} (${VAR_ARG[n]})`).join(", ")} but ${undeclared.length > 1 ? "they aren't variables" : "it isn't a variable"}, so ${undeclared.length > 1 ? "they're" : "it's"} always empty.`]);
  const unused = d.args.filter(a => !refs.has(ARG_VAR[a.letter]));
  if (unused.length) out.push(["w", `${unused.map(a => a.name || a.letter).join(", ")} ${unused.length > 1 ? "aren't" : "isn't"} used in the body.`]);
  if (!/^O\d+/.test((d.body.find(l => l.trim()) || "").trim())) out.push(["i", "The body usually starts with its O number."]);
  else if (d.program && parseInt(d.body.find(l => l.trim()).trim().slice(1), 10)!==d.program) out.push(["w", `The body starts with a different O number from O${d.program}.`]);
  if (!d.body.some(l => /^(N\d+\s*)?M0?99\b/.test(l.trim()))) out.push(["w", "The body doesn't end with M99, so the call would never return."]);
  // Try writing it in with the defaults (or 1.) to catch loops and lines it can't read.
  const vals = Object.fromEntries(d.args.map(a => [a.letter, defaultFor(a, d.units || "inch") || "1."]));
  const r = expand(d, vals, d.units || "inch");
  if (r.error && !r.alarm) out.push(["i", `${r.error.replace(/^O\d+ /, "")} It can still be called, but not written in.`]);
  if (d.private) out.push(["i", "Private: Export asks first and leaves out the notes."]);
  return out;
}
function checkDraft(){
  readEditor();
  const p = problems();
  $("s-checks").innerHTML = p.map(([k, t]) => `<span class="${k}">${k==="e" ? "✕" : k==="w" ? "⚠" : "i"} ${esc(t)}</span>`).join("");
  $("s-save").disabled = p.some(x => x[0]==="e");
  const file = `${SOURCES[draft.source].dir}\\${draft.id || slug(draft.name)}.json`;
  $("s-file").innerHTML = readOnly ? `Ships with GlossCode in <code>${esc(file)}</code>. <b>Make my own copy</b> to change it.`
    : `Saved as <code>${esc(file)}</code>.${draft.source==="shop" ? " Everyone who points GlossCode at the shop folder sees it." : " Nobody else sees it unless you export it."}`;
}
$("s-vars").addEventListener("input", ev => {
  const tr = ev.target.closest("tr[data-i]"); if (!tr) return;
  const a = draft.args[+tr.dataset.i], f = ev.target.dataset.f;
  if (f==="required") a.required = ev.target.checked;
  else if (f==="default") a.default = ev.target.value.trim() || undefined;
  else if (f==="name") a.name = ev.target.value.trim().toUpperCase();
  else a[f] = ev.target.value;
  if (f==="letter") drawVars();
  checkDraft();
});
$("s-vars").addEventListener("click", ev => { const b = ev.target.closest("[data-del]"); if (!b) return; draft.args.splice(+b.dataset.del, 1); drawVars(); checkDraft(); });
$("s-add").onclick = () => {
  readEditor();
  const L = Object.keys(ARG_VAR).find(l => !draft.args.some(a => a.letter===l));
  draft.args.push({ letter:L, name:"", kind:"distance", required:true, desc:"" }); drawVars(); checkDraft();
  $("s-vars").querySelector("tr:last-child input[data-f=name]")?.focus();
};
$("s-scan").onclick = () => {
  readEditor();
  const refs = [...new Set([...draft.body.join("\n").matchAll(/#(\d+)/g)].map(m => +m[1]))].filter(n => VAR_ARG[n] && !draft.args.some(a => ARG_VAR[a.letter]===n)).sort((a, b) => a - b);
  refs.forEach(n => { const L = VAR_ARG[n]; draft.args.push({ letter:L, name:L==="F" ? "FEED" : "", kind:L==="F" ? "feed" : "distance", required:true, desc:"" }); });
  drawVars(); checkDraft();
  $("s-msg").textContent = refs.length ? `Added ${refs.map(n => VAR_ARG[n]).join(", ")}. Give each a gloss name and say what it is.` : "Every # the body reads is already a variable.";
};
sdlg.addEventListener("input", ev => { if (ev.target.closest("#s-vars")) return; delArmed = false; $("s-del").textContent = "Delete"; checkDraft(); });
sdlg.addEventListener("change", ev => { if (ev.target.id==="s-units") drawVars(); if (!ev.target.closest("#s-vars")) checkDraft(); });
$("s-save").onclick = () => {
  readEditor(); if (problems().some(x => x[0]==="e")) return;
  const d = draft;
  if (!d.id) { let id = slug(d.name), n = 2; while (LIB.some(e => e.id===id)) id = slug(d.name) + "-" + n++; d.id = id; }
  const i = LIB.findIndex(e => e.id===editId);
  if (i >= 0) LIB[i] = d; else LIB.push(d);
  cache.clear();
  lSel = d.id;
  sdlg.hidden = true;
  if (!ldlg.hidden) drawLibrary(); else ed.focus({ preventScroll:true });
  render();
  setMsg(`Saved ${SOURCES[d.source].dir}\\${d.id}.json.`);
};
$("s-copy").onclick = () => {
  const src = draft, copy = JSON.parse(JSON.stringify(src));
  Object.assign(copy, { id:"", name:src.name + " (my copy)", source:"mine", program:freeProgram(src.program), author:"", verified:undefined });
  copy.body = copy.body.map(l => l.replace(new RegExp(`^O${src.program}\\b`), "O" + copy.program));
  draft = copy; editId = null; readOnly = false; drawEditor();
  $("s-msg").textContent = `A copy in your library as O${copy.program}. The built-in one stays as it is.`;
};
$("s-del").onclick = () => {
  if (!delArmed){ delArmed = true; $("s-del").textContent = "Click again to delete"; $("s-msg").textContent = callsIn(draft) ? `This file still calls O${draft.program} ${callsIn(draft)} time${callsIn(draft) > 1 ? "s" : ""}; the calls stay but can't be shown.` : ""; return; }
  const i = LIB.findIndex(e => e.id===editId); if (i >= 0) LIB.splice(i, 1);
  cache.clear(); sdlg.hidden = true; lSel = null; if (!ldlg.hidden) drawLibrary(); render();
  setMsg(`Deleted ${draft.name}. It's in the Recycle Bin if you need it back.`);
};
$("s-export").onclick = () => {
  readEditor();
  const d = draft;
  $("s-msg").innerHTML = (d.private ? `<b>${esc(d.name)} is marked private.</b> Export asks before writing it and leaves out the notes. ` : "")
    + `Export writes <code>${esc(d.id || slug(d.name))}.json</code> for other GlossCode users, or <code>O${d.program}.nc</code> (just the body) to load on the control.`;
};
$("s-cancel").onclick = $("s-x").onclick = closeEditor;
sdlg.addEventListener("keydown", ev => { ev.stopPropagation(); if (ev.key==="Escape"){ ev.preventDefault(); closeEditor(); } });

// Insert › Save N1000 to the library…: the M97 block the cursor is in (or the one the selected line calls).
function localSubAt(li){
  const tgt = callTarget(doc[li]);
  if (tgt && tgt[0]==="N"){ const r = subRange(tgt); if (r) return { label:tgt, range:r }; }
  for (const [label, s] of Object.entries(labels())){
    if (label[0]!=="N" || !doc.some(t => callTarget(t)===label)) continue;
    const r = subRange(label); if (r && li >= r[0] && li <= r[1]) return { label, range:r };
  }
  return null;
}
function saveLocalSub(){
  const ls = localSubAt(curLine); if (!ls) return;
  if (editing && !commit()) return;
  closeMenu();
  const m = MACHINES[machineId], prog = freeProgram();
  const lines = doc.slice(ls.range[0], ls.range[1] + 1).map(t => t.filter(w => !/^N\d/.test(w)).join(" ").replace(/\bM0?97\b/, "M98")).filter(Boolean);
  const before = ls.range[0] > 0 && doc[ls.range[0]-1].every(w => isComment(w)) ? doc[ls.range[0]-1].join(" ").replace(/[()]/g, "").trim() : "";
  const name = before ? before.replace(/\s*SUBPROGRAM$/i, "").toLowerCase().replace(/^\w/, c => c.toUpperCase()) : `From ${fileName} ${ls.label}`;
  openEditor(null, { glosscode:"subprogram/1", id:"", name, word:{ words:"", short:"" }, program:prog, category:"", tags:[],
    machines:["fanuc." + m.type], units:(lineState[curLine] || newState()).units, source:"mine", args:[], about:"",
    body:[`O${prog} (${name.toUpperCase()})`, ...lines.map(l => /^M0?99$/.test(l) ? "M99" : l)] });
  $("s-msg").textContent = `Copied ${ls.label}. Swap the numbers that change for #24 (X), #25 (Y), #26 (Z)…, then Add from body.`;
}

// Add the library to the Insert menu, before the canned cycle guide.
const baseInsert = Object.getOwnPropertyDescriptor(MENUS, "Insert").get;
Object.defineProperty(MENUS, "Insert", { enumerable:true, configurable:true, get(){
  const items = baseInsert(), m = MACHINES[machineId];
  const mine = LIB.filter(e => fits(e)==="yes").sort((a, b) => callsIn(b) - callsIn(a) || a.program - b.program);
  const ls = localSubAt(curLine);
  const lib = ["-", { grp:`Subprogram library` },
    { label:"Subprogram library…", sc:`${LIB.length} saved`, fn:() => openLibrary() },
    ...mine.slice(0, 5).map(e => ({ label:e.name + "…", sc:"O" + e.program, fn:() => openLibrary(e.id) })),
    ...(mine.length > 5 ? [{ grp:`${mine.length - 5} more in the library` }] : []),
    ...(!mine.length ? [{ grp:`None for ${esc(m.name)} yet` }] : []),
    { label:"New library subprogram…", fn:() => { closeMenu(); openEditor(null); } },
    { label:ls ? `Save ${ls.label} to the library…` : "Save a subprogram to the library…", sc:ls ? "" : "Put the cursor in one", dis:() => !ls, fn:saveLocalSub }];
  const at = items.lastIndexOf("-");
  return [...items.slice(0, at), ...lib, ...items.slice(at)];
}});
window.openLibrary = openLibrary; window.openLibEditor = openEditor;
render();
})();
