/* ---------- Menus ---------- */
function setShow(m){
  if (editing) commit();
  showMode = m;
  render();
}
// Menu items: { label, fn, sc } runs fn; R(...) is one of a set of choices (a dot, only one is picked);
// T(...) is an on/off setting (a tick box); { label, sub:[...] } opens a submenu; "-" a separator; { grp } a heading.
const R = (label, on, fn, sc) => ({ label, check:on, radio:true, fn, ...(sc ? { sc } : {}) });
const T = (label, on, fn, sc) => ({ label, check:on, fn, ...(sc ? { sc } : {}) });
// The toolpath and timeline settings, in Simulate › Toolpath and the toolpath's Show button.
const TOOLPATH_ITEMS = [
  T("Rapid moves (G00)", () => simRapids, () => setSimRapids(!simRapids)),
  T("Cutter comp side (G41/G42)", () => compBand, () => { compBand = !compBand; drawViews(); setMsg(compBand ? "Moves with cutter comp show a grey band on the side the tool's centre is on." : "Cutter comp bands hidden."); }),
  "-", { grp:"Moves after the selected line" },
  R("Grey", () => future==="grey", () => setFuture("grey")),
  R("Hidden", () => future==="hide", () => setFuture("hide")),
  R("Shown", () => future==="show", () => setFuture("show")),
  "-", { grp:"Colour moves by" },
  R("Move type", () => colorBy==="motion", () => { colorBy = "motion"; drawViews(); }),
  R("Tool", () => colorBy==="tool", () => { colorBy = "tool"; drawViews(); })
];
const MENUS = {
  File: [],   // built by the tabs script below, since it lists recent files
  Edit: [
    { label:"Undo", sc:"Ctrl+Z", fn:undo, dis:() => !undoStack.length },
    { label:"Redo", sc:"Ctrl+Y", fn:redo, dis:() => !redoStack.length },
    "-",
    { label:"Cut lines", sc:"Ctrl+X", fn:() => copyFromMenu(true) },
    { label:"Copy lines", sc:"Ctrl+C", fn:() => copyFromMenu(false) },
    { label:"Paste", sc:"Ctrl+V", fn:pasteFromMenu },
    { label:"Duplicate lines", sc:"Ctrl+D", fn:duplicateLines },
    { label:"Select all lines", sc:"Ctrl+A", fn:selectAllLines },
    "-",
    { label:"Find…", sc:"Ctrl+F", fn:openFind },
    { label:"Find next", sc:"F3", fn:() => findNext(1), dis:() => !findQ },
    "-",
    { label:"New line below", sc:"Ctrl+Enter", fn:() => newLine(curLine) },
    { label:"Delete lines", sc:"Ctrl+Shift+K", fn:deleteLine }
  ],
  View: [
    R("Gloss and code", () => showMode==="both", () => setShow("both")),
    R("Gloss only", () => showMode==="en", () => setShow("en")),
    R("Code only", () => showMode==="gc", () => setShow("gc")),
    { label:"Gloss words", sub:[
      R("Full words (spindle.fwd)", () => style==="words", () => { style = "words"; render(); }),
      R("Short words (SFWD)", () => style==="short", () => { style = "short"; render(); })
    ] },
    "-",
    T("Run order numbers", () => runNums, () => { runNums = !runNums; render(); setMsg(runNums ? "Each line shows its run order number (grey, left): the block count as the program runs, counting subprogram lines on every call." : "Run order numbers are hidden."); }),
    T("Problems panel", () => probsOpen, () => toggleProblems(), "Ctrl+Shift+M"),
    "-",
    { label:"Fold moves", sub:[
      { label:"Fold all", fn:() => foldAll(true) },
      { label:"Unfold all", fn:() => foldAll(false) },
      "-",
      T("Fold when a file opens", () => foldAuto, () => { foldAuto = !foldAuto; saveFoldPrefs(); setMsg(foldAuto ? "Opening a file folds the moves in sections too long for the window." : "Opening a file shows every line."); }),
      "-", { grp:"Count G01 as a rapid at" },
      R("10× the cutting feed", () => foldFast===10, () => setFoldFast(10)),
      R("5× the cutting feed", () => foldFast===5, () => setFoldFast(5)),
      R("3× the cutting feed", () => foldFast===3, () => setFoldFast(3)),
      R("Never (only G00)", () => foldFast===0, () => setFoldFast(0))
    ] },
    "-",
    { label:"Text size…", fn:() => openTextSize() },
    { label:"Zoom in", sc:"Ctrl+=", fn:() => zoomStep(1) },
    { label:"Zoom out", sc:"Ctrl+-", fn:() => zoomStep(-1) },
    { label:"Actual size", sc:"Ctrl+0", fn:() => zoomStep(0) }
  ],
  Insert: [],   // built by the Insert menu script below, since it follows the machine
  Program: [
    { label:"Sort words on this line", fn:() => sortWords("line") },
    { label:"Sort words in whole file", fn:() => sortWords("all") },
    "-",
    { label:"Next problem", sc:"F8", fn:() => nextProblem(1) },
    { label:"Previous problem", sc:"Shift+F8", fn:() => nextProblem(-1) },
    "-",
    { label:"Renumber", fn:renumber },
    T("Auto N on new lines", () => autoN, () => { autoN = !autoN; setMsg(autoN ? `New lines get the next free N number, counting by ${N_STEP}.` : "New lines get no N number."); }),
    "-",
    { label:"Show all subprograms", fn:() => { doc.forEach((t, i) => { if (callTarget(t)!=null || window.libFor?.(t)) expanded.add(i); }); render(); } },
    { label:"Hide all subprograms", fn:() => { expanded.clear(); render(); } }
  ],
  Simulate: [
    { label:"Play / Pause", sc:"F5", fn:togglePlay },
    { label:"Step forward one line", sc:"Ctrl+→", fn:() => simStep(1) },
    { label:"Step back one line", sc:"Ctrl+←", fn:() => simStep(-1) },
    { label:"Restart", fn:simReset },
    { label:"Stop simulating", sc:"Esc", fn:() => stopSim(), dis:() => simIdx==null },
    "-",
    T("Optional stop (M01)", () => simOpt, () => setSimOpt(!simOpt)),
    T("Block delete (/)", () => simBD, () => setSimBD(!simBD)),
    T("Expanded view", () => simX, () => setSimX(!simX), "Ctrl+Shift+E"),
    "-",
    { label:"Toolpath", sub:TOOLPATH_ITEMS }
  ],
  Help: [
    { label:"Canned cycle guide…", sc:"F1", fn:() => openCycleHelp(), doc:true },
    { label:"Keyboard shortcuts", fn:() => setMsg("Click a line to edit · ↑↓ line · Enter break line · Backspace at the start joins lines · Esc undo the line · Shift+↑↓ select lines · Ctrl+C/X/V copy, cut, paste · Ctrl+D duplicate · F1 cycle guide · F5 play · Ctrl+Z undo · Ctrl+F find · F8 next problem") },
    { label:"About the dictionary", fn:() => setMsg("Words come from gcode-words.json plus the selected machine's file.") }
  ]
};
const menubar = document.getElementById("menubar");
let openMenu = null, menuEl = null;
menubar.innerHTML = Object.keys(MENUS).map(m => `<span class="mi" data-m="${m}">${m}</span>`).join("")
  + `<span class="mchip" id="mchip" role="button" tabindex="0" aria-haspopup="menu" title="Machine profile"></span>`;
const HOME_MENUS = ["File", "View", "Help"];   // the menus that work on the home page; items marked doc:true need a program
// The HTML for a list of menu items. Each item's data-p is its path in the list ("3", or "5.2" inside a submenu).
function menuHTML(list, home, path = ""){
  return list.map((it, i) => {
    if (it==="-") return `<div class="sep"></div>`;
    if (it.grp) return `<div class="grp">${esc(it.grp)}</div>`;
    const p = path + i, dis = (it.dis && it.dis()) || (home && it.doc);
    if (it.sub) return `<div class="it sub${dis ? " dis" : ""}" data-p="${p}"><span class="ck"></span><span>${esc(it.label)}</span><span class="sc">▸</span>`
      + `<div class="menu submenu">${menuHTML(it.sub, home, p + ".")}</div></div>`;
    const ck = !it.check ? "" : `<i class="${it.radio ? "rd" : "tb"}${it.check() ? " on" : ""}"></i>`;
    return `<div class="it${dis ? " dis" : ""}" data-p="${p}" role="${it.check ? (it.radio ? "menuitemradio" : "menuitemcheckbox") : "menuitem"}"${it.check ? ` aria-checked="${!!it.check()}"` : ""}>`
      + `<span class="ck">${ck}</span><span>${esc(it.label)}</span><span class="sc">${it.sc || ""}</span></div>`;
  }).join("");
}
const itemAt = (list, p) => p.split(".").reduce((l, i, k, a) => k < a.length - 1 ? l[+i].sub : l[+i], list);
// Wires a menu element built from list: a click on an item runs it (submenus open on hover, by CSS).
function wireMenu(el, list, close){
  el.addEventListener("mousedown", e => {
    e.preventDefault();
    const it = e.target.closest(".it"); if (!it || it.classList.contains("dis") || it.classList.contains("sub")) return;
    const item = itemAt(list, it.dataset.p); close(); item.fn();
  });
}
function showMenu(name){
  closeMenu();
  const mi = menubar.querySelector(`[data-m="${name}"]`); mi.classList.add("open"); openMenu = name;
  menuEl = document.createElement("div"); menuEl.className = "menu"; menuEl.style.left = mi.offsetLeft + "px";
  const home = activeTab < 0;
  if (home && !HOME_MENUS.includes(name)){ menuEl.innerHTML = `<div class="grp">Open or create a program first</div>`; menubar.appendChild(menuEl); return; }
  const list = MENUS[name];
  menuEl.innerHTML = menuHTML(list, home);
  menubar.appendChild(menuEl);
  wireMenu(menuEl, list, closeMenu);
}
// A menu that drops down from a button (the toolpath's Show button). Clicking the button again, or anywhere else, closes it.
let popEl = null, popBtn = null;
function popMenu(btn, list){
  const again = popBtn===btn; closePop(); if (again) return;
  popEl = document.createElement("div"); popEl.className = "menu pop"; popBtn = btn;
  popEl.innerHTML = menuHTML(list, false);
  document.getElementById("app").appendChild(popEl);
  const b = btn.getBoundingClientRect(), a = document.getElementById("app").getBoundingClientRect(), w = popEl.offsetWidth;
  popEl.style.left = Math.max(4, Math.min(b.right - a.left - w, a.width - w - 4)) + "px";
  popEl.style.top = (b.bottom - a.top + 2) + "px";
  btn.setAttribute("aria-expanded", "true");
  wireMenu(popEl, list, closePop);
}
function closePop(){ popEl?.remove(); popEl = null; popBtn?.setAttribute("aria-expanded", "false"); popBtn = null; }
document.addEventListener("mousedown", e => { if (popEl && !popEl.contains(e.target) && !popBtn.contains(e.target)) closePop(); }, true);
document.addEventListener("keydown", e => { if (popEl && e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); closePop(); } }, true);
function closeMenu(){ menuEl?.remove(); menuEl = null; menubar.querySelectorAll(".open").forEach(x => x.classList.remove("open")); openMenu = null; }
menubar.addEventListener("mousedown", e => { const mi = e.target.closest(".mi"); if (!mi) return; e.preventDefault(); openMenu===mi.dataset.m ? closeMenu() : showMenu(mi.dataset.m); });
menubar.addEventListener("mouseover", e => { const mi = e.target.closest(".mi"); if (mi && openMenu && openMenu!==mi.dataset.m) showMenu(mi.dataset.m); });
document.addEventListener("mousedown", e => { if (openMenu && !menubar.contains(e.target)) closeMenu(); });

/* ---------- Keyboard ---------- */
// A click on a blank part of a panel leaves the focus on the page itself, outside #app, so its keys (Space, F5, the
// arrows) would go nowhere. They're passed on to the editor instead.
document.addEventListener("keydown", e => {
  if (e.target!==document.body || activeTab < 0) return;
  const c = new KeyboardEvent("keydown", { key:e.key, code:e.code, ctrlKey:e.ctrlKey, shiftKey:e.shiftKey, altKey:e.altKey, metaKey:e.metaKey, repeat:e.repeat, bubbles:true, cancelable:true });
  if (!ed.dispatchEvent(c)) e.preventDefault();
});
document.getElementById("app").addEventListener("keydown", e => {
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (activeTab < 0 && !(ctrl && (k==="o" || k==="n"))) return;   // the home page has no program
  if (!cdlg.hidden){ if (e.key==="Escape" || e.key==="F1"){ e.preventDefault(); cdlg.hidden = true; ed.focus({preventScroll:true}); } return; }
  if (e.key==="F1"){ e.preventDefault(); openCycleHelp(); return; }
  if (e.key==="F5"){ e.preventDefault(); if (editing && !commit()) return; togglePlay(); return; }
  if (ctrl && k==="f"){ e.preventDefault(); openFind(); return; }
  if (e.key==="F3"){ e.preventDefault(); findNext(e.shiftKey ? -1 : 1); return; }
  if (e.key==="F8"){ e.preventDefault(); if (editing && !commit()) return; nextProblem(e.shiftKey ? -1 : 1); return; }
  if (ctrl && e.shiftKey && k==="m"){ e.preventDefault(); toggleProblems(); return; }
  if (ctrl && e.shiftKey && k==="e"){ e.preventDefault(); if (editing && !commit()) return; setSimX(!simX); return; }
  if (ctrl && k==="o"){ e.preventDefault(); openDlg(); return; }
  if (ctrl && k==="s"){ e.preventDefault(); e.shiftKey ? saveAs() : save(); return; }
  if (editing || e.target===findq) return;
  // While the simulation is open, Space plays and pauses it (as the status bar says), wherever the focus is except a
  // button, list or box, which Space works itself (on the ▶ button that's the same thing).
  if (e.key===" " && !ctrl && !e.altKey && simIdx!=null && !e.target.closest?.("button, select, input, textarea")){ e.preventDefault(); togglePlay(); return; }
  if (ctrl && k==="z" && !e.shiftKey){ e.preventDefault(); undo(); return; }
  if (ctrl && (k==="y" || (k==="z" && e.shiftKey))){ e.preventDefault(); redo(); return; }
  if (ctrl && e.shiftKey && k==="k"){ e.preventDefault(); deleteLine(); return; }
  if (ctrl && k==="d"){ e.preventDefault(); duplicateLines(); return; }
  if (ctrl && e.key==="Enter"){ e.preventDefault(); newLine(curLine); return; }
  if (e.target!==ed) return;
  if (ctrl && e.key==="ArrowRight"){ e.preventDefault(); simStep(1); }
  else if (ctrl && e.key==="ArrowLeft"){ e.preventDefault(); simStep(-1); }
  else if (ctrl && k==="a"){ e.preventDefault(); selectAllLines(); }
  else if (e.shiftKey && e.key==="ArrowDown"){ e.preventDefault(); extendSel(Math.min(doc.length-1, curLine+1)); }
  else if (e.shiftKey && e.key==="ArrowUp"){ e.preventDefault(); extendSel(Math.max(0, curLine-1)); }
  else if (e.key==="ArrowDown"){ e.preventDefault(); moveLine(1); }
  else if (e.key==="ArrowUp"){ e.preventDefault(); moveLine(-1); }
  else if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)){ e.preventDefault(); startLineEdit(curLine, null, e.key==="ArrowLeft" || e.key==="Home" ? 0 : null); }
  else if (e.key==="Enter" && e.shiftKey){ e.preventDefault(); newLine(curLine); }
  else if (e.key==="Enter" || e.key===" "){ e.preventDefault(); editLineEnd(); }
  else if ((e.key==="Delete" || e.key==="Backspace") && selRange()){ e.preventDefault(); deleteLine(); }
  else if (e.key==="Delete" || e.key==="Backspace"){ e.preventDefault(); editLineEnd(); }
  else if (e.key==="Escape"){ if (openMenu) closeMenu(); else if (simIdx!=null) stopSim(); else clearSel(); }
  else if (!ctrl && !e.altKey && e.key.length===1 && /[A-Za-z0-9.(#+-]/.test(e.key)){ e.preventDefault(); editLineEnd(e.key); }
});

/* ---------- Toolbar ---------- */
function setPressed(a, b, on){ a.setAttribute("aria-pressed", on); b.setAttribute("aria-pressed", !on); }
// End of block: ";" goes after every line when the machine profile asks for it, or when the file already had them.
// The machine needs ; at the end of every block, so GlossCode adds it where a line doesn't already end with one.
// A ";" written in the file is a word on its line (it's always shown, and saved as written).
const eobOn = () => !!MACHINES[machineId].eob;
const lineText = t => (t.join(" ").replace(/^(\/\d?) /, "$1").replace(/ ;$/, ";")) + (eobOn() && t.length && t[t.length-1]!==";" && !(t.length===1 && t[0]==="%") ? ";" : "");
// What Save writes (the core does this in C): the G-code words only, one block per line, ";" if needed, CRLF.
function serialize(){ return doc.map(lineText).join("\r\n") + "\r\n"; }
function save(){
  if (activeTab < 0) return;
  if (editing) commit();
  if (window.GlossCodeNative) return nativeSave(false);
  const n = serialize().length;
  setMsg(`Saved ${fileName} (${n} bytes). Only the code is written, with CRLF line endings${eobOn() ? " and ; at the end of every line" : ""}.`);
  window.markSaved?.();
}
