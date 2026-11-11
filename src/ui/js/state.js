let fileName = "", machineId = "haas_vf2";
let VIEWWIN = null, VIEWT = null, boxMode = false;   // toolpath zoom and pan (see viewVisible)
// Open programs, one per tab (see js/tabs.js). activeTab is -1 on the home page.
// The globals below always hold the active tab's program; switching tabs swaps them.
let TABS = [], activeTab = -1, docVer = 0, VER_SEQ = 0;
let style = "words", showMode = "both";
let colorBy = "motion", future = "grey";
let doc = [], view = [], lineState = [], curLine = 0, editing = null;
let fileEob = false;
let expanded = new Set(), autoN = true, selAnchor = null;   // selAnchor: the other end of a selection of whole lines
const N_STEP = 10;
let undoStack = [], redoStack = [];
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
