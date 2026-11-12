/* ---------- Subprograms: go to, back, and the subprogram pane ----------
   A call line (Haas M97 P1000, Okuma CALL O1200, Klartext CALL LBL, Fagor LL/#CALL/(CALL), G65 library calls) has
   three buttons: "▸ show" lists the subprogram's lines under the call in the order they run (read only, and left
   out of copy), "Go to" moves the cursor to the subprogram, and "Beside" opens it in the pane to the right of the
   program, where its lines are edited like any other.
   - Go to (F12) remembers where it came from: a bar at the top of the editor, or Alt+←, goes back.
   - The pane (Alt+F12) shows one subprogram at a time with a trail of the calls that led to it (Program › N1000 ›
     N2000). A call inside the pane opens its subprogram one level deeper; a step of the trail goes back up to it;
     ✕ closes the pane. Opening a subprogram from the program itself starts the trail again.
   - A G65 library subprogram opens in the pane read only, with the values of the call that opened it.
   Each tab keeps its own pane trail and go-to history (subPane and backStack in js/state.js). */
(() => {
const pane = $("subpane"), body = $("sp-body"), trail = $("sp-trail"), backbar = $("backbar");
const MAX_BACK = 50;

// The buttons after "▸ show" on a call line. tgt is the subprogram's label, or null for a G65 library call.
window.callButtons = (li, tgt) => (tgt!=null ? `<button class="xp go" data-go="${li}" title="Go to ${esc(tgt)} (F12). Alt+← comes back.">Go to</button>` : "")
  + `<button class="xp go" data-beside="${li}" title="Open ${tgt!=null ? esc(tgt) : "the subprogram"} in a pane beside the program (Alt+F12)">Beside</button>`;

// A pane entry: { label } for a subprogram in this file, or { lib:li } for the library subprogram called on line li.
const entryFor = li => { const t = callTarget(doc[li]); return t!=null ? (subRange(t) ? { label:t, from:li } : null) : window.libFor?.(doc[li]) ? { lib:li, from:li } : null; };
const entryName = e => e.label ?? ("O" + (window.libFor(doc[e.lib])?.program ?? "?"));
const sameEntry = (a, b) => a && b && (a.label!=null ? a.label===b.label : a.lib===b.lib);

/* Go to and back */
function goToSub(li){
  const t = callTarget(doc[li]), rg = t!=null ? subRange(t) : null;
  if (!rg){ if (window.libFor?.(doc[li])) { openBeside(li, true); return; } setMsg("This line calls no subprogram in this file."); return; }
  backStack.push({ li, label:doc[li][0] || "line " + (li + 1) }); if (backStack.length > MAX_BACK) backStack.shift();
  selectLine(rg[0]); drawBackBar();
  setMsg(`At ${t}. Alt+← goes back to line ${li + 1}.`);
}
function goBack(){
  const b = backStack.pop(); if (!b) { setMsg("Nowhere to go back to."); return; }
  selectLine(Math.min(b.li, doc.length - 1)); drawBackBar();
}
function drawBackBar(){
  const b = backStack.at(-1);
  backbar.hidden = !b || activeTab < 0;
  if (b) $("bb-t").textContent = `Back to the call on line ${b.li + 1} (${b.label})`;
}
$("bb-t").addEventListener("click", goBack);
$("bb-x").addEventListener("click", () => { backStack.length = 0; drawBackBar(); ed.focus({ preventScroll:true }); });

/* The pane */
// Opens the subprogram called on line li in the pane. From the program it starts a new trail; from a line in the
// pane (deeper) it goes one level down, dropping any levels below that line's subprogram.
function openBeside(li, fromProgram, level){
  const e = entryFor(li); if (!e){ setMsg("No subprogram to show on this line."); return; }
  const tr = fromProgram ? [] : subPane.slice(0, (level ?? subPane.length - 1) + 1);
  if (sameEntry(tr.at(-1), e)) return drawSubPane();
  subPane = [...tr, e];
  drawSubPane(true);
}
// A click on a subprogram line shown under its call: open that subprogram in the pane, at the line clicked.
window.openBesideAt = (li, key) => {
  const call = +/^x(\d+)-/.exec(key || "")?.[1];
  if (isFinite(call)) openBeside(call, true);
  curLine = li; renderCursor();
  scrollToLn(body.querySelector(`.ln[data-key="m${li}"]`));
};
function closePane(){ subPane = []; drawSubPane(); ed.focus({ preventScroll:true }); }

// The rows of the subprogram at the end of the trail, drawn the way the editor draws its own.
window.drawSubPane = keepScroll => {
  drawBackBar();
  const on = activeTab >= 0 && subPane.length > 0;
  pane.hidden = !on; $("main").classList.toggle("withpane", on);
  if (!on){ body.innerHTML = ""; return; }
  // Drop levels whose subprogram is gone (deleted, or its label renamed)
  let k = subPane.findIndex(e => e.label!=null ? !subRange(e.label) : !window.libFor?.(doc[e.lib]));
  if (k===0){ subPane = []; pane.hidden = true; $("main").classList.remove("withpane"); return; }
  if (k > 0) subPane = subPane.slice(0, k);
  if (editing && editRoot===body && body.contains(editing.input)) return;   // a line is being typed in the pane: leave it be
  const top = subPane.at(-1), y = body.scrollTop;
  trail.innerHTML = `<button class="spc" data-lv="-1" title="Close the pane">Program</button>`
    + subPane.map((e, i) => `<span class="sps">›</span><button class="spc${i===subPane.length - 1 ? " on" : ""}" data-lv="${i}">${esc(entryName(e))}</button>`).join("");
  body.className = ed.className + " subed";
  if (top.lib!=null){
    $("sp-note").textContent = `Library subprogram, read only. Values from the call on line ${top.lib + 1}.`;
    body.innerHTML = (window.libRows(top.lib) || []).map(r => window.libRowHTML(r, top.lib)).join("");
  } else {
    const [s, e] = subRange(top.label);
    $("sp-note").textContent = `Lines ${s + 1} to ${e + 1}. Edits here change the program.`;
    let h = "";
    for (let li = s; li <= e; li++){
      const tgt = callTarget(doc[li]), lp = PBYLINE[li], worst = lp ? lp.reduce((a, p) => SEV_RANK[p.sev] > SEV_RANK[a] ? p.sev : a, "info") : null;
      const xp = tgt!=null ? (subRange(tgt) ? `<button class="xp go" data-deeper="${li}" title="Open ${esc(tgt)} here, one level down">▸ ${esc(tgt)}</button>` : `<span class="xp bad">${esc(tgt)} not found</span>`)
        : window.libFor?.(doc[li]) ? `<button class="xp go" data-deeper="${li}" title="Open the library subprogram here, one level down">▸ O${window.libFor(doc[li]).program}</button>` : "";
      const kind = lineKind(li), pmark = lp ? `<span class="pm ${worst}" title="${esc(lp.map(p => p.msg).join("\n"))}">${SEV_ICON[worst]}</span>` : "";
      const c = `ln${worst ? " p-" + worst : ""}${li===curLine ? " cur" : ""}${kind ? " k-" + kind : ""}`;
      h += textRowHTML({ li, key:"m" + li, c, pmark, eob:"", xp, num:li + 1 });
    }
    body.innerHTML = h;
  }
  if (keepScroll!==true) body.scrollTop = y;
  else body.scrollTop = 0;
};
// Only the cursor moved: move the mark in the pane too.
window.markSubPane = () => { if (pane.hidden) return; for (const r of body.children) r.classList.toggle("cur", +r.dataset.li===curLine && r.dataset.key?.[0]==="m"); };

trail.addEventListener("click", e => {
  const b = e.target.closest(".spc"); if (!b) return;
  const lv = +b.dataset.lv;
  if (lv < 0) return closePane();
  subPane = subPane.slice(0, lv + 1); drawSubPane(true);
});
$("sp-x").addEventListener("click", closePane);
body.addEventListener("mousedown", e => {
  if (e.button!==0) return;
  const d = e.target.closest("[data-deeper]");
  if (d){ e.preventDefault(); if (editing && !commit()) return; openBeside(+d.dataset.deeper, false); return; }
  const ln = e.target.closest(".ln[data-li]:not(.lib)"); if (!ln || e.target.tagName==="INPUT") return;
  e.preventDefault();
  if (editing && !commit()) return;
  const li = +ln.dataset.li, toks = doc[li], len = codeText(hasNcol(toks) ? toks.slice(1) : toks).length;
  editRoot = body;
  startLineEdit(li, "m" + li, caretAt(ln, e.clientX, len));
});
body.addEventListener("mouseover", e => {
  const w = e.target.closest("[data-wi]"), row = w?.closest(".ln");
  body.querySelectorAll(".hot").forEach(x => x.classList.remove("hot"));
  if (!w || !row || !w.textContent) return;
  row.querySelectorAll(`[data-wi="${w.dataset.wi}"]`).forEach(x => x.classList.add("hot"));
  if (!editing) showInfo(+row.dataset.li, +w.dataset.wi);
});
// The editor's buttons on a call line
ed.addEventListener("mousedown", e => {
  const g = e.target.closest("[data-go],[data-beside]"); if (!g || e.button!==0) return;
  e.preventDefault(); e.stopPropagation();
  if (editing && !commit()) return;
  if (g.dataset.go!=null) goToSub(+g.dataset.go); else openBeside(+g.dataset.beside, true);
}, true);

// Dragging the pane's left edge sets its width (remembered for the session).
const grip = $("sp-grip");
grip.addEventListener("mousedown", e => {
  e.preventDefault();
  const x0 = e.clientX, w0 = pane.getBoundingClientRect().width, z = parseFloat(document.documentElement.style.zoom) || 1;
  const move = ev => { pane.style.width = Math.max(220, Math.min(w0 + (x0 - ev.clientX) / z, $("edsplit").getBoundingClientRect().width / z - 200)) + "px"; };
  const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
  document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
});

// Keys: F12 go to, Alt+F12 open beside, Alt+← back.
$("app").addEventListener("keydown", e => {
  if (activeTab < 0) return;
  if (e.key==="F12"){ e.preventDefault(); if (editing && !commit()) return; e.altKey ? openBeside(curLine, true) : goToSub(curLine); }
  else if (e.altKey && e.key==="ArrowLeft" && !e.ctrlKey && !e.shiftKey){ e.preventDefault(); if (editing && !commit()) return; goBack(); }
});

MENUS.Program.push("-",
  { label:"Go to subprogram", sc:"F12", fn:() => goToSub(curLine), doc:true },
  { label:"Back to the call", sc:"Alt+←", fn:goBack, doc:true, dis:() => !backStack.length },
  { label:"Open subprogram beside", sc:"Alt+F12", fn:() => openBeside(curLine, true), doc:true },
  { label:"Close subprogram pane", fn:closePane, doc:true, dis:() => !subPane.length });
})();
