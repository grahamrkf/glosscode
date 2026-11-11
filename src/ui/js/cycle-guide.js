/* ---------- Canned cycle guide (F1) ----------
   One page per cycle in the selected machine's table: what it does, a rough sketch, an example line with
   every word it takes (English above, G-code below), and what each word does. Text comes from
   RULES.cycleHelp; the word lists come from the dialect's cycles table, so they match the checks. */
const cdlg = document.getElementById("cdlg");
let cSel = null;
const EX_DEFAULT = { X:"1.", Y:"0.5", Z:"-0.5", R:"0.1", F:"6.", Q:"0.1", P:"0.5", K:"1", L:"1", I:"0.1", J:"0.1", D:"0.1", U:"0.02", W:"0.005", S:"600", T:"0101", A:"60" };
function openCycleHelp(code){
  if (editing && !commit()) return;
  const list = Object.keys(DIALECT.cycles || {}).sort();
  if (!code){
    code = lineCycle(curLine) || list[0];
  }
  cSel = code; drawCycleHelp(); cdlg.hidden = false;
}
function cycleWordsFor(code){
  const def = DIALECT.cycles[code], rows = [];
  (def.requires || []).forEach(L => rows.push({ L, need:"req" }));
  (def.choices || []).forEach((set, si) => set.forEach(L => rows.push({ L, need:"one", set:si, sets:def.choices })));
  (def.optional || []).forEach(L => { if (!rows.some(r => r.L===L)) rows.push({ L, need:"opt" }); });
  return rows;
}
function drawCycleHelp(){
  const list = Object.keys(DIALECT.cycles || {}).sort(), m = MACHINES[machineId];
  document.getElementById("c-title").textContent = `Canned cycle guide · ${m.name} (${DIALECT.label}, ${m.type})`;
  document.getElementById("clist").innerHTML = list.length
    ? `<div class="cgrp">${m.type==="lathe" ? "Lathe" : "Mill"} cycles on ${esc(DIALECT.label)}</div>` + list.map(c => `<div class="ci${c===cSel?" sel":""}" data-c="${c}"><b>${c}</b><span>${esc(DIALECT.cycles[c].name)}</span></div>`).join("")
    : `<div class="cgrp">No cycles in this machine's table yet.</div>`;
  const main = document.getElementById("cmain"), ins = document.getElementById("c-ins");
  if (!cSel || !DIALECT.cycles?.[cSel]){
    main.innerHTML = DIALECT.process ? `<p class="about">A ${m.type} machine has no canned cycles.</p>` : `<p class="about">${esc(DIALECT.label)} ${m.type} cycles aren't in the tables yet${DIALECT.referenceOnly ? " (its LAP and threading cycles are listed for reference only)" : ""}.</p>`;
    ins.disabled = true; document.getElementById("c-note").textContent = ""; return;
  }
  ins.disabled = false;
  const code = cSel, def = DIALECT.cycles[code], help = cycleHelp(code), rows = cycleWordsFor(code);
  const en = entry(code);
  // Example line: every word the cycle takes, using the first of any either/or sets.
  const exWords = rows.filter(r => r.need!=="one" || r.set===0).map(r => r.L + (help.words[r.L]?.[0] ?? EX_DEFAULT[r.L] ?? "1."));
  const toks = ["N100", code, ...exWords]; sortLine(toks);
  const st = { ...newState(), cycle:true, cycleCode:code, chg:[] };
  const W = COLW(), cells = toks.map(t => word(t, st));
  const exRow = (cls, f) => `<div class="r ${cls}"><span class="gut"></span>${cells.map((c, i) => `<span class="cell${i===0?" n":""}" style="width:${Math.max(W, toks[i].length+1, (c.e||"").length + (c.u ? 3 : 1))}ch">${f(c, i)}</span>`).join("")}</div>`;
  const ex = `<div class="cex"><div class="lbl">Example with every word it takes${def.choices ? ` (using ${def.choices[0].join(" ")}; ${def.choices.slice(1).map(s => s.join(" ")).join(" or ")} can be used instead)` : ""}</div>`
    + exRow("en", c => esc(c.e) + (c.u ? `<small class="u">${esc(c.u)}</small>` : "")) + exRow("gc", (c, i) => esc(toks[i])) + `</div>`;
  const what = L => help.words[L]?.[1] || (DIALECT.wordMeaning?.[L] ? DIALECT.wordMeaning[L][0].toUpperCase() + DIALECT.wordMeaning[L].slice(1) + "." : DICT.address[L]?.desc || "");
  const needChip = r => r.need==="req" ? (r.L==="F" && !def.leadF ? `<span class="need req" title="Unless an F is already active">Required*</span>` : `<span class="need req">Required</span>`)
    : r.need==="one" ? `<span class="need one" title="Use one of: ${esc(r.sets.map(s => s.join(" ")).join(" or "))}">One of ${esc(r.sets.map(s => s.join(" ")).join(" / "))}</span>` : `<span class="need opt">Optional</span>`;
  const table = `<table class="cwords"><thead><tr><th>Word</th><th>Gloss</th><th>Needed</th><th>What it does</th></tr></thead><tbody>${rows.map(r => {
    const w = r.L + (help.words[r.L]?.[0] ?? EX_DEFAULT[r.L] ?? "1."), c = word(w, st);
    return `<tr><td class="w">${esc(r.L)}</td><td class="e">${esc(englishPrefix(r.L, st))}</td><td>${needChip(r)}</td><td>${esc(what(r.L))}</td></tr>`; }).join("")}</tbody></table>`;
  main.innerHTML = `<h4><code>${code}</code>${esc(def.name)}<small>${en ? esc(en.words) + " · " : ""}${esc(DIALECT.label)}</small></h4>`
    + `<p class="about">${esc(help.about || en?.desc || "")}</p>`
    + `<div class="csk">${cycleSketch(help.sketch, help.labels || {}, def)}<div class="key"><span><i style="border-color:${SKC.rapid};border-top-style:dashed"></i>Rapid</span><span><i style="border-color:${SKC.feed}"></i>Feed</span><span><b style="color:${SKC.lab};font-family:var(--w-mono)">Z R Q</b> &nbsp;Words on the line</span><span style="max-width:160px;color:#888">A rough sketch, not to scale.</span></div></div>`
    + ex + table;
  document.getElementById("c-note").textContent = [def.note, DIALECT.verified ? "" : `${DIALECT.label} tables are a first draft, not yet checked against the manual.`].filter(Boolean).join(" ");
}
document.getElementById("clist").addEventListener("click", e => { const it = e.target.closest(".ci"); if (!it) return; cSel = it.dataset.c; drawCycleHelp(); });
document.getElementById("c-close").onclick = document.getElementById("c-x").onclick = () => { cdlg.hidden = true; ed.focus({preventScroll:true}); };
// Start a new line below the selected one with just the cycle code; the grey hints then walk through its words.
document.getElementById("c-ins").onclick = () => {
  cdlg.hidden = true;
  pushUndo();
  const nn = nextN(curLine), words = [...(nn.n!=null ? [nWord(nn.n)] : []), cSel];
  doc.splice(curLine+1, 0, words);
  expanded = new Set([...expanded].map(i => i > curLine ? i+1 : i));
  curLine++;
  render(); scrollToLn(ed.querySelector(`.ln[data-key="m${curLine}"]`)); ed.focus({preventScroll:true}); showInfo(curLine, null);
  setMsg(`Added ${words.join(" ")}. The grey words in its gloss are what it still needs: press Enter and type them.`);
};

/* Sketches: plain SVG, 380×230. Mill cycles are a side section through the hole;
   lathe cycles are the top half of the part seen from the front, chuck on the left. */
const SKC = { rapid:"#e8a33d", feed:"#0f6cbd", lab:"#6a2fd6", part:"#e8ecf1", edge:"#8f9bab", guide:"#b9c2cf", finish:"#0e9384" };
function cycleSketch(kind, labels, def){
  const defs = `<defs>${["rapid","feed","lab","finish"].map(k => `<marker id="ah-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${SKC[k]}"/></marker>`).join("")}<pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#d3d9e1" stroke-width="2"/></pattern></defs>`;
  const L = (x1, y1, x2, y2, k, arrow) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SKC[k]}" stroke-width="${k==="lab" ? 1 : 2}"${k==="rapid" ? ' stroke-dasharray="5 4"' : ""}${arrow ? ` marker-end="url(#ah-${k})"` : ""}/>`;
  const P = (pts, k, arrow, w) => `<polyline points="${pts.map(p => p.join(",")).join(" ")}" fill="none" stroke="${SKC[k]}" stroke-width="${w || 2}"${k==="rapid" ? ' stroke-dasharray="5 4"' : ""}${arrow ? ` marker-end="url(#ah-${k})"` : ""} stroke-linejoin="round"/>`;
  const G = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SKC.guide}" stroke-width="1" stroke-dasharray="3 3"/>`;
  const T = (x, y, t, anchor) => `<text x="${x}" y="${y}" font-size="13" font-weight="700" fill="${SKC.lab}" font-family="Cascadia Mono,Consolas,monospace" text-anchor="${anchor || "middle"}">${esc(t)}</text>`;
  const N = (x, y, t, anchor) => `<text x="${x}" y="${y}" font-size="10.5" fill="#6b7480" font-family="Segoe UI,system-ui,sans-serif" text-anchor="${anchor || "start"}">${esc(t)}</text>`;
  const Dm = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SKC.lab}" stroke-width="1" marker-start="url(#ah-lab)" marker-end="url(#ah-lab)"/>`;
  const poly = pts => `<polygon points="${pts.map(p => p.join(",")).join(" ")}" fill="url(#hatch)" stroke="${SKC.edge}" stroke-width="1.2"/><polygon points="${pts.map(p => p.join(",")).join(" ")}" fill="${SKC.part}" fill-opacity=".55" stroke="none"/>`;
  let g = "";
  const mill = ["drill","dwell","peck","peck-hs","tap","tap-lh","bore-feed","bore-stop","bore-dwell","finebore"];
  if (mill.includes(kind)){
    const top = 120, bot = 222, x1 = 168, x2 = 212, zi = 32, zr = 92, zz = 186, cx = 190;
    const point = ["drill","dwell","peck","peck-hs","tap","tap-lh"].includes(kind);
    let left = [[x1, top], [x1, zz]], right = [[x2, zz], [x2, top]];
    if (kind.startsWith("tap")){ left = [[x1, top]]; right = []; for (let y = top; y < zz; y += 8){ left.push([x1-4, y+4], [x1, y+8]); right.unshift([x2, y+8], [x2+4, y+4]); } right.push([x2, top]); }
    g += poly([[16, top], ...left, ...(point ? [[cx, zz+12]] : []), ...right, [364, top], [364, bot], [16, bot]]);
    g += G(40, zi, 340, zi) + G(40, zr, 340, zr) + G(40, zz, 160, zz);
    g += N(44, zi-5, `Initial ${labels.axis || "Z"}  (G98 returns here)`) + T(30, zr+4, labels.R || "R") + N(44, zr-5, "G99 returns here") + T(30, zz+4, labels.Z || "Z");
    g += `<path d="M${cx-7},${zi-26} h14 v16 l-7,8 l-7,-8 z" fill="#c7ced8" stroke="#8f9bab"/>`;
    g += L(cx-12, zi, cx-12, zr, "rapid", true);
    const down = (x, y1, y2) => L(x, y1, x, y2, "feed", true);
    if (kind==="peck" || kind==="peck-hs"){
      const q = 32;
      if (kind==="peck") g += down(cx-12, zr, zr+q) + L(cx-6, zr+q, cx-6, zr, "rapid", true) + L(cx, zr, cx, zr+q-4, "rapid", true) + down(cx, zr+q-4, zr+2*q) + L(cx+6, zr+2*q, cx+6, zr, "rapid", true) + L(cx+12, zr, cx+12, zr+2*q-4, "rapid", true) + down(cx+12, zr+2*q-4, zz);
      else g += down(cx-12, zr, zr+q) + L(cx-6, zr+q, cx-6, zr+q-7, "rapid", true) + down(cx-6, zr+q-7, zr+2*q) + L(cx, zr+2*q, cx, zr+2*q-7, "rapid", true) + down(cx, zr+2*q-7, zz) + N(222, zr+q-2, "backs off a little");
      g += L(cx+18, zz, cx+18, zr, "rapid", true) + Dm(150, zr, 150, zr+q) + T(140, zr+q/2+5, "Q");
    } else if (kind==="finebore"){
      g += down(cx-8, zr, zz) + `<circle cx="${cx-8}" cy="${zz+4}" r="4.5" fill="#fff" stroke="${SKC.lab}"/>` + T(cx-26, zz+6, "P");
      g += L(cx-8, zz-8, cx+10, zz-8, "lab", true) + T(cx+2, zz-13, "Q") + L(cx+10, zz-8, cx+10, zr, "rapid", true);
      g += N(226, zz-30, "spindle stops, oriented,") + N(226, zz-17, "moves off the wall by Q,") + N(226, zz-4, "then rapids out");
    } else {
      g += down(cx-8, zr, zz);
      const outK = ["drill","dwell","bore-stop"].includes(kind) ? "rapid" : "feed";
      g += L(cx+8, zz, cx+8, zr, outK, true);
      if (["dwell","bore-dwell"].includes(kind)) g += `<circle cx="${cx}" cy="${zz+4}" r="4.5" fill="#fff" stroke="${SKC.lab}"/>` + T(cx-22, zz+6, "P") + N(226, zz, "pauses for P at the bottom");
      if (kind==="bore-stop") g += N(226, zz, "spindle stops, rapids out");
      if (kind==="bore-feed") g += N(226, zz, "feeds back out");
      if (kind.startsWith("tap")) g += N(226, zz-14, kind==="tap" ? "M03 in, reverses to" : "M04 in, reverses to") + N(226, zz-1, kind==="tap" ? "M04 at Z, feeds out" : "M03 at Z, feeds out") + N(226, top-20, "F = pitch × rpm");
    }
    if (kind==="drill") g += N(226, zz, "rapids back out");
    return `<svg viewBox="0 0 380 230" width="380" height="230">${defs}${g}</svg>`;
  }
  if (kind==="backbore"){
    const top = 100, bot = 176, zi = 30, zr = 206, zz = 146, cx = 190;
    g += poly([[16, top], [176, top], [176, zz], [160, zz], [160, bot], [16, bot]]) + poly([[204, top], [364, top], [364, bot], [220, bot], [220, zz], [204, zz]]);
    g += G(40, zi, 340, zi) + G(40, zr, 340, zr) + G(40, zz, 150, zz);
    g += N(44, zi-5, "Initial Z") + T(30, zr+4, "R") + T(30, zz+4, "Z") + N(44, zr-6, "below the part");
    g += L(cx-8, zi, cx-8, zr, "rapid", true) + L(cx-8, zr+8, cx+6, zr+8, "lab", true) + T(cx+16, zr+12, labels.shift || "Q");
    g += L(cx+6, zr, cx+6, zz, "feed", true) + N(232, zz+30, "shifted off center to pass") + N(232, zz+43, "through, shifts back by Q,") + N(232, zz+56, "then cuts upward to Z");
    return `<svg viewBox="0 0 380 230" width="380" height="230">${defs}${g}</svg>`;
  }
  // Lathe: centerline at the bottom, part face at x=290, X is drawn as a radius.
  const CL = 212, face = 290;
  g += `<line x1="8" y1="${CL}" x2="372" y2="${CL}" stroke="#9aa6b5" stroke-dasharray="14 4 3 4"/>` + N(24, CL-4, "centerline");
  g += `<rect x="4" y="40" width="14" height="${CL-40}" fill="#c7ced8" stroke="#8f9bab"/>`;
  if (kind==="thread" || kind==="thread-cycle"){
    const crest = 72, root = 100, z0 = 120, pitch = 16;
    const teeth = []; for (let x = z0; x < face-8; x += pitch) teeth.push([x+pitch/2, root], [x+pitch, crest]);
    g += poly([[18, 56], [z0-10, 56], [z0-10, crest], [z0, crest], ...teeth, [face, crest], [face, CL], [18, CL]]);
    g += G(z0, 40, z0, CL) + T(z0, CL+14, "Z") + Dm(200, CL, 200, root) + T(214, 160, "X") + N(222, 160, kind==="thread" ? "minor ⌀ (last pass)" : "⌀ of this pass");
    g += Dm(z0+pitch, 63, z0+2*pitch, 63) + T(z0+1.5*pitch, 58, "F") + N(z0+2*pitch+8, 60, "lead");
    if (kind==="thread"){
      const n = 5, ds = Array.from({length:n}, (_, i) => (root-crest) * Math.sqrt((i+1)/n));
      ds.forEach((d, i) => { g += L(330, crest+d, z0+2, crest+d, "feed", i===n-1) .replace('stroke-width="2"', `stroke-width="${i===n-1 ? 2 : 1}" stroke-opacity="${i===n-1 ? 1 : .55}"`); });
      g += L(330, 40, 330, root, "rapid", true) + L(z0, root, z0, 40, "rapid", true) + L(z0, 40, 330, 40, "rapid", true);
      g += G(56, crest, z0, crest) + G(56, crest+ds[0], z0, crest+ds[0]) + G(76, root, z0, root);
      g += Dm(96, crest, 96, root) + T(86, (crest+root)/2+5, labels.height || "K", "end");
      g += Dm(66, crest, 66, crest+ds[0]) + T(60, crest+ds[0]/2+5, labels.first || "D", "end");
      g += `<path d="M322,14 h16 l-8,14 z" fill="#c7ced8" stroke="#8f9bab"/>` + T(346, 26, "A", "start") + N(300, 120, "each pass is", "start") + N(300, 133, "a little shallower", "start");
    } else {
      g += L(330, crest+10, z0+2, crest+10, "feed").replace('stroke-width="2"', 'stroke-width="1" stroke-opacity=".55"') + L(330, crest+19, z0+2, crest+19, "feed").replace('stroke-width="2"', 'stroke-width="1" stroke-opacity=".55"');
      g += L(330, 40, 330, root, "rapid", true) + L(330, root, z0, root, "feed", true) + L(z0, root, z0, 40, "rapid", true) + L(z0, 40, 330, 40, "rapid", true);
      g += N(374, 130, "one pass per line", "end");
    }
    return `<svg viewBox="0 0 380 230" width="380" height="230">${defs}${g}</svg>`;
  }
  if (kind==="turn" || kind==="face"){
    g += poly([[18, 56], [face, 56], [face, CL], [18, CL]]);
    if (kind==="turn"){
      const zx = 140, xd = 100;
      g += G(zx, 40, zx, CL) + T(zx, CL+14, "Z") + Dm(220, CL, 220, xd) + T(232, 165, "X");
      g += L(330, 40, 330, xd, "rapid", true) + L(330, xd, zx, xd, "feed", true) + L(zx, xd, zx, 40, "feed", true) + L(zx, 40, 330, 40, "rapid", true);
      g += G(zx, 72, face, 72) + G(zx, 86, face, 86) + N(374, 130, "feeds out, rapids back", "end") + N(150, 125, "R tapers the pass");
    } else {
      const zx = 266, xd = 172;
      g += G(zx, 30, zx, CL) + T(zx, CL+14, "Z") + Dm(240, CL, 240, xd) + T(228, 196, "X", "end");
      g += L(336, 36, zx, 36, "rapid", true) + L(zx, 36, zx, xd, "feed", true) + L(zx, xd, 336, xd, "feed", true) + L(336, xd, 336, 36, "rapid", true);
      g += N(374, 110, "one face", "end") + N(374, 123, "pass per line", "end");
    }
    return `<svg viewBox="0 0 380 230" width="380" height="230">${defs}${g}</svg>`;
  }
  if (["rough","face-rough","path-rough","finish"].includes(kind)){
    const C = [[300,150],[232,150],[232,110],[150,110],[120,80],[60,80],[60,50]];
    const cx = y => y<=80 ? 60 : y<=110 ? 120 + (y-80) : 232;
    const cy = x => x>232 ? 150 : x>150 ? 110 : x>120 ? 80 + (x-120) : x>60 ? 80 : 50;
    g += poly([[18, 50], ...C.slice().reverse(), [300, CL], [18, CL]]);
    g += `<polyline points="60,50 310,50 310,150" fill="none" stroke="#b9c2cf" stroke-dasharray="2 3"/>` + N(250, 44, "bar stock");
    if (kind==="rough"){
      for (let y = 60; y < 150; y += 12) g += L(322, y, cx(y)+5, y, "feed").replace('stroke-width="2"', 'stroke-width="1.2" stroke-opacity=".7"');
      g += Dm(338, 60, 338, 72) + T(346, 70, labels.depth || "D", "start");
    } else if (kind==="face-rough"){
      for (let x = 292; x > 62; x -= 12) g += L(x, 36, x, cy(x)-5, "feed").replace('stroke-width="2"', 'stroke-width="1.2" stroke-opacity=".7"');
      g += Dm(292, 26, 280, 26) + T(300, 30, labels.depth || "D", "start");
    } else if (kind==="path-rough"){
      for (const k of [3, 2, 1]) g += P(C.map(([x, y]) => [x + k*10, y - k*10]), "feed", false, 1.2).replace("<polyline", '<polyline stroke-opacity=".7"');
      g += Dm(300, 160, 330, 160) + T(338, 164, "K", "start") + Dm(312, 150, 312, 120) + T(320, 138, "I", "start");
    }
    if (kind==="finish") g += P(C.map(([x, y]) => [x+5, y-5]), "rapid", false, 1) + P(C, "feed", true, 2.5);
    else g += P(C, "finish", false, 2.2) + P(C.map(([x, y]) => [x+4, y-4]), "finish", false, 1).replace("<polyline", '<polyline stroke-dasharray="2 2"');
    g += T(300, 168, "P") + N(268, 182, "first N of the contour") + T(48, 46, "Q", "end") + N(24, 32, "last N");
    if (kind!=="finish" && kind!=="path-rough") g += N(130, 150, "U, W: stock left for G70");
    return `<svg viewBox="0 0 380 230" width="380" height="230">${defs}${g}</svg>`;
  }
  if (kind==="groove"){
    const top = 60, gx = 180, gw = 16, gd = 110;
    g += poly([[18, top], [gx, top], [gx, gd], [gx+gw, gd], [gx+gw, top], [face, top], [face, CL], [18, CL]]);
    g += `<rect x="${gx+gw}" y="${top}" width="${gw}" height="${gd-top}" fill="none" stroke="#b9c2cf" stroke-dasharray="2 3"/>`;
    g += L(gx+4, 36, gx+4, top+16, "feed", true) + L(gx+8, top+16, gx+8, top+10, "rapid") + L(gx+8, top+10, gx+8, top+32, "feed", true) + L(gx+12, top+32, gx+12, top+26, "rapid") + L(gx+12, top+26, gx+12, gd, "feed", true) + L(gx+15, gd, gx+15, 36, "rapid", true);
    g += Dm(gx-12, top, gx-12, top+16) + T(gx-20, top+12, "I", "end") + Dm(gx+8, 26, gx+8+gw, 26) + T(gx+8+gw/2, 20, "K");
    g += Dm(140, CL, 140, gd) + T(128, 170, "X", "end") + G(gx+2*gw, 30, gx+2*gw, CL) + T(gx+2*gw, CL+14, "Z") + N(240, 100, "pecks in by I,") + N(240, 113, "steps over by K");
    return `<svg viewBox="0 0 380 230" width="380" height="230">${defs}${g}</svg>`;
  }
  if (kind==="face-groove"){
    const zx = 230, y1 = 140, y2 = 156;
    g += poly([[18, 56], [face, 56], [face, y1], [zx, y1], [zx, y2], [face, y2], [face, CL], [18, CL]]);
    g += `<rect x="${zx}" y="${y1-16}" width="${face-zx}" height="16" fill="none" stroke="#b9c2cf" stroke-dasharray="2 3"/>`;
    g += L(336, y1+4, face-20, y1+4, "feed", true) + L(face-20, y1+8, face-14, y1+8, "rapid") + L(face-14, y1+8, face-40, y1+8, "feed", true) + L(face-40, y1+12, face-34, y1+12, "rapid") + L(face-34, y1+12, zx, y1+12, "feed", true) + L(zx, y2-1, 336, y2-1, "rapid", true);
    g += Dm(face, y2+12, face-20, y2+12) + T(face-10, y2+26, "K") + Dm(320, y1, 320, y1-16) + T(328, y1-4, "I", "start");
    g += G(zx, 40, zx, CL) + T(zx, CL+14, "Z") + N(150, 110, "pecks in by K, steps out by I");
    return `<svg viewBox="0 0 380 230" width="380" height="230">${defs}${g}</svg>`;
  }
  return `<svg viewBox="0 0 380 230" width="380" height="230">${defs}${N(20, 110, "No sketch for this cycle yet.")}</svg>`;
}
