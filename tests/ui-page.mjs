// Loads the UI's scripts (src/ui/index.html) into Node without a browser, for the golden files and tests/test_ui.mjs.
// Every DOM call returns another stand-in, so the page's start-up code runs without drawing anything; only the
// pure functions (reading lines into words, gloss, checks) are used afterwards.
import { readFileSync } from "node:fs";
import vm from "node:vm";

export function loadPage(page = "src/ui/index.html"){
  const html = readFileSync(page, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const stub = new Proxy(function(){}, {
    get(t, k){ if (k===Symbol.iterator) return function*(){}; if (k===Symbol.toPrimitive) return () => 0; if (k==="length") return 0; if (k==="then") return undefined; return stub; },
    set(){ return true; }, apply(){ return stub; }, construct(){ return stub; }, has(){ return true; }
  });
  const ctx = { console, document:stub, navigator:stub, localStorage:stub, location:{ search:"", href:"" }, fetch:async () => ({ ok:false }),
    setTimeout:() => 0, setInterval:() => 0, clearInterval(){}, clearTimeout(){}, requestAnimationFrame(){}, getComputedStyle:() => stub,
    matchMedia:() => stub, addEventListener(){}, URLSearchParams, Math, JSON };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(scripts.join("\n;\n").replace(/^(const|let) /gm, "var ") + `
;globalThis.__api = { set doc(v){ doc = v; }, get view(){ return view; }, get lineState(){ return lineState; }, translateAll, checkProgram,
  splitBlocks, tokenize, use(id, s){ machineId = id; style = s; setDialect(); }, get syntax(){ return SYNTAX; }, MACHINES };`, ctx);
  const A = ctx.__api;
  // Reads a program's text the way the UI does and runs the gloss and checks on it.
  A.run = (text, machine, style = "long") => {
    A.use(machine, style);
    const doc = []; for (const line of text.split(/\r\n|\n|\r/)) A.splitBlocks(line).blocks.forEach(b => doc.push(A.tokenize(b)));
    A.doc = doc; A.translateAll();
    return { words:A.view.map(cells => cells.map(c => c.e)), problems:A.checkProgram(), modes:A.lineState };
  };
  return A;
}
