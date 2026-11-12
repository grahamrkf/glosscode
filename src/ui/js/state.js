/* ---------- Shared state and small helpers ----------
   Loaded before every other script except data.js, samples.js and machines.js. It holds what many files share:
   - $, showDialog, hideDialog, dialogKeys: finding elements and showing dialogs.
   - The open tabs (TABS, activeTab, newTab) and the active tab's values: doc (the program as lines of words),
     machineId, curLine, expanded, undoStack… read and write the active tab's object, so other files use them as
     plain variables.
   - View settings (style: full or short gloss words; showMode, colorBy) and the simulation's settings (simRapids,
     simBD for block delete…), plus view and lineState, which gloss.js works out from doc.
   - Small helpers used everywhere: esc (HTML-escape), pad2 (G1 to G01), sty and vw (a gloss word in the current
     style), mtype (mill, lathe…). */
// Dialogs. $ finds an element by id. showDialog shows a dialog (a .dim box in index.html) and moves the focus into
// it; hideDialog hides it and gives the focus back to the editor. dialogKeys keeps a dialog's keys from reaching the
// editor underneath, closes it on Escape, and passes any other key to onKey.
const $ = id => document.getElementById(id);
function showDialog(dlg, focus){
  dlg.hidden = false;
  focus?.focus();
}
function hideDialog(dlg){
  dlg.hidden = true;
  $("ed")?.focus({ preventScroll:true });
}
function dialogKeys(dlg, onEscape, onKey){
  dlg.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key==="Escape"){
      e.preventDefault();
      onEscape();
    } else onKey?.(e);
  });
}
let VIEWWIN = null, VIEWT = null, boxMode = false;   // toolpath zoom and pan (see viewVisible)
// Open programs, one per tab (see js/tabs.js). activeTab is -1 on the home page.
// Each tab is one object holding its program (newTab). The names fileName, machineId, doc, curLine, expanded,
// undoStack, redoStack, fileEob, docVer, subPane and backStack (js/subprograms.js) read and write the active tab's (on the home page, HOME's), so switching
// tabs only changes activeTab. What is worked out from the program (view, lineState, EXEC…) is redone on a switch.
let TABS = [], activeTab = -1, VER_SEQ = 0;
const newTab = (o = {}) => ({ name:"", machineId:"haas_vf2", doc:[], curLine:0, expanded:new Set(), undoStack:[], redoStack:[],
  fileEob:false, docVer:0, subPane:[], backStack:[], ...o });
const HOME = newTab();
for (const [name, key] of Object.entries({ fileName:"name", machineId:"machineId", doc:"doc", curLine:"curLine", expanded:"expanded",
    undoStack:"undoStack", redoStack:"redoStack", fileEob:"fileEob", docVer:"docVer", subPane:"subPane", backStack:"backStack" }))
  Object.defineProperty(globalThis, name, { get: () => (TABS[activeTab] || HOME)[key], set: v => { (TABS[activeTab] || HOME)[key] = v; } });
let style = "words", showMode = "both";
let colorBy = "motion", future = "grey";
let view = [], lineState = [], editing = null;
let autoN = true, selAnchor = null;   // selAnchor: the other end of a selection of whole lines
const N_STEP = 10;
let findQ = "";
let simIdx = null, simTimer = null;
// The step (line run) the simulation is on, and the editor row that shows it: the line itself, or, inside a
// subprogram call, the call's inserted row (or the call line, with a progress bar, while the call is collapsed).
let simK = null, simKey = null, runNums = true;
// Optional stop (M01) and block delete (/) switches, the expanded view, the stops already paused at in this run,
// and the stop the simulation is paused at now.
let simRapids = true, simOpt = false, simBD = false, simX = false, simStops = new Set(), simStopAt = null;
let compBand = true;   // View › Cutter comp side: the grey band on the side of the move the tool's centre is on
const isBlockDel = toks => /^\/\d?$/.test(toks?.[0] || "");
const nWordOf = li => (doc[li] || []).find(t => /^N\d+$/.test(t));
let EXEC = { segs:[], steps:[] };

const COLW = () => style === "short" ? 8 : 12;
// An entry's gloss word in the chosen style: full words (run.feed) or short (LIN). A library subprogram saved before
// full words existed has only "long", which stands in for its full word.
const sty = o => o?.[style] ?? o?.words ?? o?.long;
// A word with a value: full words are the name in lower case, a colon, then the value (speed:2100, movx:-0.4215);
// short words run the two together (S2100, iX0.5). Codes (spindle.fwd, SFWD) have no value and use sty alone.
const vw = (name, v) => style==="short" ? name + v : String(name).toLowerCase() + ":" + v;
const vsty = (o, v) => vw(sty(o), v);
const REPT = { words:"rept", short:"x" };   // a repeat count (L, NR)
const mtype = () => MACHINES[machineId].type;
// Control characters (the Ctrl+Z end-of-file mark) show as ^Z
// Smallest / largest of a list without spreading it into Math.min (a long program has more points than a call takes)
const minOf = (a, f = v => v) => { let m = Infinity; for (let i = 0; i < a.length; i++){ const v = f(a[i], i); if (v < m) m = v; } return m; };
const maxOf = (a, f = v => v) => { let m = -Infinity; for (let i = 0; i < a.length; i++){ const v = f(a[i], i); if (v > m) m = v; } return m; };
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, c => "^" + String.fromCharCode(c.charCodeAt(0) + 64));
const pad2 = w => w[0] + (w.slice(1).length < 2 ? "0" + w.slice(1) : w.slice(1));
const clean = v => v.endsWith(".") && v.length > 1 ? v.slice(0, -1) : v;
const isCode = (t, c) => /^[GM]\d/.test(t) && pad2(t) === c;
