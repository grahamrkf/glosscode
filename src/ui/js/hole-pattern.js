/* ---------- Hole pattern tool ----------
   Insert › Hole pattern… works out hole positions for a grid or a bolt circle in the active plane
   (G17 XY, G18 ZX, G19 YZ) and inserts one line per hole after the selected line, so a canned cycle that
   is active there drills each one. Values are written with a decimal point (X1.5, Y0.), as absolute
   positions under G90 or as distances from the previous hole under G91. On a lathe, X is a diameter. */
(() => {
const PLANES = { G17:{ ax:["X","Y"], name:"G17 · XY plane" }, G18:{ ax:["Z","X"], name:"G18 · XZ plane" }, G19:{ ax:["Y","Z"], name:"G19 · YZ plane" } };
const hdlg = $("hdlg");
let holes = null, kind = "grid", skipTouched = false, initUnits = null;

// Tool position after line li, in program coordinates as written (on a lathe X is a diameter).
function posAt(li){
  const i = EXEC.steps.findIndex(s => s.li===li);
  const s1 = i < 0 ? 0 : EXEC.steps[i].s1;
  if (!s1) return { x:0, y:0, z:0 };
  const last = EXEC.segs[s1-1];
  return last.kind==="cyc" && s1 > 1 ? EXEC.segs[s1-2].b : last.b;
}
const num = id => { const v = $(id).value.trim(); return v==="" ? NaN : Number(v); };
const rad = d => d * Math.PI / 180;
function fmt(v){
  const d = holes.mm ? 3 : 4;
  return (Math.round(v * 10**d) / 10**d).toFixed(d).replace(/0+$/, "");   // 1.5000 → 1.5, 1.0000 → 1., always a decimal point
}
const fmtEn = v => fmt(v).replace(/\.$/, ".0");   // in sentences a whole number reads 3.0, like the gloss line
const scale = A => holes.dia && A==="X" ? 2 : 1;   // lathe X is written as a diameter

function openHoles(){
  if (editing && !commit()) return;
  if (simIdx!=null) stopSim(true);
  closeMenu?.();
  const st = lineState[curLine] || newState();
  const plane = PLANES[st.plane] ? st.plane : "G17";
  const [a1, a2] = PLANES[plane].ax;
  const p = posAt(curLine);
  holes = { li:curLine, st, plane, a1, a2, dia: mtype()==="lathe" && !!DIALECT.diameterX, inc: st.dist==="inc", mm: st.units==="mm",
        pos: [p[a1.toLowerCase()], p[a2.toLowerCase()]] };
  if (initUnits!==st.units){   // starting values, kept between openings until the units change
    initUnits = st.units;
    const m = holes.mm ? 25 : 1;
    const set = (id, v) => $(id).value = v;
    set("hg-d1", fmt(m)); set("hg-a1", "0."); set("hg-n1", "4"); set("hg-d2", fmt(m)); set("hg-a2", "90."); set("hg-n2", "3");
    set("hc-c1", "0."); set("hc-c2", "0."); set("hc-r", fmt(3*m)); set("hc-n", "6"); set("hc-a0", "0."); set("hc-v", "30.");
  }
  // The first hole defaults to where the selected line leaves the tool.
  $("hg-o1").value = fmt(holes.pos[0]); $("hg-o2").value = fmt(holes.pos[1]);
  hdlg.querySelectorAll(".ax1").forEach(e => e.textContent = a1 + (scale(a1)===2 ? " dia." : ""));
  hdlg.querySelectorAll(".ax2").forEach(e => e.textContent = a2 + (scale(a2)===2 ? " dia." : ""));
  hdlg.querySelector(".rowlab").textContent = `Along ${a1} (rows)`;
  hdlg.querySelector(".collab").textContent = `Along ${a2} (columns)`;
  hdlg.querySelectorAll(".hu").forEach(e => e.textContent = holes.mm ? "mm" : "in");
  $("h-plane").textContent = `${PLANES[plane].name}, active on this line. Angles count from +${a1} toward +${a2}.`;
  skipTouched = false;
  showDialog(hdlg);
  update();
  (kind==="grid" ? $("hg-d1") : $("hc-r")).focus();
}
function closeHoles(){
  holes = null;
  hideDialog(hdlg);
}

// Hole centers in true lengths (lathe X as a radius), in plane axis order [a1, a2].
function points(){
  const bad = msg => ({ err: msg, pts: [] });
  const s1 = scale(holes.a1), s2 = scale(holes.a2);
  if (kind==="grid"){
    const o = [num("hg-o1")/s1, num("hg-o2")/s2];
    const d1 = num("hg-d1");
    const d2 = num("hg-d2");
    const q1 = num("hg-a1");
    const q2 = num("hg-a2");
    const n1 = num("hg-n1");
    const n2 = num("hg-n2");
    if (![...o, d1, d2, q1, q2].every(Number.isFinite)) return bad("Fill in every box with a number.");
    if (!Number.isInteger(n1) || !Number.isInteger(n2) || n1 < 1 || n2 < 1) {
      return bad("The number of holes in each direction has to be a whole number, 1 or more.");
    }
    if (n1*n2 > 500) return bad(`That's ${n1*n2} holes. The tool stops at 500.`);
    if ((n1 > 1 && d1 <= 0) || (n2 > 1 && d2 <= 0)) return bad("The distance between holes has to be more than 0.");
    if (n1 > 1 && n2 > 1 && Math.abs(Math.sin(rad(q2 - q1))) < 1e-6) {
      return bad("The two directions point the same way, so the rows would land on top of each other. Change one of the angles.");
    }
    const u = [Math.cos(rad(q1)), Math.sin(rad(q1))], v = [Math.cos(rad(q2)), Math.sin(rad(q2))], zig = $("hg-ord").value==="zig", pts = [];
    for (let j = 0; j < n2; j++) for (let k = 0; k < n1; k++){
      const i = zig && j % 2 ? n1-1-k : k;
      pts.push([o[0] + i*d1*u[0] + j*d2*v[0], o[1] + i*d1*u[1] + j*d2*v[1]]);
    }
    return { pts, sum: `${n1} × ${n2} grid, ${pts.length} hole${pts.length > 1 ? "s" : ""}` };
  }
  const c = [num("hc-c1")/s1, num("hc-c2")/s2], size = num("hc-r"), n = num("hc-n"), a0 = num("hc-a0"), ext = $("hc-ext").value, val = num("hc-v");
  if (![...c, size, a0].every(Number.isFinite) || (ext!=="full" && !Number.isFinite(val))) return bad("Fill in every box with a number.");
  if (!Number.isInteger(n) || n < 1 || n > 500) return bad("The number of holes has to be a whole number from 1 to 500.");
  const r = $("hc-sz").value==="d" ? size/2 : size;
  if (r <= 0) return bad("The bolt circle size has to be more than 0.");
  let step;
  if (ext==="full") step = 360 / n;
  else if (ext==="ang") step = val;
  else if (ext==="tot") step = n > 1 ? val / (n-1) : 0;
  else {
    if (val <= 0) return bad("The distance between holes has to be more than 0.");
    if (val > 2*r + 1e-9) return bad(`Holes ${fmtEn(val)} apart can't fit on a ${fmtEn(2*r)} diameter circle. The most is the diameter itself.`);
    step = 2 * Math.asin(Math.min(1, val / (2*r))) * 180 / Math.PI;
  }
  const sgn = $("hc-dir").value==="ccw" ? 1 : -1, pts = [];
  for (let k = 0; k < n; k++){ const a = rad(a0 + sgn*k*step); pts.push([c[0] + r*Math.cos(a), c[1] + r*Math.sin(a)]); }
  const sweep = Math.abs(step) * (n-1);
  const warn = ext!=="full" && n > 1 && sweep >= 360 - 1e-6 ? `The holes go all the way around (${fmtEn(sweep)}° from first to last), so some land on top of each other.` : null;
  const spread = ext==="full" ? `${fmtEn(step)}° apart` : `${fmtEn(Math.abs(step))}° apart, ${fmtEn(sweep)}° first to last`;
  return { pts, center: c, r, warn, sum: `${n} hole${n > 1 ? "s" : ""} on a ${fmtEn(2*r)} ${holes.mm ? "mm" : "in"} circle, ${spread}` };
}

// One row of words per hole. Under G91 each row is the distance from the hole before it.
function rowsFor(pts){
  const s1 = scale(holes.a1), s2 = scale(holes.a2);
  let prev = [holes.pos[0]/s1, holes.pos[1]/s2];
  return pts.map((p, k) => {
    const w = holes.inc ? [(p[0]-prev[0])*s1, (p[1]-prev[1])*s2] : [p[0]*s1, p[1]*s2];
    prev = p;
    const words = [holes.a1 + fmt(w[0]), holes.a2 + fmt(w[1])].sort((a, b) => "XYZ".indexOf(a[0]) - "XYZ".indexOf(b[0]));   // X before Y before Z, as programs are written
    return { skip: k===0 && $("h-skip").checked, words };
  });
}
// N numbers for k new lines after the selected line, counting by N_STEP, or squeezed into the gap before the next N.
function nNumbers(k){
  if (!autoN) return { ns: [] };
  let cur = null, next = null;
  for (let i = holes.li; i >= 0 && cur===null; i--) cur = nOf(doc[i]);
  for (let i = holes.li+1; i < doc.length && next===null; i++) next = nOf(doc[i]);
  const base = cur ?? 0; let step = N_STEP;
  if (next!=null && base + k*step >= next){
    step = Math.floor((next - base) / (k+1));
    if (step < 1) {
      return { ns: [], msg: `There's no room for ${k} N numbers between N${cur} and N${next}, so the new lines have none. Program › Renumber makes room.` };
    }
  }
  return { ns: Array.from({ length:k }, (_, i) => base + (i+1)*step) };
}

function compute(){
  const r = points(); if (r.err) return r;
  const g = [holes.pos[0]/scale(holes.a1), holes.pos[1]/scale(holes.a2)];
  const at1 = Math.hypot(r.pts[0][0]-g[0], r.pts[0][1]-g[1]) < (holes.mm ? 0.0005 : 0.00005);
  if (!skipTouched) $("h-skip").checked = at1;
  r.at1 = at1; r.rows = rowsFor(r.pts);
  return r;
}
function update(){
  if (!holes) return;
  $("h-grid").setAttribute("aria-pressed", kind==="grid"); $("h-circ").setAttribute("aria-pressed", kind==="circ");
  $("h-gridf").hidden = kind!=="grid"; $("h-circf").hidden = kind!=="circ";
  const ext = $("hc-ext").value;
  $("hc-v").disabled = ext==="full";
  $("hc-vl").textContent = ext==="dist" ? "Distance between" : ext==="tot" ? "Total angle" : "Angle between";
  $("hc-vu").textContent = ext==="dist" ? (holes.mm ? "mm, straight line" : "in, straight line") : "°";
  const r = compute(), lineName = nOf(doc[holes.li])!=null ? "N" + nOf(doc[holes.li]) : "line " + (holes.li+1);
  const notes = [];
  const cyc = holes.st.cycleCode, cname = cyc && DIALECT.cycles?.[cyc]?.name;
  notes.push(holes.st.cycle ? `${cyc}${cname ? ` (${cname})` : ""} is active on ${lineName}, so it runs at each new position.`
                        : `<span class="warn">No canned cycle is active on ${lineName}, so these lines are plain ${holes.st.motion || "G00"} moves. To drill them, select the line with the cycle (G81, G83…) first.</span>`);
  if (holes.inc) notes.push("G91 is active, so each line is the distance from the hole before it.");
  if (holes.dia) notes.push("X is written as a diameter, the way this lathe reads it. Distances and the bolt circle size are true lengths.");
  if (r.warn) notes.push(`<span class="warn">${esc(r.warn)}</span>`);
  if (!r.err && $("h-skip").checked && !r.at1) {
    notes.push(`<span class="warn">${lineName} leaves the tool at ${holes.a1}${fmtEn(holes.pos[0])} ${holes.a2}${fmtEn(holes.pos[1])}, not at hole 1, so hole 1 would be missed.</span>`);
  }
  $("h-note").innerHTML = notes.join("<br>");
  $("h-skipl").textContent = r.at1 ? `Skip hole 1, ${lineName} already goes there` : `Skip hole 1 (${lineName} doesn't go there)`;
  if (r.err){
    $("h-msg").innerHTML = `<span class="warn">${esc(r.err)}</span>`;
    $("h-sum").textContent = "";
    $("h-out").textContent = "";
    $("h-ok").disabled = true;
    drawPreview(null);
    return;
  }
  const keep = r.rows.filter(x => !x.skip), nn = nNumbers(keep.length);
  let j = 0;
  $("h-out").innerHTML = r.rows.map((x, k) => {
    const n = x.skip ? "" : (nn.ns[j++] != null ? "N" + nn.ns[j-1] + " " : "");
    const t = esc(`${n}${x.words.join(" ")}`);
    return x.skip ? `<span class="skip">${t}   (hole 1, skipped)</span>` : t;
  }).join("\n");
  $("h-sum").textContent = `${r.sum}. ${keep.length} line${keep.length===1 ? "" : "s"} go in after ${lineName}.`;
  $("h-msg").innerHTML = nn.msg ? `<span class="warn">${esc(nn.msg)}</span>` : "Ctrl+Z takes the whole pattern back out.";
  $("h-ok").disabled = !keep.length;
  drawPreview(r);
}

function drawPreview(r){
  const svg = $("h-svg"), W = 300, Hh = 250, pad = 26;
  if (!r){ svg.innerHTML = `<text x="150" y="128" text-anchor="middle" font-size="12" fill="#aaa">No preview</text>`; return; }
  const g = [holes.pos[0]/scale(holes.a1), holes.pos[1]/scale(holes.a2)];
  const all = [...r.pts, g, [0, 0]];
  if (r.center) all.push([r.center[0]-r.r, r.center[1]-r.r], [r.center[0]+r.r, r.center[1]+r.r]);
  let x0 = Math.min(...all.map(p => p[0])), x1 = Math.max(...all.map(p => p[0])), y0 = Math.min(...all.map(p => p[1])), y1 = Math.max(...all.map(p => p[1]));
  const span = Math.max(x1-x0, y1-y0, 1e-6), k = Math.min((W-2*pad)/(x1-x0 || span), (Hh-2*pad)/(y1-y0 || span));
  const ox = (W - (x1-x0)*k)/2 - x0*k, oy = (Hh + (y1-y0)*k)/2 + y0*k;
  const X = p => (ox + p[0]*k).toFixed(1), Y = p => (oy - p[1]*k).toFixed(1);
  const o = [0, 0], out = [];
  out.push(`<line x1="0" y1="${Y(o)}" x2="${W}" y2="${Y(o)}" stroke="#eee"/><line x1="${X(o)}" y1="0" x2="${X(o)}" y2="${Hh}" stroke="#eee"/>`);
  out.push(`<text x="${+X(o)+4}" y="${+Y(o)-4}" font-size="9.5" fill="#bbb">0,0</text>`);
  if (r.center){
    out.push(`<circle cx="${X(r.center)}" cy="${Y(r.center)}" r="${(r.r*k).toFixed(1)}" fill="none" stroke="#c9d3df" stroke-dasharray="4 3"/>`);
    out.push(`<path d="M${+X(r.center)-5} ${Y(r.center)}h10M${X(r.center)} ${+Y(r.center)-5}v10" stroke="#888"/>`);
  }
  const path = [g, ...r.pts].map((p, i) => (i ? "L" : "M") + X(p) + " " + Y(p)).join("");
  out.push(`<path d="${path}" fill="none" stroke="#e8a33d" stroke-width="1" stroke-dasharray="3 3"/>`);
  const label = r.pts.length <= 40;
  r.rows.forEach((x, i) => {
    const p = r.pts[i];
    out.push(`<circle cx="${X(p)}" cy="${Y(p)}" r="4.5" fill="${x.skip ? "#fff" : "#c03d9a"}" stroke="#c03d9a" stroke-width="1.5"/>`);
    if (label) out.push(`<text x="${+X(p)+6}" y="${+Y(p)-6}" font-size="10" fill="#555">${i+1}</text>`);
  });
  out.push(`<path d="M${X(g)} ${+Y(g)-6}l5 6l-5 6l-5 -6z" fill="#e8a33d"/>`);
  out.push(`<g font-size="10" fill="#777"><path d="M10 238h26M10 238v-26" stroke="#999" fill="none"/><text x="39" y="241">${holes.a1}</text><text x="6" y="208">${holes.a2}</text></g>`);
  out.push(`<g font-size="10" fill="#777"><path d="M196 236l4 5l-4 5l-4 -5z" fill="#e8a33d" transform="translate(0 -5)"/><text x="204" y="240">tool now</text><circle cx="254" cy="236" r="3.5" fill="#c03d9a"/><text x="260" y="240">hole</text></g>`);
  svg.innerHTML = out.join("");
}

function insertHoles(){
  const r = compute(); if (r.err) return;
  const keep = r.rows.filter(x => !x.skip); if (!keep.length) return;
  const nn = nNumbers(keep.length), li = holes.li;
  const rows = keep.map((x, i) => nn.ns[i]!=null ? ["N" + nn.ns[i], ...x.words] : [...x.words]);
  pushUndo();
  doc.splice(li+1, 0, ...rows);
  expanded = new Set([...expanded].map(i => i > li ? i + rows.length : i));
  const where = nOf(doc[li])!=null ? "N" + nOf(doc[li]) : "line " + (li+1), msg = nn.msg;
  closeHoles();
  selectLine(li + rows.length);
  setMsg(msg || `Inserted ${rows.length} hole position${rows.length===1 ? "" : "s"} after ${where}. Ctrl+Z takes them back out.`, !!msg);
}

$("h-grid").onclick = () => { kind = "grid"; update(); };
$("h-circ").onclick = () => { kind = "circ"; update(); };
$("h-skip").onchange = () => { skipTouched = true; update(); };
hdlg.addEventListener("input", e => { if (e.target.id!=="h-skip") update(); });
$("h-ok").onclick = insertHoles;
$("h-cancel").onclick = $("h-x").onclick = closeHoles;
// Keys typed in the dialog stay in the dialog, so Ctrl+Z or arrows don't edit the program underneath.
dialogKeys(hdlg, closeHoles, e => {
  if (e.key==="Enter" && e.target.tagName==="INPUT" && e.target.type!=="checkbox"){
    e.preventDefault();
    insertHoles();
  }
});

window.openHoles = openHoles;
})();
