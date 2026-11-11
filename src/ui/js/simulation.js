/* ---------- Toolpath and simulation: drawing, the Z timeline and playback ---------- */
const KCOL = { rapid:"#e8a33d", feed:"#0f6cbd", arc:"#0e9384", cyc:"#c03d9a", engrave:"#8a939e" };
const TCOL = ["#0f6cbd", "#c03d9a", "#0e9384", "#7a5bc0", "#b35c00", "#3b7d23"];
function toolColor(t){   // the tool list is worked out once per run of the program, not once per move
  if (EXEC.toolList?.segs!==EXEC.segs) EXEC.toolList = { segs:EXEC.segs, tools:[...new Set(EXEC.segs.map(s => s.tool))] };
  return TCOL[Math.max(0, EXEC.toolList.tools.indexOf(t)) % TCOL.length]; }
function stepIndexFor(li){
  const st = EXEC.steps; let k = st.findIndex(s => s.li===li);
  if (k < 0) k = st.findIndex(s => s.li > li);
  return k < 0 ? st.length-1 : k;
}
function drawViews(){
  const lathe = mtype()==="lathe", segs = EXEC.segs, v1 = $("v1");
  if (simX){
    const r = v1.getBoundingClientRect();
    v1.setAttribute("viewBox", `0 0 ${Math.max(120, Math.round(r.width))} ${Math.max(80, Math.round(r.height))}`);
  }
  $("v1h").innerHTML = lathe ? "Toolpath XZ <span>side profile, X as radius</span>" : "Toolpath XY <span>top view</span>";
  const fx = lathe ? (p => p.z) : (p => p.x), fy = lathe ? (p => p.x/2) : (p => p.y);
  // which moves are done, current, or still to come
  let doneTo, curFrom;
  if (simIdx!=null){ doneTo = simIdx; const st = EXEC.steps.find(s => s.s0 <= simIdx-1 && simIdx-1 < s.s1); curFrom = st ? st.s0 : simIdx; }
  else { const st = EXEC.steps[stepIndexFor(curLine)]; curFrom = st ? st.s0 : 0; doneTo = st ? st.s1 : 0; }
  const [ , , width, height] = v1.getAttribute("viewBox").split(" ").map(Number);
  // The view fits the cutting moves: rapids far from the part (a home return to X20. Z20.) would shrink it to a dot,
  // so they're drawn but left out of the fit and run off the edge. Zoom and pan (VIEWWIN) replace the fit.
  const cut = segs.filter(s => !s.rapid);
  const pts = (cut.length ? cut : segs).flatMap(s => [s.a, s.b]);
  // G107: the unrolled cylinder, one rectangle per span, from the origin across X and one turn (π × diameter) up Y.
  // With Q0 the diameter is a machine setting, so the turn's height isn't known: the top is left open.
  const wrapR = lathe ? [] : (EXEC.wraps || []).map(wp => {
    const ss = segs.slice(wp.s0, wp.s1).filter(s => !s.rapid); if (!ss.length) return null;
    const xs = ss.flatMap(s => [s.a.x, s.b.x]), ys = ss.flatMap(s => [s.a.y, s.b.y]), turn = wp.d > 0 ? Math.PI*wp.d : null;
    const down = Math.max(...ys) <= 1e-9 && Math.min(...ys) < 0;
    const ya = turn!=null ? (down ? -turn : 0) : Math.min(0, ...ys), yb = turn!=null ? (down ? 0 : turn) : Math.max(0, ...ys);
    return { ...wp, xa:Math.min(0, ...xs), xb:Math.max(0, ...xs), ya, yb, turn };
  }).filter(Boolean);
  wrapR.forEach(r => { if (r.turn!=null) pts.push({ x:r.xa, y:r.ya, z:0 }, { x:r.xb, y:r.yb, z:0 }); });
  if (!pts.length){   // nothing moves yet (a new program): clear the toolpath, timeline and position
    v1.innerHTML = ""; $("tleg").innerHTML = ""; $("s-pos").textContent = "No moves yet";
    $("tlsvg").innerHTML = $("tlgrid").innerHTML = ""; $("tlnow").textContent = ""; tlSteps = []; return; }
  const win = VIEWWIN && VIEWWIN.doc===doc && VIEWWIN.lathe===lathe ? VIEWWIN : null, pad = win ? 0 : 12;
  let x0, x1, y0, y1;
  if (win) ({ x0, x1, y0, y1 } = win);
  else {
    x0 = minOf(pts, fx); x1 = maxOf(pts, fx); y0 = minOf(pts, fy); y1 = maxOf(pts, fy);
    if (x1-x0 < 1e-6){ x0 -= .5; x1 += .5; } if (y1-y0 < 1e-6){ y0 -= .5; y1 += .5; }
  }
  $("vz-fit").classList.toggle("on", !!win);
  const k = Math.min((width-2*pad)/(x1-x0), (height-2*pad)/(y1-y0));
  const ox = (width - (x1-x0)*k)/2, oy = (height - (y1-y0)*k)/2;
  const toX = v => (ox + (v-x0)*k).toFixed(1), toY = v => (height - oy - (v-y0)*k).toFixed(1);
  VIEWT = { x0, y0, k, ox, oy, W:width, H:height, lathe };
  let svg = "";
  if (lathe && 0 >= y0 && 0 <= y1) {
    svg += `<line x1="4" x2="${width-4}" y1="${toY(0)}" y2="${toY(0)}" stroke="#b9c2cf" stroke-dasharray="2 3" stroke-width=".8"/>`;
  }
  const layers = [[], [], []], band = [];
  // Moves one after another drawn the same way go into one <path>: a long program has tens of thousands of moves,
  // and one <line> each made every redraw (each step of the simulation) slow.
  const runs = [null, null, null];
  const flush = n => {
    const r = runs[n];
    if (r){
      layers[n].push(`<path d="${r.d}" fill="none" stroke="${r.col}" stroke-width="${r.wdt}"${r.dash} stroke-linecap="round" stroke-linejoin="round"/>`);
      runs[n] = null;
    }
  };
  const addLine = (n, x1, y1, x2, y2, col, wdt, dash) => {
    let r = runs[n];
    if (r && (r.col!==col || r.wdt!==wdt || r.dash!==dash || r.parts > 4000)){ flush(n); r = null; }
    if (!r) r = runs[n] = { d:"", col, wdt, dash, end:"", parts:0 };
    r.d += (r.end===x1 + " " + y1 ? "" : "M" + x1 + " " + y1) + "L" + x2 + " " + y2; r.end = x2 + " " + y2; r.parts++;
  };
  segs.forEach((s, i) => {
    // Cutter comp: a grey band beside the move, on the side the tool's centre is on. Its width is fixed on screen,
    // since the cutter's radius is in the offset table, not the program.
    if (s.comp && compBand && !(i >= doneTo && future==="hide")){
      const ax = +toX(fx(s.a)), ay = +toY(fy(s.a)), bx = +toX(fx(s.b)), by = +toY(fy(s.b)), L = Math.hypot(bx - ax, by - ay);
      if (L > 0.01){ const o = (s.comp==="L" ? 1 : -1)*3.5, nx = (by - ay)/L*o, ny = -(bx - ax)/L*o;
        band.push(`<line x1="${(ax+nx).toFixed(1)}" y1="${(ay+ny).toFixed(1)}" x2="${(bx+nx).toFixed(1)}" y2="${(by+ny).toFixed(1)}" stroke="#8a939e" stroke-opacity="${i >= doneTo && future==="grey" ? .14 : .32}" stroke-width="6"/>`); }
    }
    if (Math.abs(fx(s.a)-fx(s.b)) < 1e-6 && Math.abs(fy(s.a)-fy(s.b)) < 1e-6){
      if (s.kind==="cyc") flush(i < doneTo ? 1 : 0);
      if (s.kind==="cyc" && i < doneTo) layers[1].push(`<circle cx="${toX(fx(s.b))}" cy="${toY(fy(s.b))}" r="2.6" fill="none" stroke="${colorBy==="tool" ? toolColor(s.tool) : KCOL.cyc}" stroke-width="1.4"/>`);
      else if (s.kind==="cyc" && future!=="hide") layers[0].push(`<circle cx="${toX(fx(s.b))}" cy="${toY(fy(s.b))}" r="2.6" fill="none" stroke="${future==="grey" ? "#d3d8de" : KCOL.cyc}" stroke-width="1.2"/>`);
      return;
    }
    if (s.rapid && !simRapids) return;
    if (s.sweep) return;   // engraving: drawn as its rectangle
    const state = i >= doneTo ? "future" : i >= curFrom ? "cur" : "done";
    if (state==="future" && future==="hide") return;
    let col = colorBy==="tool" ? toolColor(s.tool) : KCOL[s.kind] || KCOL.feed;
    let wdt = s.rapid ? 0.9 : 1.5, dash = s.rapid ? ' stroke-dasharray="3 3"' : "";
    if (state==="future" && future==="grey"){ col = "#d3d8de"; wdt = s.rapid ? .8 : 1.1; }
    if (state==="cur"){ col = "#d13438"; wdt = 2.4; }
    const ly = state==="future" ? 0 : state==="cur" ? 2 : 1;
    addLine(ly, toX(fx(s.a)), toY(fy(s.a)), toX(fx(s.b)), toY(fy(s.b)), col, wdt, dash);
    // a hole drilled along the view (a lathe's drill or tap on center): a small circle at the bottom
    if (s.hole){
      const hl = state==="future" ? 0 : 1;
      flush(hl);
      layers[hl].push(`<circle cx="${toX(fx(s.b))}" cy="${toY(fy(s.b))}" r="2.6" fill="#fff" stroke="${state==="future" && future==="grey" ? "#d3d8de" : colorBy==="tool" ? toolColor(s.tool) : KCOL.cyc}" stroke-width="1.3"/>`);
    }
  });
  flush(0); flush(1); flush(2);
  const wr = wrapR.map(r => {
    const [a, b, c, d] = [[r.xa, r.ya], [r.xb, r.ya], [r.xb, r.yb], [r.xa, r.yb]].map(([x, y]) => [toX(x), toY(y)]);
    const lab = r.turn!=null ? `Unrolled (G107): Ø${fmt4(r.d)}, one turn ${fmt4(r.turn)}` : `Unrolled (G107): diameter unknown (Q0: ${DIALECT.cylMap?.setting || "a setting"})`;
    const sides = r.turn!=null ? `<polygon points="${[a, b, c, d].map(q => q.join(",")).join(" ")}" fill="#eef1f5" stroke="#8a939e" stroke-width="1" stroke-dasharray="5 3"/>`
      : `<path d="M${d.join(",")} L${a.join(",")} L${b.join(",")} L${c.join(",")}" fill="none" stroke="#8a939e" stroke-width="1" stroke-dasharray="5 3"/>`;
    return `<g><title>${esc(lab + ". Y is the distance round the part; the A axis turns it.")}</title>${sides}<text x="${(+a[0] + 4).toFixed(1)}" y="${(+a[1] - 5).toFixed(1)}" font-size="10" fill="#5b6470" font-family="Segoe UI,sans-serif">${esc(lab)}</text></g>`;
  }).join("");
  // The parts of the moves out to a sharp corner that a ,C or ,R cuts off: grey and dashed, under the path
  const gh = (EXEC.ghosts || []).map(s => `<line x1="${toX(fx(s.a))}" y1="${toY(fy(s.a))}" x2="${toX(fx(s.b))}" y2="${toY(fy(s.b))}" stroke="#a9b1bc" stroke-width="1" stroke-dasharray="3 2" stroke-linecap="round"/>`).join("");
  // Engraving: one grey rectangle per G47 line (the letters aren't drawn), cut on the left, top and bottom. Its right end
  // is an estimate, so it fades out, unless the next line's start sets it. Cut: darker; to come: lighter; current: red edges.
  const bx = (EXEC.boxes || []).map((b, n) => {
    const state = b.s0 >= doneTo ? "future" : b.s0 >= curFrom ? "cur" : "done";
    if (state==="future" && future==="hide") return "";
    const fill = state==="future" ? (future==="grey" ? "#e6e9ed" : "#d3d8de") : "#b4bcc6";
    const edge = state==="cur" ? "#d13438" : state==="future" && future==="grey" ? "#d3d8de" : KCOL.engrave;
    const sp = b.pts.map(q => [toX(fx(q)), toY(fy(q))]), mid = (a, c) => [((+a[0] + +c[0])/2).toFixed(1), ((+a[1] + +c[1])/2).toFixed(1)];
    const [lx, ly] = mid(sp[0], sp[3]), [rx, ry] = mid(sp[1], sp[2]);
    const grad = b.exact ? "" : `<linearGradient id="eg${n}" gradientUnits="userSpaceOnUse" x1="${lx}" y1="${ly}" x2="${rx}" y2="${ry}"><stop offset=".6" stop-color="${fill}"/><stop offset="1" stop-color="${fill}" stop-opacity="0"/></linearGradient>`;
    const tip = (b.tip || `Engraving: ${b.text}` + (b.exact ? " (ends where the serial number starts)" : " (length estimated: the control doesn't give letter widths)"))
      + (b.tool ? `. The tool centre follows J ${fmt4(b.h)}; with a ${fmt4(b.tool)} tool the letters come out about ${fmt4(b.h + b.tool)} tall (the lighter edge)` : ". J is the tool centre's path: the letters come out taller by the tool's diameter, which the tool line's comment doesn't give");
    const outer = b.outer ? `<polygon points="${b.outer.map(q => [toX(fx(q)), toY(fy(q))].join(",")).join(" ")}" fill="${b.exact ? fill : `url(#eg${n})`}" fill-opacity=".35"/>` : "";
    return `<g>${grad}<title>${esc(tip)}</title>${outer}<polygon points="${sp.map(q => q.join(",")).join(" ")}" fill="${b.exact ? fill : `url(#eg${n})`}" fill-opacity=".8"/>`
      + `<path d="M${sp[1].join(",")} L${sp[0].join(",")} L${sp[3].join(",")} L${sp[2].join(",")}" fill="none" stroke="${edge}" stroke-width="${state==="cur" ? 1.8 : 1.1}" stroke-linejoin="round"/></g>`;
  }).join("");
  svg += wr + band.join("") + gh + bx + layers.flat().join("");
  let at = segs[Math.max(0, Math.min(doneTo, segs.length) - 1)];
  // Playing in time: the move under way is drawn as far as the tool has got along it
  const part = simIdx!=null && simPart && simPart.i===doneTo && doneTo < segs.length && simPart.f > 0 ? segs[doneTo] : null;
  if (part){
    const f = simPart.f, q = { x:part.a.x + (part.b.x - part.a.x)*f, y:(part.a.y || 0) + ((part.b.y || 0) - (part.a.y || 0))*f, z:part.a.z + (part.b.z - part.a.z)*f };
    if (!part.sweep && (!part.rapid || simRapids) && (Math.abs(fx(part.a)-fx(q)) > 1e-9 || Math.abs(fy(part.a)-fy(q)) > 1e-9))
      svg += `<line x1="${toX(fx(part.a))}" y1="${toY(fy(part.a))}" x2="${toX(fx(q))}" y2="${toY(fy(q))}" stroke="#d13438" stroke-width="2.4" stroke-linecap="round"${part.rapid ? ' stroke-dasharray="3 3"' : ""}/>`;
    at = { ...part, b:q };
  }
  // Lathe tailstock, when the program uses it: a center pointing at the part, with ← (in), → (out) or ? (not set yet).
  if (lathe && EXEC.tailUsed){
    const tk = simIdx!=null && simK!=null ? simK : stepIndexFor(curLine), ts = EXEC.steps[tk]?.tail || null;
    const cy = Math.min(height - 16, Math.max(16, +toY(0))), x1 = width - 6, x0 = x1 - 26;
    const sym = ts==="in" ? `<path d="M${x1-6} ${cy} h-12 m5 -5 l-5 5 l5 5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
      : ts==="out" ? `<path d="M${x1-18} ${cy} h12 m-5 -5 l5 5 l-5 5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<text x="${x1-11}" y="${cy+4}" font-size="12" font-weight="700" text-anchor="middle" fill="#fff" font-family="Segoe UI,sans-serif">?</text>`;
    svg += `<g class="tailst"><title>Tailstock ${ts==="in" ? "in (advanced)" : ts==="out" ? "out (retracted)" : "not set yet: no tailstock code has run"}</title><path d="M${x0} ${cy} L${x1} ${cy-15} L${x1} ${cy+15} Z" fill="#1f2328" stroke="#1f2328" stroke-width="3" stroke-linejoin="round"/>${sym}</g>`;
  }
  if (at && (doneTo > 0 || part) && at.sweep){   // engraving and threading: the tool is a line across the box, sweeping along it
    const qx = fx(at.b), qy = fy(at.b), tx = qx + at.sweep.ux*at.sweep.h, ty = qy + at.sweep.uy*at.sweep.h;
    svg += `<line x1="${toX(qx)}" y1="${toY(qy)}" x2="${toX(tx)}" y2="${toY(ty)}" stroke="#d13438" stroke-width="3" stroke-linecap="round"/>`;
  }
  else if (at && (doneTo > 0 || part)) svg += `<circle cx="${toX(fx(at.b))}" cy="${toY(fy(at.b))}" r="4.5" fill="${colorBy==="tool" ? toolColor(at.tool) : "#d13438"}" stroke="#fff" stroke-width="1.5"/>`;
  // An alarm (a code for an option the machine doesn't have): the machine stops there, so the simulation ends on a red ✕
  if (alarmReached()){
    const q = EXEC.alarm.at, cx = +toX(fx(q)), cy = +toY(fy(q)), r = 7;
    svg += `<g><title>${esc("Alarm: " + EXEC.alarm.text)}</title><path d="M${cx-r} ${cy-r} L${cx+r} ${cy+r} M${cx+r} ${cy-r} L${cx-r} ${cy+r}" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M${cx-r} ${cy-r} L${cx+r} ${cy+r} M${cx+r} ${cy-r} L${cx-r} ${cy+r}" stroke="#d13438" stroke-width="3.2" stroke-linecap="round"/></g>`;
  }
  v1.innerHTML = svg;
  const tools = [...new Set(segs.map(s => s.tool))];
  $("tleg").innerHTML = colorBy==="tool"
    ? tools.map(t => `<span><i style="background:${toolColor(t)}"></i>${t}</span>`).join("") + `<span style="margin-left:auto;color:#888">${future==="grey"?"later moves greyed":future==="hide"?"later moves hidden":"all moves shown"}</span>`
    : (simRapids ? `<span><i style="background:${KCOL.rapid}"></i>Rapid</span>` : "") + `<span><i style="background:${KCOL.feed}"></i>Feed</span><span><i style="background:${KCOL.arc}"></i>Arc</span><span><i style="background:${KCOL.cyc}"></i>Cycle</span>${EXEC.boxes?.length ? `<span><i style="background:#b4bcc6"></i>Engraving</span>` : ""}${compBand && segs.some(s => s.comp) ? `<span><i style="background:rgba(138,147,158,.45);height:6px"></i>Cutter comp side</span>` : ""}<span style="margin-left:auto;color:#888">${future==="grey"?"later moves greyed":future==="hide"?"later moves hidden":"all moves shown"}</span>`;
  drawSimPos(doneTo > 0 || part ? at : null, lathe);
  // Only when it changes: WebKitGTK (Linux) drops a click whose text was replaced between the press and the release,
  // and this runs on every step of the simulation, so ⏸ couldn't be clicked while playing.
  const pb = $("s-play"), pt = simTimer ? "⏸" : "▶"; if (pb.textContent!==pt) pb.textContent = pt;
  $("s-play").classList.toggle("on", !!simTimer);
  drawTimeline(EXEC.steps, lathe);
}

/* Toolpath zoom and pan. VIEWWIN is the part of the drawing shown (in program units), or null to fit the cutting
   moves. It belongs to the program it was set on, so another tab or a newly opened file starts fitted.
   Drag pans, the wheel zooms about the pointer, Shift+drag (or ⬚ then drag) zooms to a box, double-click fits. */
function viewVisible(){   // the whole drawing area in program units
  const t = VIEWT; if (!t) return null;
  const wx = sx => t.x0 + (sx - t.ox)/t.k, wy = sy => t.y0 + (t.H - t.oy - sy)/t.k;
  return { x0:wx(0), x1:wx(t.W), y0:wy(t.H), y1:wy(0) };
}
function setViewWin(w){ VIEWWIN = w ? { ...w, doc, lathe:VIEWT?.lathe } : null; drawViews(); }
function zoomView(f, at){   // f > 1 zooms in, about the point "at" (program units) or the middle
  const v = viewVisible(); if (!v) return;
  const cx = at ? at.x : (v.x0+v.x1)/2, cy = at ? at.y : (v.y0+v.y1)/2;
  const span = Math.max(v.x1-v.x0, v.y1-v.y0)/f; if (span < 1e-4 || span > 1e5) return;
  setViewWin({ x0:cx - (cx-v.x0)/f, x1:cx + (v.x1-cx)/f, y0:cy - (cy-v.y0)/f, y1:cy + (v.y1-cy)/f });
}
function setBoxMode(on){
  boxMode = on;
  $("vz-box").setAttribute("aria-pressed", on);
  $("vbox").classList.toggle("boxing", on);
}
{
  const v1 = $("v1");
  const svgPt = e => {
    const m = v1.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { sx:p.x, sy:p.y };
  };
  const world = q => { const t = VIEWT; return { x: t.x0 + (q.sx - t.ox)/t.k, y: t.y0 + (t.H - t.oy - q.sy)/t.k }; };
  let drag = null;
  v1.addEventListener("wheel", e => {
    if (!VIEWT) return; e.preventDefault();
    const q = svgPt(e); if (q) zoomView(e.deltaY < 0 ? 1.25 : 0.8, world(q));
  }, { passive:false });
  v1.addEventListener("pointerdown", e => {
    if (e.button!==0 || !VIEWT) return;
    const q = svgPt(e); if (!q) return;
    e.preventDefault(); v1.setPointerCapture(e.pointerId);
    drag = { box: boxMode || e.shiftKey, q0:q, v0:viewVisible(), t0:{ ...VIEWT }, moved:false };
    if (!drag.box) v1.classList.add("panning");
  });
  v1.addEventListener("pointermove", e => {
    if (!drag) return;
    const q = svgPt(e); if (!q) return;
    const dx = q.sx - drag.q0.sx, dy = q.sy - drag.q0.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    if (drag.box){
      let r = v1.querySelector("rect.zbox");
      if (!r){
        r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        r.setAttribute("class", "zbox");
        r.setAttribute("fill", "rgba(15,108,189,.08)");
        r.setAttribute("stroke", "#0f6cbd");
        r.setAttribute("stroke-dasharray", "3 2");
        v1.appendChild(r);
      }
      r.setAttribute("x", Math.min(q.sx, drag.q0.sx)); r.setAttribute("y", Math.min(q.sy, drag.q0.sy));
      r.setAttribute("width", Math.abs(dx)); r.setAttribute("height", Math.abs(dy));
    } else {
      const k = drag.t0.k, v = drag.v0;
      VIEWWIN = { x0:v.x0 - dx/k, x1:v.x1 - dx/k, y0:v.y0 + dy/k, y1:v.y1 + dy/k, doc, lathe:drag.t0.lathe };
      drawViews();
    }
  });
  const end = e => {
    if (!drag) return;
    const d = drag; drag = null; v1.classList.remove("panning");
    if (d.box){
      v1.querySelector("rect.zbox")?.remove();
      const q = svgPt(e);
      if (d.moved && q && Math.abs(q.sx - d.q0.sx) > 4 && Math.abs(q.sy - d.q0.sy) > 4){
        const a = world(d.q0), b = world(q);
        setViewWin({ x0:Math.min(a.x, b.x), x1:Math.max(a.x, b.x), y0:Math.min(a.y, b.y), y1:Math.max(a.y, b.y) });
      }
      setBoxMode(false);
    }
  };
  v1.addEventListener("pointerup", end);
  v1.addEventListener("pointercancel", end);
  v1.addEventListener("dblclick", () => setViewWin(null));
  $("vz-in").onclick = () => zoomView(1.5);
  $("vz-out").onclick = () => zoomView(1/1.5);
  $("vz-box").onclick = () => setBoxMode(!boxMode);
  $("vz-fit").onclick = () => setViewWin(null);
}
// The line between the simulation buttons and the toolpath: where the tool is, the line and its N number,
// and the stop the simulation is paused at.
// Whether the line shown (or simulated) has reached an alarm line
function alarmReached(){
  const A = EXEC.alarm; if (!A) return false;
  const k = simIdx!=null && simK!=null ? simK : stepIndexFor(curLine);
  return k >= A.k || (simIdx==null && curLine > EXEC.steps[A.k]?.li);
}
function drawSimPos(at, lathe){
  const d = (lineState[curLine]?.units==="mm") ? 3 : 4, f = v => v==null ? "—" : (v < 0 ? "-" : "") + Math.abs(v).toFixed(d);
  const p = at?.b, n = nWordOf(curLine), stop = simStopAt!=null ? EXEC.steps[simStopAt]?.stop : null;
  const ax = lathe ? [["X", p?.x], ["Z", p?.z]] : [["X", p?.x], ["Y", p?.y]];
  $("s-pos").innerHTML = ax.map(([a, v]) => `<span><b>${a}</b>${f(v)}</span>`).join("")
    + `<span><b>Line</b>${curLine+1}</span>` + (n ? `<span><b>N</b>${n.slice(1)}</span>` : "")
    + simTimeSpan()
    + (stop ? `<span class="stop" title="${stop==="M00" ? "Program stop" : "Optional stop"}. ▶ continues.">${stop}</span>` : "")
    + (() => {
      const k = simIdx!=null && simK!=null ? simK : stepIndexFor(curLine), nt = (EXEC.notes || []).find(x => k >= x.k && (x.until==null || k < x.until));
      return nt && !alarmReached() ? `<span class="snote" title="${esc(nt.text)}.">${esc(nt.short || nt.text)}</span>` : "";
    })()
    + (alarmReached() ? `<span class="alarm" title="${esc(EXEC.alarm.text)} The lines after it don't run.">${EXEC.alarm.nest ? `Alarm${EXEC.alarm.code ? " " + esc(EXEC.alarm.code.split(" ")[0]) : ""}: calls nested too deep` : `Alarm: ${esc(EXEC.alarm.code)} ${esc((EXEC.alarm.label || "").toLowerCase())} not on this machine`}</span>` : "");
}
let tlSteps = [], tlShift = 0; const SLOT = 18;
/* What the timeline plots, per machine type (RULES.machineTypes[type].timeline, the first is the default):
   z (Z on a mill, or x: the X radius on a lathe), feed (the feed rate) and speed (the spindle speed while it
   turns). A machine with a process (a plasma torch) also gets a band where the torch is on, and a mark on
   lines that change the process or material: plasma power is set on the power supply, not in the program. */
const TL_MODES = { z:"Z by line", x:"X radius by line", feed:"Feed rate by line", speed:"Spindle speed by line" };
const tlMode = {};   // the chosen value per machine type, kept in settings.json
window.loadTimelineModes = m => { Object.assign(tlMode, m); if (EXEC?.steps?.length) drawTimeline(EXEC.steps, mtype()==="lathe"); };
const tlModes = () => RULES.machineTypes?.[mtype()]?.timeline || [mtype()==="lathe" ? "x" : "z"];
const tlModeNow = () => { const ms = tlModes(); return ms.includes(tlMode[mtype()]) ? tlMode[mtype()] : ms[0]; };
function timelineValues(li, toks){
  const st = lineState[li] || {}, P = DIALECT.process;
  const num = w => w ? parseFloat(String(w).slice(1)) || 0 : 0;
  return { f: num(st.F), s: ["M03","M04"].includes(st.spinDir) ? num(st.S) : 0,
    on: !!P?.on?.includes(st.torch), mark: (P?.changes || []).find(c => toks.some(t => isCode(t, c))) || null };
}
/* Mill Z-by-line symbols. Each line has a column; a line that makes several moves (a drilling cycle) draws its moves
   down on the left of the column and its moves up on the right, as one line. Lines are straight, and a circle sits
   centered on the point it marks. Rapids are dashed. The kinds of line each get a mark:
   drill (G81) plunge and return, to the start height (G98) or R (G99); G82 a circle on the bottom (dwell);
   G83 a loop per peck (full retract to R); G73 a tick per peck (chip break); G84/G74 tap: feeds back out, ↻ at the
   bottom (the spindle reverses); G85/G89 bore: feeds out (G89 dwells); G86 a diamond at the bottom (spindle stops),
   rapid out; G76 a step off the wall at the bottom; a ramp (X or Y with Z) a slanted line; a helix a slanted line
   with a flat loop per circuit; G04 a circle; M00 a filled square, M01 an empty one; M06 the new tool's number;
   G28 / G53 Z an arrow to the top; M05 a small diamond; M30 / M02 end bars; a "/" line is hatched. */
const TL_HOLE = { G73:"Peck drilling, chip break", G74:"Tapping, left hand", G76:"Fine boring", G81:"Drilling", G82:"Drilling with a dwell at the bottom",
  G83:"Peck drilling, full retract", G84:"Tapping", G85:"Boring, feed out", G86:"Boring, spindle stops at the bottom", G89:"Boring with a dwell, feed out" };
function tlHole(a, b, Y, h, clip){
  const colors = KCOL;
  const w = b - a;
  const xl = a + w*0.28;
  const xr = a + w*0.72;
  const yt = Y(Math.min(h.top, clip));
  const yr = Y(Math.min(h.r, clip));
  const yz = Y(h.z);
  const yb = Y(Math.min(h.back, clip));
  const L = (x1, y1, x2, y2, col, wd, dash) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="${wd}" stroke-linecap="round"${dash ? ' stroke-dasharray="3 2"' : ""}/>`;
  const cyc = h.cyc, feedOut = ["G84", "G74", "G85", "G89"].includes(cyc);
  let g = L(a, yt, xl, yt, colors.rapid, 1.2, 1);
  if (yr > yt + 0.5) g += L(xl, yt, xl, yr, colors.rapid, 1.4, 1);
  g += L(xl, yr, xl, yz, colors.cyc, 1.6) + L(xl, yz, xr, yz, colors.cyc, 1.6);
  if ((cyc==="G83" || cyc==="G73") && h.q > 0){
    const depths = []; for (let d = h.r - h.q; d > h.z + 1e-6 && depths.length < 40; d -= h.q) depths.push(d);
    const lw = (xr - xl)*0.62;
    // The retract amounts are machine settings (h.ret): the moves they set get a wide grey band, as their height is uncertain.
    // G73 backs off h.ret after each peck; G83 rapids back down to h.ret above the last peck.
    const ub = (x, ya, yb) => {
      const y0 = Math.min(ya, yb) - 2.5, y1 = Math.max(ya, yb) + 2.5;
      return `<rect x="${(x-3.5).toFixed(1)}" y="${y0.toFixed(1)}" width="7" height="${(y1-y0).toFixed(1)}" rx="2" fill="#8a939e" fill-opacity=".45"/>`;
    };
    if (h.ret > 0){
      if (cyc==="G73") depths.forEach(d => { g += ub(xl + (xr-xl)*0.8, Y(d), Y(d + h.ret)); });
      else depths.forEach(d => { g += ub(xl + lw, Y(d), Y(d + h.ret)); });
    }
    if (cyc==="G83"){
      let y0 = yr;
      [...depths, h.z].forEach(d => {
        const y1 = Y(d);
        g += `<path d="M${xl.toFixed(1)},${y0.toFixed(1)} H${(xl+lw).toFixed(1)} V${y1.toFixed(1)} H${xl.toFixed(1)}" fill="none" stroke="${colors.cyc}" stroke-width="1"/>`;
        y0 = y1;
      });
    }
    else depths.forEach(d => {
      g += L(xl, Y(d), xl + (xr-xl)*0.8, Y(d), colors.cyc, 1) + (h.ret > 0 ? L(xl + (xr-xl)*0.8, Y(d), xl + (xr-xl)*0.8, Y(d + h.ret), colors.cyc, 1) : "");
    });
  }
  if (cyc==="G82" || cyc==="G89") {
    g += `<circle cx="${((xl+xr)/2).toFixed(1)}" cy="${yz.toFixed(1)}" r="2.6" fill="#fff" stroke="${colors.cyc}" stroke-width="1.1"/>`;
  }
  if (cyc==="G84" || cyc==="G74"){
    const cx = (xl+xr)/2, cy = yz - 3.6;
    g += `<path d="M${(cx-2.4).toFixed(1)},${(cy+1.2).toFixed(1)} A2.4 2.4 0 1 1 ${(cx+2.4).toFixed(1)},${(cy+1.2).toFixed(1)}" fill="none" stroke="${colors.cyc}" stroke-width="1"/>`;
  }
  if (feedOut){ g += L(xr, yz, xr, yr, colors.cyc, 1.6); if (yb < yr - 0.5) g += L(xr, yr, xr, yb, colors.rapid, 1.4, 1); }
  else if (cyc==="G86"){
    g += `<rect x="${(xr-2.6).toFixed(1)}" y="${(yz-2.6).toFixed(1)}" width="5.2" height="5.2" fill="#2b2f36" transform="rotate(45 ${xr.toFixed(1)} ${yz.toFixed(1)})"/>` + L(xr, yz-3, xr, yb, colors.rapid, 1.4, 1);
  }
  else if (cyc==="G76"){
    const sh = Math.min(3, (b - xr)*0.7);
    return g + L(xr, yz, xr+sh, yz, "#2b2f36", 1.6) + L(xr+sh, yz, xr+sh, yb, colors.rapid, 1.4, 1) + L(xr+sh, yb, b, yb, colors.rapid, 1.2, 1);
  }
  else g += L(xr, yz, xr, yb, colors.rapid, 1.4, 1);
  return g + L(xr, yb, b, yb, colors.rapid, 1.2, 1);
}
// What a line's mark is on the mill timeline, and its tooltip: null for a plain line.
function tlMark(s){
  const t = doc[s.li] || [], has = c => t.some(w => isCode(w, c)), sg = EXEC.segs.slice(s.s0, s.s1);
  if (s.stop) return [s.stop, s.stop==="M00" ? "Program stop (M00)" : "Optional stop (M01)"];
  if (has("G04")) return ["dwell", "Dwell (G04)"];
  if (has("M06")) return ["tool", "Tool change (M06)"];
  if (has("G28") || (has("G53") && t.some(w => /^Z/.test(w)))) return ["home", "Z to machine home"];
  if (isEnd(t)) return ["end", "Program end"];
  if (has("M05")) return ["spindle", "Spindle stop (M05)"];
  const dz = sg.some(q => Math.abs(q.a.z - q.b.z) > 1e-6), dxy = sg.some(q => Math.hypot(q.a.x - q.b.x, q.a.y - q.b.y) > 1e-6);
  if (s.engZ!=null){ const b = (EXEC.boxes || []).find(b => b.s0 >= s.s0 && b.s0 < s.s1);
    return ["engrave", `Engraving (${DIALECT.engrave?.code || "G47"})${b ? ": " + b.text : ""}, to Z ${s.engZ.toFixed(4)}`]; }
  if (s.kind==="arc" && dz && s.turns > 0.25) return ["helix", "Helix: " + (Math.round(s.turns*10)/10) + " turns"];
  if (s.kind==="feed" && dz && dxy) return ["ramp", "Ramp: X or Y with Z"];
  return null;
}
// The red dot on the timeline: where the tool is. While simulating it follows the moves done so far (down the left of a
// drilling column, along the bottom, up the right); otherwise it sits where the selected line leaves the tool.
function tlDot(steps, idx, sim, X, Y, mode, lathe, CLIP, vals, ends){
  const s = steps[idx]; if (!s) return "";
  const n = s.s1 - s.s0, done = sim ? Math.max(s.s0, Math.min(simIdx, s.s1)) : s.s1, k = done - s.s0, x0 = X(idx);
  const pos = mode==="z" || mode==="x", seg = k > 0 ? EXEC.segs[done-1] : null;
  const val = q => Math.min(lathe ? q.x/2 : q.z, CLIP);
  let x, y;
  if (!n){ x = x0 + SLOT/2; y = Y(vals[idx]); }
  else if (!seg){ x = x0; y = Y(pos ? (ends[idx-1] ?? vals[idx]) : vals[idx]); }
  else {
    y = pos ? Y(val(seg.b)) : Y(vals[idx]);
    const dips = s.dips || [];
    if (mode==="z" && !lathe && dips.length && dips.length <= 3){
      const sg = EXEC.segs.slice(s.s0, done), c = sg.filter(q => q.kind==="cyc").length;
      const up = seg.b.z > seg.a.z + 1e-9, down = seg.b.z < seg.a.z - 1e-9;
      const h = Math.min(dips.length - 1, Math.max(0, seg.kind==="cyc" || up ? c - 1 : c)), w = SLOT/dips.length, a = x0 + w*h;
      x = seg.kind==="cyc" ? a + w*0.5 : up ? a + w*0.72 : a + w*0.28;
      if (!down && !up && seg.kind!=="cyc") y = Y(Math.min(dips[h].top, CLIP));
    } else x = x0 + SLOT*k/n;
    if (k===n) x = x0 + SLOT - 2;   // the line is done: at its end, still in its column
  }
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="#d13438" stroke="#fff" stroke-width="1.2"><title>Where the tool is</title></circle>`;
}
/* Scale lines across the Z (or X) timeline, in powers of ten: the finest that are still at least 3.5 px apart are drawn
   light, and every tenth one (the next power of ten up) darker, with its value at the left edge. So a part 1.2 deep shows
   0" and -1" with the tenths between; 11 deep shows 0" and -10" with the inches between, and no tenths. When the darker
   lines leave only one in view, the light ones are labeled too. On a lathe the values are diameters (X), CL at zero. */
function tlGrid(lo, hi, Y, ph, lathe, idx, W){
  const st = EXEC.steps[idx], mm = (st && lineState[st.li]?.units)==="mm", f = lathe ? 2 : 1;   // f: value shown per value plotted
  const a = lo*f, b = hi*f, pxu = ph/((b - a) || 1);
  let minor = mm ? 0.1 : 0.01;
  while (minor*pxu < 3.5 && minor < 1e6) minor *= 10;
  const major = minor*10, on = (v, d) => Math.abs(v/d - Math.round(v/d)) < 1e-6;
  const ticks = []; for (let n = Math.ceil(a/minor - 1e-9); n*minor <= b + 1e-9; n++) ticks.push(n*minor);
  const majors = ticks.filter(v => on(v, major)), labelMinor = majors.length < 2 && minor*pxu >= 10;
  const dec = v => Math.max(0, -Math.floor(Math.log10(v) + 1e-9));
  const txt = (v, d) => Math.abs(v) < 1e-9 ? (lathe ? "CL" : mm ? "0 mm" : '0"') : (lathe ? "Ø" : "") + v.toFixed(dec(d)) + (mm ? " mm" : '"');
  let lines = "", labels = "";
  ticks.forEach(v => {
    const big = on(v, major), y = (+Y(v/f)).toFixed(1);
    const zero = Math.abs(v) < 1e-9;
    lines += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="${big ? "#b9c3cf" : "#dbe1e8"}" stroke-width="1"/>`;
    // The origin: a circle with a cross through it, on the zero line at the left edge
    if (zero) {
      labels += `<g><title>${lathe ? "Centerline (X0)" : "Part zero (Z0)"}</title><circle cx="7" cy="${y}" r="4" fill="#fff" stroke="#3b4350" stroke-width="1.1"/><path d="M1.5 ${y} H12.5 M7 ${(+y - 5.5).toFixed(1)} V${(+y + 5.5).toFixed(1)}" stroke="#3b4350" stroke-width="1.1"/></g>`;
    }
    if (big || labelMinor) {
      labels += `<text x="${zero ? 15 : 3}" y="${(+y - 2).toFixed(1)}" font-size="${big ? 7.5 : 6.5}" fill="${big ? "#5b6470" : "#8f97a1"}" font-family="Consolas,monospace" stroke="#fff" stroke-width="2.5" paint-order="stroke">${txt(v, big ? major : minor)}</text>`;
    }
  });
  return { lines, labels };
}
function drawTimeline(steps, lathe){
  tlSteps = steps;
  const box = $("tl"), svg = $("tlsvg"), sel = $("tl-mode");
  const mode = tlModeNow(), modes = tlModes(), processDef = DIALECT.process?.on?.length ? DIALECT.process : null;
  // Rebuilt only when the machine type's list changes, so a redraw while the list is open doesn't undo a pick.
  if (sel.dataset.modes!==modes.join()){
    sel.innerHTML = modes.map(m => `<option value="${m}">${TL_MODES[m]}</option>`).join("");
    sel.dataset.modes = modes.join();
  }
  if (document.activeElement!==sel) sel.value = mode;
  sel.hidden = modes.length < 2;
  const BW = box.clientWidth || 278, height = 104, top = processDef ? 18 : 12, bot = 20, half = BW/2;
  const W = steps.length*SLOT + BW;
  svg.setAttribute("width", W); svg.setAttribute("viewBox", `0 0 ${W} ${height}`);
  const pos = mode==="z" || mode==="x";
  // Values above CLIP are drawn at CLIP with a ↑: on a mill, Z more than 0.3 above Z0; on a lathe, X beyond the cutting
  // moves (a rapid to a tool change position far from the part would squash the cutting into a flat line near CL).
  let CLIP = 0.3;
  if (lathe && pos){
    const cv = steps.filter(s => s.kind && s.kind!=="rapid").map(s => s.v), all = cv.length ? cv : steps.map(s => s.v);
    const a = Math.min(0, minOf(all)), b = Math.max(maxOf(all), 0.05);
    CLIP = b + Math.max((b - a)*0.2, 0.025);
  }
  const vals = steps.map(s => mode==="feed" ? s.f : mode==="speed" ? s.s : Math.min(s.v, CLIP));
  const dipZ = mode==="z" && !lathe ? steps.flatMap(s => [...(s.dips || []).map(d => d.z), ...(s.engZ!=null ? [s.engZ] : [])]) : [];
  const lo = pos ? Math.min(minOf(vals), minOf(dipZ), 0) : 0, hi = pos ? Math.max(maxOf(vals), lathe ? 0.1 : 0.05) : Math.max(maxOf(vals), 1) * 1.1;
  const toY = v => top + (hi - v) / (hi - lo || 1) * (height - top - bot);
  const toX = i => half + i*SLOT;
  // While simulating, the step being run; otherwise the first run of the selected line (its other runs are tinted too).
  const sim = simIdx!=null && simK!=null, idx = sim ? simK : stepIndexFor(curLine);
  const isCur = (s, i) => sim ? i===idx : s.li===curLine;
  // Only the steps around the current one are drawn: the box shows about BW/SLOT of them, and a long program's
  // thousands of others would only make the drawing slow (the box is redrawn whenever the line changes).
  const span = Math.ceil(BW/SLOT) + 8, lo0 = Math.max(0, idx - span), hi0 = Math.min(steps.length, idx + span + 1);
  const near = (s, i) => i >= lo0 && i < hi0;
  let g = `<defs><pattern id="tlbd" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#d8dde4" stroke-width="1.4"/></pattern></defs>`;
  steps.forEach((s, i) => { if (near(s, i) && isCur(s, i)) g += `<rect x="${toX(i)}" y="0" width="${SLOT}" height="${height-bot+4}" fill="#fde7e8"/>`; });
  const grid = pos ? tlGrid(lo, hi, toY, height - top - bot, lathe, idx, W) : { lines:"", labels:"" };
  g += grid.lines;
  g += `<line x1="${half-8}" x2="${W-half+8}" y1="${toY(0)}" y2="${toY(0)}" stroke="#b9c2cf" stroke-dasharray="2 3" stroke-width=".8"/>`;
  if (processDef){   // the torch band along the top, and the lines that change the process or material
    g += `<rect x="${half-8}" y="3" width="${steps.length*SLOT+16}" height="6" rx="2" fill="#eef0f3"/>`;
    steps.forEach((s, i) => {
      if (!near(s, i)) return;
      if (s.on) g += `<rect x="${toX(i)}" y="3" width="${SLOT}" height="6" fill="#e8590c"/>`;
      if (s.mark) {
        g += `<line x1="${toX(i)+1}" x2="${toX(i)+1}" y1="1" y2="${height-bot}" stroke="#7a5bc0" stroke-width="1" stroke-dasharray="1.5 2"/><text x="${toX(i)+3}" y="${top+6}" font-size="6.5" fill="#7a5bc0" font-family="Consolas,monospace">${s.mark}</text>`;
      }
    });
  }
  const sym = mode==="z" && !lathe, ends = [];
  const endOf = (s, i) => sym && s.dips?.length && s.dips.length <= 3 ? Math.min(s.dips[s.dips.length-1].back, CLIP) : vals[i];
  let prev = lo0 > 0 ? endOf(steps[lo0-1], lo0-1) : null;
  if (lo0 > 0) ends[lo0-1] = prev;
  steps.forEach((step, i) => {
    if (!near(step, i)) return;
    const value = vals[i], col = step.kind ? KCOL[step.kind] : "#a9b1bc", dash = step.kind==="rapid" ? ' stroke-dasharray="3 2"' : "";
    const x0 = toX(i), xm = x0 + SLOT/2, yv = toY(value), dips = step.dips || [];
    const mk = sym && !dips.length ? tlMark(step) : null, mark = mk?.[0];
    let tip = mk?.[1] || "";
    g += "<g>";
    if (sym && isBlockDel(doc[step.li] || [])){
      g += `<rect x="${x0}" y="1" width="${SLOT}" height="${height-bot-1}" fill="url(#tlbd)"/>`;
      tip = "Block delete: skipped when / is on";
    }
    if (sym && dips.length && dips.length <= 3){
      // A drilling cycle's holes, each in its share of the column: in at the start height, down on the left, up on the right
      const yt = toY(Math.min(dips[0].top, CLIP));
      if (prev!==null && Math.abs(toY(prev) - yt) > 0.5) {
        g += `<line x1="${x0}" x2="${x0}" y1="${toY(prev)}" y2="${yt}" stroke="${KCOL.rapid}" stroke-width="1.4" stroke-dasharray="3 2"/>`;
      }
      dips.forEach((d, k) => { g += tlHole(x0 + SLOT*k/dips.length, x0 + SLOT*(k+1)/dips.length, toY, d, CLIP); });
      tip = (TL_HOLE[dips[0].cyc] || "Drilling") + (dips[0].cyc ? ` (${dips[0].cyc})` : "") + `, to Z ${dips[0].z.toFixed(3)}`
        + (dips[0].ret > 0 && dips[0].q > 0 ? (dips[0].cyc==="G73" ? `. Backs off about ${dips[0].ret} after each peck` : `. Rapids back down to about ${dips[0].ret} above the last peck`) + " (a machine setting, so shown with a grey band)" : "");
    } else if (mark==="ramp" || mark==="helix"){
      g += `<line x1="${x0}" x2="${x0+SLOT}" y1="${toY(prev ?? value)}" y2="${yv}" stroke="${col}" stroke-width="2"/>`;
      if (mark==="helix"){   // one flat loop per circuit, centered on the ramp; past three, a count
        const n = Math.max(1, Math.min(3, Math.round(step.turns))), rx = Math.max(2.2, SLOT/n*0.34);
        for (let k = 0; k < n; k++){
          const t = (k + 0.5)/n;
          g += `<ellipse cx="${(x0 + SLOT*t).toFixed(1)}" cy="${(toY(prev ?? value) + (yv - toY(prev ?? value))*t).toFixed(1)}" rx="${rx.toFixed(1)}" ry="2.4" fill="#fff" stroke="${col}" stroke-width="1.2"/>`;
        }
        if (Math.round(step.turns) > 3) {
          g += `<text x="${xm}" y="${Math.min(toY(prev ?? value), yv) - 4}" font-size="6.5" text-anchor="middle" fill="${col}" font-family="Consolas,monospace">×${Math.round(step.turns)}</text>`;
        }
      }
    } else {
      if (prev!==null && Math.abs(prev - value) > 1e-9) {
        g += `<line x1="${x0}" x2="${x0}" y1="${toY(prev)}" y2="${yv}" stroke="${col}" stroke-width="1.6"${dash}/>`;
      }
      g += `<line x1="${x0}" x2="${x0+SLOT}" y1="${yv}" y2="${yv}" stroke="${col}" stroke-width="${step.kind?2.2:1.2}"${dash}/>`;
      // A drilling cycle with many holes on one line (a pattern): a plunge per hole
      if (mode==="z" && !lathe) dips.forEach((d, k, all) => { const x = (x0 + SLOT*(k+1)/(all.length+1)).toFixed(1);
        g += `<line x1="${x}" x2="${x}" y1="${toY(Math.min(d.top, CLIP))}" y2="${toY(d.z)}" stroke="${KCOL.cyc}" stroke-width="1.6" stroke-linecap="round"/>`; });
    }
    if (mark==="M00" || mark==="M01") {
      g += `<rect x="${xm-3.5}" y="${yv-3.5}" width="7" height="7" fill="${mark==="M00" ? "#2b2f36" : "#fff"}" stroke="#2b2f36" stroke-width="1.3"/>`;
    }
    if (mark==="engrave"){   // a grey box from R down to the depth
      const yz = toY(Math.min(step.engZ, CLIP)), y0 = Math.min(yv, yz), hh = Math.max(2, Math.abs(yz - yv));
      g += `<rect x="${(x0+SLOT*0.2).toFixed(1)}" y="${y0.toFixed(1)}" width="${(SLOT*0.6).toFixed(1)}" height="${hh.toFixed(1)}" fill="#b4bcc6" stroke="${KCOL.engrave}" stroke-width="1"/>`;
    }
    if (mark==="dwell") g += `<circle cx="${xm}" cy="${yv}" r="3.4" fill="#fff" stroke="#2b2f36" stroke-width="1.3"/>`;
    if (mark==="spindle") g += `<rect x="${xm-2.4}" y="${yv-2.4}" width="4.8" height="4.8" fill="#2b2f36" transform="rotate(45 ${xm} ${yv})"/>`;
    if (mark==="tool"){
      const tw = (doc[step.li] || []).find(w => /^T\d/.test(w)), tn = tw ? "T" + parseInt(tw.slice(1)) : "T";
      g += `<line x1="${xm}" x2="${xm}" y1="${yv}" y2="11" stroke="#5b6b82" stroke-width="1.1"/><rect x="${xm-8}" y="1" width="16" height="9" rx="2" fill="#5b6b82"/><text x="${xm}" y="8" font-size="6.5" text-anchor="middle" fill="#fff" font-weight="700" font-family="Consolas,monospace">${tn}</text>`;
    }
    if (mark==="home") {
      g += `<line x1="${xm}" x2="${xm}" y1="${yv}" y2="6" stroke="${KCOL.rapid}" stroke-width="1.3" stroke-dasharray="3 2"/><path d="M${xm-4},7 L${xm},3 L${xm+4},7 M${xm-4},1.5 H${xm+4}" fill="none" stroke="#2b2f36" stroke-width="1.3"/>`;
    }
    if (mark==="end") {
      g += `<line x1="${x0+SLOT-5}" x2="${x0+SLOT-5}" y1="3" y2="${height-bot}" stroke="#2b2f36" stroke-width="1"/><line x1="${x0+SLOT-2}" x2="${x0+SLOT-2}" y1="3" y2="${height-bot}" stroke="#2b2f36" stroke-width="2.4"/>`;
    }
    if (tip) g += `<title>${esc(tip)}</title>`;
    g += "</g>";
    if (pos && step.v > CLIP + 1e-9 && mark!=="tool" && mark!=="home") {
      g += `<text x="${toX(i)+SLOT/2}" y="${toY(value)-3}" font-size="7" text-anchor="middle" fill="#9a9a9a">↑</text>`;
    }
    const nw = doc[step.li]?.[isBlockDel(doc[step.li]) ? 1 : 0]; const lab = /^N\d+$/.test(nw||"") ? nw : "L" + (step.li+1);
    const cur = isCur(step, i);
    if (cur || i % 2 === 0) {
      g += `<text x="${toX(i)+SLOT/2}" y="${height-6}" font-size="${cur?8:6.5}" text-anchor="middle" fill="${cur?"#d13438":"#9a9a9a"}" font-weight="${cur?700:400}" font-family="Consolas,monospace">${lab}</text>`;
    }
    prev = endOf(step, i);
    ends[i] = prev;
  });
  g += tlDot(steps, idx, sim, toX, toY, mode, lathe, CLIP, vals, ends);
  if (!pos) g += `<text x="${half-6}" y="${toY(0)-3}" font-size="7.5" text-anchor="end" fill="#8a8a8a" font-family="Consolas,monospace">0</text>`;
  svg.innerHTML = g;
  $("tlgrid").innerHTML = grid.labels;
  tlShift = -(idx*SLOT + SLOT/2);
  svg.style.transform = `translateX(${tlShift}px)`;
  const st = steps[idx], ls = st ? lineState[st.li] || {} : {};
  const at = st ? ` at ${/^N\d+$/.test(doc[st.li]?.[0]||"") ? doc[st.li][0] : "line "+(st.li+1)}` : "";
  const unit = mode==="feed" ? FEED_UNIT[ls.feed]?.[ls.units] || "" : mode==="speed" ? "rpm" : "";
  const now = !st ? "" : mode==="feed" ? `${word(numWord("F", st.f), ls).e} ${unit}` : mode==="speed" ? `${word(numWord("S", st.s), ls).e} ${unit}` : `${lathe ? "X" : "Z"} ${(lathe ? st.v*2 : st.v).toFixed(3)}` + (mode==="z" && st.dips?.length ? `, drills to Z ${st.dips[0].z.toFixed(3)}` : "");
  $("tlnow").textContent = st ? now.trim() + (processDef ? (st.on ? ", torch on" : ", torch off") : "") + at : "";
}
$("tl-mode").addEventListener("change", e => {
  tlMode[mtype()] = e.target.value;
  window.saveTimelineModes?.({ ...tlMode });
  drawTimeline(tlSteps, mtype()==="lathe");
});
$("tl").addEventListener("click", e => {
  const box = e.currentTarget.getBoundingClientRect();
  const i = Math.floor((e.clientX - box.left - tlShift - box.width/2) / SLOT);
  if (tlSteps[i]) selectLine(tlSteps[i].li);
});

// The speed list: how many seconds of the program run in a second, or Max (as fast as the screen draws, by moves)
function simSpeed(){ return $("s-speed").value==="max" ? Infinity : +$("s-speed").value; }
// The program time at the tool's position: playing, where it's got to; otherwise the end of the selected line
let simPart = null;   // the move under way while playing: { i: its index, f: how far along it, 0 to 1 }
function simTimeNow(){
  const tm = EXEC.time; if (!tm?.tAt) return null;
  if (simIdx!=null){
    const i = Math.min(simIdx, EXEC.segs.length), base = tm.tAt[i];
    return simPart && simPart.i===i && i < EXEC.segs.length ? base + simPart.f*(EXEC.segs[i].t || 0) : base;
  }
  const st = EXEC.steps[stepIndexFor(curLine)]; return st ? tm.tAt[st.s1] : 0;
}
function simTimeSpan(){
  const tm = EXEC.time; if (!tm || !(tm.total > 0)) return "";
  const why = `Estimated from the moves' lengths and the programmed feeds and speeds, without acceleration, tool changes or spindle start, so a real run takes a bit longer.`
    + ` Cutting ${fmtTime(tm.feed)}, rapids ${fmtTime(tm.rapid)}, dwells ${fmtTime(tm.dwell)}.`
    + (Object.keys(tm.byTool).length > 1 ? " By tool: " + Object.entries(tm.byTool).map(([k, v]) => `${k} ${fmtTime(v)}`).join(", ") + "." : "")
    + (tm.assumedRapid ? ` Rapids are timed at ${RAPID_DEFAULT} in/min: set your machine's rapid rate in its profile (Machines…).` : "")
    + (tm.noFeed ? ` ${tm.noFeed} feed move${tm.noFeed===1 ? " has" : "s have"} no feed rate and count as no time.` : "")
    + (tm.noSpeed ? ` ${tm.noSpeed} feed-per-rev move${tm.noSpeed===1 ? " has" : "s have"} no spindle speed and count as no time.` : "");
  return `<span class="stime" title="${esc(why)}"><b>Time</b>${fmtTime(simTimeNow())} / ${fmtTime(tm.total)}${tm.noFeed || tm.noSpeed ? " ?" : ""}</span>`;
}
function simLineFollow(){ simFollow(stepAtSeg(simIdx)); }
// The step that made move idx-1 (the last move drawn), or the first step before any move.
function stepAtSeg(idx){
  const st = EXEC.steps;
  if (idx <= 0) return 0;
  for (let k = 0; k < st.length; k++) if (st[k].s0 <= idx-1 && idx-1 < st[k].s1) return k;
  return st.length - 1;
}
// The editor row that shows step st (see simKey).
function simRowKey(st){
  const c = st?.calls || [];
  if (!st) return null;
  if (!c.length){ const h = foldHiding(st.li); return "m" + (h >= 0 ? h : st.li); }
  if (!expanded.has(c[0])) return "m" + c[0];
  const j = c.length > 1 ? c[1] : st.li, h = foldHiding(j, doc[c[0]]);
  return "x" + c[0] + "-" + (h >= 0 ? h : j);
}
const rowLi = key => key[0]==="m" ? +key.slice(1) : +key.split("-")[1];
// How far through its call (0 to 1) step k is, for the progress bar on a collapsed call.
// depth 0 is a call from the main program, 1 a call made inside that subprogram.
function callProgress(k, depth = 0){
  const st = EXEC.steps, deep = j => (st[j]?.calls?.length || 0) > depth; if (!deep(k)) return null;
  let a = k, b = k; while (a > 0 && deep(a-1)) a--; while (b < st.length-1 && deep(b+1)) b++;
  return (k - a + 1) / (b - a + 1);
}
const barTitle = key => callProgress(simK, key[0]==="x" ? 1 : 0)==null && foldScan().end[rowLi(key)] >= 0 ? "Running the folded moves" : "Running the subprogram this line calls";
// How far through what row "key" stands for step k is: a collapsed call (above), or a closed fold of moves, where it's
// the share of the run of steps on the fold's lines (in the same call) that are done.
function rowProgress(k, key){
  const ins = key[0]==="x", pc = callProgress(k, ins ? 1 : 0); if (pc!=null) return pc;
  const st = EXEC.steps, s = st[k]; if (!s) return null;
  const h = rowLi(key), ctx = ins ? doc[+key.slice(1).split("-")[0]] : null, F = foldScan(), e = F.end[h];
  if (e < 0 || !foldClosed(h, ctx)) return null;
  const depth = (s.calls || []).length, same = j => st[j] && st[j].li >= h && st[j].li <= e && (st[j].calls || []).length===depth;
  if (!same(k)) return null;
  let a = k, b = k; while (a > 0 && same(a-1)) a--; while (b < st.length-1 && same(b+1)) b++;
  return (k - a + 1) / (b - a + 1);
}
// Moves the editor to the row for step k, scrolling only when the row changes; the bar on a collapsed call just grows.
function simFollow(k, force){
  const st = EXEC.steps[k]; simK = st ? k : null;
  const key = simRowKey(st);
  if (key && (force || key!==simKey)){ simKey = key; curLine = rowLi(key); renderCursor(); scrollToLn(ed.querySelector(`.ln[data-key="${key}"]`)); return; }
  const bar = ed.querySelector(`.ln[data-key="${simKey}"] .xpbar i`), pr = rowProgress(k, simKey);
  if (bar && pr!=null){ touchRow(bar); bar.style.width = (pr*100).toFixed(1) + "%"; }
  drawViews();
}
// The next M00 (or M01 with optional stop on) the tool reaches between move from and move to, not yet paused at.
function nextStop(from, to){
  const k = EXEC.steps.findIndex((s, k) => (s.stop==="M00" || (s.stop==="M01" && simOpt)) && !simStops.has(k) && s.s0 >= from && s.s0 <= to);
  return k < 0 ? null : k;
}
// After the last move the simulation still reads the lines up to the program end (M05, G28, M30…), so it
// finishes on the M30 line, not on the last line that moves.
function simFinish(){
  clearInterval(simTimer); simTimer = null;
  const end = EXEC.steps[EXEC.steps.length-1];
  if (end) simFollow(EXEC.steps.length-1, true); else drawViews();
  const at = end ? (nWordOf(end.li) || "line " + (end.li+1)) : "";
  setMsg(end && isEnd(doc[end.li]) ? `Simulation finished at ${at}. ⏮ restarts it.` : "Simulation finished. ⏮ restarts it.");
}
function playSim(){
  if (editing && !commit()) return;
  if (simIdx==null || (simIdx >= EXEC.segs.length && nextStop(simIdx, simIdx)==null)){ simIdx = 0; simStops = new Set(); simPart = null; }
  simStopAt = null;
  clearInterval(simTimer);
  // The program's own clock (seconds): it runs at the chosen speed, and each move is drawn as far as the clock has
  // reached along it. A pause keeps the move under way; anything else that moves the tool starts its move afresh.
  const segs = EXEC.segs, tAt = EXEC.time?.tAt;
  let clock = tAt ? tAt[simIdx] + (simPart && simPart.i===simIdx && simIdx < segs.length ? simPart.f*(segs[simIdx].t || 0) : 0) : 0;
  let last = Date.now();
  simTimer = setInterval(() => {
    const now = Date.now(), dt = Math.min(0.25, (now - last)/1000), sp = simSpeed(); last = now;
    let to;
    if (!tAt || !isFinite(sp)){ to = Math.min(segs.length, simIdx + 1024); clock = tAt ? tAt[to] : 0; }
    else {
      clock += dt*sp; to = simIdx;
      while (to < segs.length && tAt[to] + (segs[to].t || 0) <= clock) to++;
    }
    const k = nextStop(simIdx, to);
    if (k!=null){
      const st = EXEC.steps[k]; simIdx = st.s0; simPart = null; simStops.add(k); simStopAt = k;
      clearInterval(simTimer); simTimer = null; simFollow(k, true);
      const at = nWordOf(st.li) || "line " + (st.li+1);
      setMsg(st.stop==="M00" ? `Program stop (M00) at ${at}. ▶ continues.` : `Optional stop (M01) at ${at}. ▶ continues.`);
      return;
    }
    simIdx = to;
    simPart = to < segs.length && tAt && segs[to].t > 0 ? { i:to, f:Math.max(0, Math.min(1, (clock - tAt[to])/segs[to].t)) } : null;
    if (simIdx >= segs.length){ simPart = null; return simFinish(); }
    simLineFollow();
  }, 50);
  render(); setMsg("Playing. Space pauses, → steps one line.");
}
function pauseSim(){ clearInterval(simTimer); simTimer = null; drawViews(); setMsg("Paused"); }
// After stepping by hand, stops before the tool count as passed and stops after it come up again.
function resetStops(){ simStopAt = null; simStops = new Set(EXEC.steps.flatMap((s, k) => s.stop && s.s0 < simIdx ? [k] : [])); }
function togglePlay(){ simTimer ? pauseSim() : playSim(); }
function stopSim(quiet){
  clearInterval(simTimer);
  simTimer = null;
  simStopAt = null;
  simK = simKey = null;
  if (simIdx!=null){ simIdx = null; if (!quiet) { render(); setMsg("Simulation closed"); } else setMsg(""); }
}   // quietly: no "Playing…" left behind
function simStep(dir){
  if (editing && !commit()) return;
  if (simTimer) pauseSim();
  const st = EXEC.steps;
  if (simIdx==null) simIdx = st[stepIndexFor(curLine)]?.s1 ?? 0;
  let last = false;   // stepping past the last move goes to the program end
  simPart = null;
  if (dir > 0){ const n = st.find(s => s.s1 > s.s0 && s.s0 >= simIdx); if (n) simIdx = n.s1; else last = st.length > 0; }
  else { const ps = st.filter(s => s.s1 > s.s0 && s.s1 < simIdx); simIdx = ps.length ? ps[ps.length-1].s1 : 0; }
  resetStops(); simFollow(last ? st.length-1 : stepAtSeg(simIdx), true);
}
function simReset(){
  if (simTimer) pauseSim();
  simIdx = 0; simPart = null;
  simStops = new Set();
  simStopAt = null;
  simFollow(0, true);
  ed.scrollTop = 0;
  setMsg("Back to the start. ▶ plays.");
}
$("s-play").onclick = togglePlay;
$("s-fwd").onclick = () => simStep(1);
$("s-back").onclick = () => simStep(-1);
$("s-reset").onclick = simReset;
function setSimOpt(on){
  simOpt = on; $("s-opt").setAttribute("aria-pressed", on);
  setMsg(on ? "Optional stop is on: the simulation pauses at M01 as well as M00." : "Optional stop is off: the simulation runs past M01 and pauses only at M00.");
}
function setSimBD(on){
  simBD = on; $("s-bd").setAttribute("aria-pressed", on);
  if (simIdx!=null){ const li = curLine; EXEC = interpret(); const k = stepIndexFor(li); simIdx = EXEC.steps[k]?.s0 ?? 0; simPart = null; simK = k; resetStops(); }
  render();
  setMsg(on ? "Block delete is on: lines that start with / are skipped." : "Block delete is off: lines that start with / run like any other.");
}
function setSimRapids(on){
  simRapids = on; showButtonState();
  drawViews();
  setMsg(on ? "Rapid moves are shown (dashed)." : "Rapid moves are hidden: the toolpath shows the cutting moves only.");
}
// Expanded view: the toolpath panel moves to the big area at the top left and back to the side panel.
function setSimX(on){
  simX = on;
  const panel = $("simpanel"), v1 = $("v1");
  $("main").classList.toggle("simx", on);
  if (on) $("simbig").appendChild(panel);
  else { $("side").prepend(panel); v1.setAttribute("viewBox", "0 0 278 128"); v1.setAttribute("height", "128"); }
  if (on) v1.removeAttribute("height");
  $("s-big").setAttribute("aria-pressed", on);
  $("s-big").textContent = on ? "⤡" : "⤢";
  $("s-big").title = on ? "Back to the normal view (Ctrl+Shift+E)" : "Expanded view (Ctrl+Shift+E)";
  render(); scrollToLn(ed.querySelector(`.ln[data-key="m${curLine}"]`));
  setMsg(on ? "Expanded view. Ctrl+Shift+E or ⤡ goes back." : "");
}
$("s-opt").onclick = () => setSimOpt(!simOpt);
$("s-bd").onclick = () => setSimBD(!simBD);
$("s-big").onclick = () => setSimX(!simX);
// The moves still to come: greyed, hidden or shown like the rest (Simulate › Toolpath, or the toolpath's Show button).
function setFuture(f){
  future = f; showButtonState();
  drawViews();
}
// The toolpath's Show button opens the toolpath settings (TOOLPATH_ITEMS in js/menus.js). It's highlighted while
// something is left out of the drawing (rapids or the moves still to come), so a part-drawn toolpath isn't a surprise.
function showButtonState(){
  const b = $("s-show"), off = [!simRapids && "rapid moves", future==="hide" && "moves after the selected line"].filter(Boolean);
  b.classList.toggle("on", off.length > 0);
  b.title = "What the toolpath shows" + (off.length ? `. Hidden now: ${off.join(" and ")}` : ": rapid moves, moves after the selected line, cutter comp side, colours");
}
$("s-show").onclick = e => popMenu(e.currentTarget, TOOLPATH_ITEMS);
window.addEventListener("resize", () => { if (simX && activeTab >= 0) drawViews(); });

$("probs-l").addEventListener("mousedown", e => {
  const r = e.target.closest(".pr");
  if (!r) return;
  e.preventDefault();
  selectLine(+r.dataset.li);
});
$("probs-c").addEventListener("mousedown", e => {
  const b = e.target.closest(".pf");
  if (!b) return;
  e.preventDefault();
  probFilter[b.dataset.f] = !probFilter[b.dataset.f];
  probsOpen = true;
  drawProblems();
});
function toggleProblems(open){ probsOpen = open ?? !probsOpen; drawProblems(); }
$("probs-tg").onclick = () => toggleProblems();
$("st-warn").onclick = () => toggleProblems(true);
function nextProblem(dir){
  const lines = [...new Set(PROBLEMS.filter(p => probFilter[p.sev]).map(p => p.li))];
  if (!lines.length){ setMsg("No problems in this file"); return; }
  const li = dir > 0 ? (lines.find(l => l > curLine) ?? lines[0]) : ([...lines].reverse().find(l => l < curLine) ?? lines[lines.length-1]);
  selectLine(li); const p = PBYLINE[li][0]; setMsg(`${p.title}: ${p.msg}`, p.sev!=="info");
}
