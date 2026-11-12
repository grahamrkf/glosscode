/* ---------- Converting a program to another control ----------
   Program › Convert to another control… reads the program the way its own control reads it, lifts every
   code to its meaning (its full gloss word, such as spindle.fwd), and writes the code that has the same
   meaning on the target control. Numbers become real values first, so X1 on a Haas (0.0001 in) is written
   X0.0001 and a dwell is rewritten in the target's units. Lines are then checked three ways: the target's
   own reading and checks, the target's word lists for its canned cycles, and a move-by-move comparison of
   the two simulations. Each line gets a level:
     green  the same meaning, written directly, and the toolpath matches
     amber  converted, but worth a look (a draft control table, a builder M code, a system variable,
            a toolpath difference, a problem the target's checks find)
     red    no code with this meaning on the target: you choose to comment the line out or keep it as written
   Answers to red lines are remembered per pair of controls. The lifted program can be copied as the GlossCode
   middle format: one line per block, codes as full words, values as real numbers. */
(() => {
const cvdlg = $("cvdlg");
let CV = null;   // the conversion being reviewed

// Runs fn with another machine and program in place of the active tab's, then puts everything back.
function withProgram(mid, toks, fn){
  const save = { machineId, doc, view, lineState, EXEC, expanded, fileEob };
  try {
    machineId = mid; setDialect(); doc = toks; expanded = new Set(); translateAll(true); EXEC = interpret();
    return fn();
  } finally {
    ({ machineId, doc, view, lineState, EXEC, expanded, fileEob } = save);
    setDialect();   // DIALECT, SYNTAX and the columns follow machineId again
  }
}
// Controls a program can be converted from and to: ones that use the Fanuc-style block syntax.
const convertible = mid => { const m = MACHINES[mid]; return m && !(RULES.dialects[m.brand]?.blockSyntax); };
const label = mid => RULES.dialects[MACHINES[mid].brand]?.label || MACHINES[mid].name;
const verifiedOf = mid => RULES.dialects[MACHINES[mid].brand]?.verified === true;
const isCodeTok = t => /^[GM]\d/.test(t);
const fmtVal = n => { const r = (Math.round(n*10000)/10000).toString(); return r.includes(".") ? r : r + "."; };
// M codes most Fanuc-style controls share. Any other M code belongs to the machine builder.
const STD_M = new Set(["M00","M01","M02","M03","M04","M05","M06","M08","M09","M30","M98","M99"]);

/* Lifting: each block as meanings, in the source control's terms. */
function liftProgram(){
  const D = DIALECT, out = [];
  doc.forEach((toks, li) => {
    const st = lineState[li] || newState(), cells = view[li] || [];
    const items = toks.map((t, i) => {
      const c = cells[i] || {};
      if (isComment(t)) return { kind:"text", t, comment:true };
      if (c.unk) return { kind:"raw", t, unknown:true };
      if (isCodeTok(t) && c.code){
        const e = entry(c.code);
        return { kind:"code", t, code:c.code, words:e?.words || null, cs:!!c.cs, desc:e?.desc || "", cycle:!!D.cycles?.[c.code] };
      }
      if (/^[NO]\d/.test(t) || t===";" || t==="%" || t[0]==="/") return { kind:"text", t };
      if (isMacroTok(t)) return { kind:"raw", t, macro:true, sys:/#(?:[1-9]\d{3,})\b/.test(t) };
      const m = /^([A-Z])(.*)$/.exec(t);
      if (!m || isKw(t)) return { kind:"raw", t, kw:isKw(t) };
      const L = m[1], raw = m[2], cy = st.cycleCode && D.cycles?.[st.cycleCode];
      if (cy?.labels?.includes(L) || (st.subWord && L===st.subWord) || (L==="P" && (st.sub || st.local))) {
        return { kind:"text", t };
      }   // a line or program number, not a value
      // A dwell, in seconds whatever the source's rule (Haas and Fanuc P without a decimal is milliseconds)
      if (st.dwell && (D.dwellWords || []).includes(L) && /^[-+]?\d*\.?\d+\.?$/.test(raw)){
        const n = parseFloat(raw), dec = raw.includes(".");
        const secs = D.dwellHundredths ? n/100 : (!dec && L==="P" && D.dwellNoDecimal==="ms") ? n/1000 : n;
        return { kind:"dwell", t, L, secs };
      }
      const f = fmtNum(L, raw, st);
      return { kind:"addr", t, L, raw, v:f.v, implied:!!f.implied, intended:f.intended };
    });
    out.push({ li, items, units:st.units });
  });
  // A local subprogram call (Haas M97 P1000 L2): the lines it runs, so the target can have them written in
  const L = labels();
  out.forEach(b => {
    if (!b.items.some(x => x.words==="call.local")) return;
    const start = L[callTarget(doc[b.li])]; if (start==null) return;
    const lines = []; for (let j = start; j < doc.length && lines.length < 500; j++){ if (isReturn(doc[j])) { b.subEnd = j; break; } lines.push(j); }
    if (b.subEnd==null) return;
    b.sub = lines; b.subStart = start;
    b.reps = Math.max(1, parseInt((doc[b.li].find(t => /^L\d+$/.test(t)) || "L1").slice(1), 10));
  });
  return out;
}
// The GlossCode middle format: codes as full words, values as real numbers, the source block kept after |.
function middleText(lifted, from){
  const head = [`; GlossCode middle format, read from ${from} on ${new Date().toISOString().slice(0, 10)}`,
                "; codes are full gloss words; L=value is an address in program units; dwell is in seconds; | is the source block"];
  return head.concat(lifted.map(b => {
    const w = b.items.map(x => x.kind==="code" ? (x.words || "?" + x.t) : x.kind==="dwell" ? `dwell=${fmtVal(x.secs)}s`
      : x.kind==="addr" ? `${x.L}=${x.v}` : x.t).join(" ");
    const src = b.items.map(x => x.t).join(" ");
    return w===src || !src ? w : `${w}   | ${src}`;
  })).join("\n");
}

/* Writing: each lifted block in the target control's terms. Runs with the target machine in place. */
function codesByMeaning(){
  const by = {};
  for (const c of codeWords()) if (c.words && isCodeTok(c.k)) (by[c.words] ||= []).push(c);
  return by;
}
function writeBlock(block, by, ans, lifted, depth = 0){
  const T = DIALECT, out = [], why = [], notes = [];
  let level = "green", red = null;
  const missing = [];   // codes with no match on the target
  const amber = r => { if (level==="green") level = "amber"; why.push(r); };
  for (const x of block.items){
    if (x.kind==="text") { out.push(x.t); continue; }
    if (x.kind==="raw"){
      out.push(x.t);
      if (x.unknown) red ||= { key:"unknown:" + x.t, what:`${x.t} isn't a word the source control knows, so there's nothing to convert it from.` };
      else if (x.kw) red ||= { key:"kw:" + x.t.split(/[ =[(]/)[0], what:`${x.t} is a statement of the source control's own language, which the target doesn't read.` };
      else if (x.sys) amber(`${x.t} uses a system variable. Numbers for these differ between controls, so check it on the target.`);
      else if (x.macro) notes.push("Macro statement copied as written.");
      continue;
    }
    if (x.kind==="code"){
      const cands = x.words ? by[x.words] || [] : [];
      const pick = cands.find(c => c.k===x.code) || cands.find(c => c.pref) || cands[0];
      if (!pick){
        out.push(x.t); missing.push(x);
        if (!red) red = { key:x.words || x.code, drop:true };
        else if (!red.drop) red.what += ` ${x.code} has no match either.`;
        continue;
      }
      out.push(pick.k===x.code ? x.t : pick.k);
      if (pick.k!==x.code) notes.push(`${x.code} is ${pick.k} on the target (${x.words}).`);
      if (x.cycle || T.cycles?.[pick.k]){
        if (pick.k!==x.code) amber(`${x.code} becomes ${pick.k}, a cycle with the same gloss word. Its words may not mean the same on the target, so check them against its manual.`);
        else if (PAIR.lathe && PAIR.from!==PAIR.to && /^G7[0-8]$/.test(pick.k)) amber(`Lathe cycles G70 to G78 differ between controls (one-block or two-block forms, set by a parameter on Fanuc). Check ${pick.k}'s words against the target's manual.`);
      }
      if (/^M/.test(pick.k) && (!STD_M.has(pick.k) || x.words.startsWith("machine."))) amber(`${pick.k} (${x.words}) is a machine builder's M code. Check that the target machine has it.`);
      else if (x.cs) amber(`${x.code} is specific to the source control; ${pick.k} has the same gloss word on the target, but check it behaves the same.`);
      continue;
    }
    if (x.kind==="dwell"){
      const letters = T.dwellWords || ["P"];
      let w;
      if (T.dwellHundredths) w = letters[0] + Math.round(x.secs*100);
      else if (letters.includes("P") && T.dwellNoDecimal==="ms") w = "P" + Math.round(x.secs*1000);
      else if (letters.includes("X")) w = "X" + fmtVal(x.secs);
      else w = letters[0] + fmtVal(x.secs);
      out.push(w);
      if (w!==x.t) notes.push(`Dwell ${x.t} is ${fmtVal(x.secs)} seconds, written ${w}.`);
      continue;
    }
    // An address. A distance written without a decimal point is written as the value the source read.
    if (x.implied){
      const w = x.L + fmtVal(parseFloat(x.v));
      out.push(w);
      notes.push(`${x.t} was read as ${x.v} ${block.units==="inch" ? "in" : "mm"}, so it's written ${w}. If ${x.intended} was meant, fix the source too.`);
    }
    else out.push(x.t);
  }
  if (red?.drop){
    red.what = missing.map(x => `${x.code} (${x.words || "unknown"}: ${x.desc || "no description"})`).join(" and ") + ` ${missing.length > 1 ? "have" : "has"} no code with the same meaning on the target.`;
    red.codes = missing.map(x => x.code).join(" ");
    // Only an M code or a mode setting (set.*) can be left out on its own: other G codes give the line's other words their meaning.
    if (!missing.every(x => /^M/.test(x.code) || (!x.cycle && x.words?.startsWith("set."))) || missing.length===out.filter(t => !isComment(t) && !/^[NO]\d/.test(t)).length) {
      red.drop = false;
    }
  }
  if (red){
    if (red.key==="call.local" && block.sub) red.inline = true;
    const choice = ans[red.key] || (red.inline ? "inline" : red.drop ? "drop" : "comment");
    const src = block.items.map(x => x.t).join(" ").replace(/[()]/g, "");
    if (choice==="inline" && red.inline && depth < 4){
      // Written in: the subprogram's lines (without their N numbers) take the call's place, once per repeat
      const lines = [[`(${src} WRITTEN IN)`]], sub = [];
      let lv = "green";
      for (let k = 0; k < block.reps; k++) for (const j of block.sub){
        const w = writeBlock({ ...lifted[j], items:lifted[j].items.filter(x => !/^N\d/.test(x.t)) }, by, ans, lifted, depth + 1);
        lines.push(...w.lines.filter(l => l.length)); if (k===0) sub.push(...w.why);
        if (w.level==="red" || (w.level==="amber" && lv==="green")) lv = w.level;
      }
      return { lines, level: lv==="red" ? "red" : "amber", why:[`${block.items.find(x => x.words==="call.local").code} has no match on the target, so the ${block.sub.length} lines it runs are written in${block.reps > 1 ? `, ${block.reps} times` : ""}.`, ...new Set(sub)], red, choice, notes, inlined:block.subStart };
    }
    if (choice==="drop" && red.drop){
      const keep = out.filter(t => !missing.some(x => x.t===t));
      return { lines:[[...keep, `(${red.codes} NOT CONVERTED)`]], level:"red", why:[red.what], red, choice, notes };
    }
    if (choice==="comment" || (choice==="drop" && !red.drop)) return { lines:[[`(CONVERT BY HAND: ${src})`]], level:"red", why:[red.what], red, choice, notes };
    return { lines:[out], level:"red", why:[red.what], red, choice, notes };
  }
  return { lines:[out], level, why, notes };
}

/* Converting the active program to machine tgt. */
function convert(tgt){
  const srcId = machineId, from = label(srcId), to = label(tgt);
  PAIR = { from:MACHINES[srcId].brand, to:MACHINES[tgt].brand, lathe:mtype()==="lathe" };
  const pair = MACHINES[srcId].brand + ">" + MACHINES[tgt].brand, ans = window.convertAnswers?.(pair) || {};
  // The source: its meanings, its simulation and its own problems
  const lifted = liftProgram(), srcSegs = moves(EXEC.segs), srcProbs = new Set(PROBLEMS.map(p => p.li + ":" + p.id));
  const middle = middleText(lifted, from);
  const res = withProgram(tgt, [[]], () => {
    const by = codesByMeaning();
    return lifted.map(b => ({ li:b.li, src:b.items.map(x => x.t).join(" "), ...writeBlock(b, by, ans, lifted) }));
  });
  // A local subprogram every call to which was written in isn't needed any more
  const calls = lifted.filter(b => b.sub);
  for (const st of new Set(calls.map(b => b.subStart))){
    const cs = calls.filter(b => b.subStart===st);
    if (!cs.every(b => res[b.li].inlined===st)) continue;
    for (let j = st; j <= cs[0].subEnd; j++) Object.assign(res[j], { lines:[], level:"green", why:[], notes:["Written in at each call, so it's left out."], dropped:true });
  }
  // The header says what this is; a "proven by" line no longer holds for the converted program.
  const date = new Date().toISOString().slice(0, 10);
  const hdr = [`(CONVERTED FROM ${MACHINES[srcId].name.toUpperCase().replace(/[()]/g, "")} TO ${MACHINES[tgt].name.toUpperCase().replace(/[()]/g, "")} ${date})`, "(NOT PROVEN ON THE TARGET MACHINE - DRY RUN FIRST)"];
  res.forEach(r => r.lines = r.lines.map(l => l.map(t => /proven by/i.test(t) && isComment(t) ? "(WAS " + t.replace(/[()]/g, "").trim() + " - NOT RUN SINCE CONVERSION)" : t)));
  const at = res.findIndex(r => r.lines.length && !/^%$|^O\d/.test(r.lines[0][0] || ""));
  const ins = at < 0 ? res.length : at;
  const outDoc = [], owner = [];   // owner[k]: the source row output line k came from (null for the header)
  res.forEach((r, i) => { if (i===ins) hdr.forEach(h => { outDoc.push([h]); owner.push(null); }); r.lines.forEach(l => { outDoc.push(l); owner.push(i); }); });
  if (ins >= res.length) hdr.forEach(h => { outDoc.push([h]); owner.push(null); });
  const rowOf = k => owner[k];
  // Check the result as the target reads it: unknown words, its own problems, its cycles, and its toolpath
  withProgram(tgt, outDoc, () => {
    view.forEach((cells, k) => { const r = res[rowOf(k)]; if (!r || r.level==="red") return;
      cells.forEach(c => { if (c.unk){
        r.level = "red";
        r.red ||= { key:"unknown-target:" + c.g, what:`The target doesn't read ${c.g}.` };
        r.why.unshift(`The target doesn't read ${c.g}.`);
        r.choice ||= "keep";
      } }); });
    const probs = checkProgram(true).filter(p => p.sev!=="info");
    for (const p of probs){
      const k = p.li, si = rowOf(k), r = si==null ? null : res[si]; if (!r || r.level==="red") continue;
      if (srcProbs.has(si + ":" + p.id)) continue;   // the source has the same problem on this line
      if (r.level==="green") r.level = "amber"; r.why.push(`Target check: ${p.msg}`);
    }
    // Words a canned cycle takes on the source that the target's cycle doesn't list
    outDoc.forEach((toks, k) => {
      const r = res[rowOf(k)], st = lineState[k]; if (!r || r.level==="red" || !st?.cycleCode) return;
      const cy = DIALECT.cycles?.[st.cycleCode]; if (!cy || !toks.some(t => isCode(t, st.cycleCode))) return;
      const ok = new Set([...(cy.requires || []), ...(cy.optional || []), ...(cy.choices || []).flat(), ...(cy.labels || []), "N", "G", "M", "F", "S", "T", "X", "Y", "Z", "R", "L", "K"]);
      const extra = toks.filter(t => /^[A-Z][-+.\d#[]/.test(t) && !ok.has(t[0])).map(t => t[0]);
      if (extra.length){
        if (r.level==="green") r.level = "amber";
        r.why.push(`${st.cycleCode} on the target doesn't list ${[...new Set(extra)].join(", ")} as one of its words.`);
      }
    });
    // Move by move: the first place the toolpaths part ways
    const tseg = moves(EXEC.segs), tol = 0.00051;
    const same = (a, b) => a.rapid===b.rapid && Math.abs(a.b.x - b.b.x) < tol && Math.abs(a.b.y - b.b.y) < tol && Math.abs(a.b.z - b.b.z) < tol;
    const n = Math.min(srcSegs.length, tseg.length); let i = 0;
    while (i < n && same(srcSegs[i], tseg[i])) i++;
    CV_SIM = { srcMoves:srcSegs.length, tgtMoves:tseg.length, firstDiff: i < Math.max(srcSegs.length, tseg.length) ? i : null };
    if (CV_SIM.firstDiff!=null){
      const seg = tseg[i] || tseg[tseg.length - 1], k = seg?.li, r = k!=null ? res[rowOf(k)] : null;
      if (r && r.level!=="red"){ r.level = "amber"; r.why.unshift(`The toolpath differs from the source from here on (move ${i + 1}).`); }
      CV_SIM.atLine = r ? r.li : null;
    }
  });
  // Lines the source and target controls' tables are less sure of can't be green.
  const cap = !verifiedOf(srcId) || !verifiedOf(tgt);
  return { srcId, tgt, from, to, pair, ans, rows:res, outDoc, middle, cap, sim:CV_SIM };
}
let CV_SIM = null, PAIR = {};
// The moves to compare: ones that go somewhere (a repeat can add a move that stays put)
const moves = segs => segs.filter(s => Math.abs(s.a.x - s.b.x) + Math.abs(s.a.y - s.b.y) + Math.abs(s.a.z - s.b.z) > 1e-9);

/* The review dialog */
function targets(){
  const type = mtype(), src = machineId;
  return Object.entries(MACHINES).filter(([k, m]) => k!==src && m.type===type && convertible(k))
    .sort((a, b) => a[1].name.localeCompare(b[1].name));
}
function defaultTarget(){
  const t = targets().map(([k]) => k), brand = MACHINES[machineId].brand;
  const want = brand.startsWith("haas") ? ["fanuc_0imf", genId(mtype(), "fanuc")] : [genId(mtype(), "haas"), genId(mtype(), "fanuc")];
  return want.find(k => t.includes(k)) || t[0];
}
function openConvert(){
  if (editing && !commit()) return;
  closeMenu?.();
  if (!convertible(machineId)){
    setMsg(`Can't convert from ${MACHINES[machineId].name} yet (Fanuc-style controls only).`, true);
    return;
  }
  const sel = $("cv-tgt");
  sel.innerHTML = targets().map(([k, m]) => `<option value="${esc(k)}">${esc(m.name)}${verifiedOf(k) ? "" : " (draft rules)"}</option>`).join("");
  sel.value = defaultTarget();
  $("cv-from").textContent = MACHINES[machineId].name;
  $("cv-only").checked = false; $("cv-view").value = "lines";
  showDialog(cvdlg);
  run();
  sel.focus();
}
function run(){ CV = convert($("cv-tgt").value); draw(); }
const DOT = { green:"Converted directly", amber:"Converted, worth a look", red:"Needs your decision" };
function draw(){
  const c = CV, cnt = l => c.rows.filter(r => r.level===l && r.src.trim()).length;
  $("cv-sum").innerHTML = `<span class="cvd green"></span>${cnt("green")} direct <span class="cvd amber"></span>${cnt("amber")} to look at <span class="cvd red"></span>${cnt("red")} to decide`;
  const s = c.sim;
  $("cv-sim").textContent = s.firstDiff==null ? `Toolpath: all ${s.srcMoves} moves match the source.`
    : `Toolpath: ${s.firstDiff} of ${s.srcMoves} moves match, then it differs${s.atLine!=null ? ` at line ${s.atLine + 1}` : ""}${s.tgtMoves!==s.srcMoves ? ` (the target has ${s.tgtMoves})` : ""}.`;
  $("cv-sim").textContent += " Two comment lines at the top say the program is converted and not proven.";
  $("cv-cap").hidden = !c.cap;
  $("cv-cap").textContent = c.cap ? `${!verifiedOf(c.srcId) ? c.from : c.to} rules are a first draft, not yet checked against the manual, so check every line, green ones too.` : "";
  const mid = $("cv-view").value==="middle";
  $("cv-mid").hidden = !mid; $("cv-tbl").hidden = mid;
  if (mid){ $("cv-mid").textContent = c.middle; return; }
  const only = $("cv-only").checked;
  $("cv-tbl").innerHTML = `<div class="cvh"><span>Line</span><span>${esc(MACHINES[c.srcId].name)} (${esc(c.from)})</span><span>${esc(MACHINES[c.tgt].name)} (${esc(c.to)})</span><span>Why</span></div>` + c.rows.map((r, i) => {
    if (only && r.level==="green") return "";
    if (!r.src.trim() && !r.lines.some(l => l.length)) return "";
    const why = [...r.why, ...r.notes];
    const opt = (v, t) => `<option value="${v}"${r.choice===v ? " selected" : ""}>${t}</option>`;
    const pick = r.red ? `<select class="cvpick" data-i="${i}">${r.red.inline ? opt("inline", "Write the subprogram's lines in here") : ""}${r.red.drop ? opt("drop", `Leave out ${r.red.codes}, convert the rest`) : ""}${opt("comment", "Comment the line out, finish it by hand")}${opt("keep", "Keep the words as written")}</select>` : "";
    return `<div class="cvr ${r.level}"><span class="cvn"><span class="cvd ${r.level}" title="${DOT[r.level]}"></span>${r.li + 1}</span><code>${esc(r.src)}</code><code>${r.lines.map(l => esc(l.join(" "))).join("\n")}</code><span class="cvw">${why.map(esc).join("<br>")}${pick}</span></div>`;
  }).join("");
}
function finish(){
  const c = CV, name = fileName || "PROGRAM", ext = /\.[^.]+$/.exec(name)?.[0] || ".nc";
  const base = name.replace(/\.[^.]+$/, "");
  const src = c.outDoc.map(t => t.join(" "));
  closeConvert();
  window.openProgram?.({ name:`${base} (${MACHINES[c.tgt].name})${ext}`, machine:c.tgt, src });
  const red = c.rows.filter(r => r.level==="red").length;
  setMsg(`Converted to ${MACHINES[c.tgt].name}. ${red ? `${red} line${red===1 ? "" : "s"} need finishing by hand (CONVERT BY HAND). ` : ""}Save it with File › Save As, and dry run it before cutting.`);
}
function closeConvert(){
  CV = null;
  hideDialog(cvdlg);
}

$("cv-tgt").addEventListener("change", run);
$("cv-only").addEventListener("change", draw);
$("cv-view").addEventListener("change", draw);
$("cv-tbl").addEventListener("change", e => {
  const s = e.target.closest(".cvpick"); if (!s || !CV) return;
  const r = CV.rows[+s.dataset.i]; CV.ans[r.red.key] = s.value; window.saveConvertAnswers?.();
  run();
});
$("cv-copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(CV.middle); $("cv-msg").textContent = "Middle format copied."; }
  catch { $("cv-msg").textContent = "Couldn't copy. Pick Middle format in the view list and select the text instead."; }
});
$("cv-ok").addEventListener("click", finish);
$("cv-cancel").addEventListener("click", closeConvert);
$("cv-x").addEventListener("click", closeConvert);
document.addEventListener("keydown", e => { if (!cvdlg.hidden && e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); closeConvert(); } }, true);

MENUS.Program.push("-", { label:"Convert to another control…", fn:openConvert, doc:true });
window.openConvert = openConvert; window.convertProgram = convert;
})();
