/* ---------- Find (Ctrl+F) ----------
   The find bar looks for the text in every line's code words and gloss words (ignoring case), counts the hits and
   moves the current line to the next or previous one (Enter, Shift+Enter, F3). */
const findbar = $("findbar"), findq = $("findq");
function findHits(){
  if (!findQ) return [];
  const out = [];
  doc.forEach((toks, li) => {
    if (toks.some((t, i) => t.toUpperCase().includes(findQ) || (view[li][i]?.e || "").toUpperCase().includes(findQ))) out.push(li);
  });
  return out;
}
function updateFindCount(h){
  const c = $("fcnt");
  if (!findQ){ c.textContent = ""; return; }
  const i = h.indexOf(curLine);
  c.textContent = h.length ? (i >= 0 ? `${i+1} of ${h.length} lines` : `${h.length} line${h.length>1?"s":""}`) : "No matches";
}
function openFind(){ if (editing) commit(); findbar.hidden = false; findq.focus(); findq.select(); }
function closeFind(){ findbar.hidden = true; findQ = ""; findq.value = ""; render(); ed.focus({preventScroll:true}); }
function findNext(dir){
  const h = findHits(); if (!h.length) return;
  let n = dir > 0 ? h.find(li => li > curLine) : [...h].reverse().find(li => li < curLine);
  if (n===undefined) n = dir > 0 ? h[0] : h[h.length-1];
  selectLine(n); findq.focus();
}
findq.addEventListener("input", () => {
  findQ = findq.value.trim().toUpperCase();
  const h = findHits();
  if (h.length && !h.includes(curLine)){ curLine = h.find(li => li >= curLine) ?? h[0]; }
  render();
  scrollToLn(ed.querySelector(`.ln[data-key="m${curLine}"]`));
});
findq.addEventListener("keydown", e => {
  if (e.key==="Enter"){ e.preventDefault(); findNext(e.shiftKey ? -1 : 1); }
  if (e.key==="Escape"){ e.preventDefault(); closeFind(); }
});
$("f-next").onclick = () => findNext(1);
$("f-prev").onclick = () => findNext(-1);
$("f-x").onclick = closeFind;
