// The block syntax of the current control (the dialect's blockSyntax). "fagor8060" (Fagor 8060/8065) reads ";" as a
// comment to the end of the line, not an end-of-block mark; a $ or # statement (#CALL SUB1, $GOTO N10), a %L local
// subroutine header, an LL call, an [NAME] label and an N10: label are one word each; XP1 (a word whose value is
// parameter P1) is one word. ( ) are comments, as on other controls.
// "fagor8055" (Fagor 8055) also reads ";" as a comment, but ( ) holds a statement, one word: (CALL 3), (P100 = P101 + 2),
// (IF (P1 EQ 2) GOTO N40). An N after the first word of a line is how many times to repeat it. A "%" line is the header.
let SYNTAX = "";
const semiComment = () => SYNTAX==="fagor8060" || SYNTAX==="fagor8055" || SYNTAX==="klartext";
const isComment = t => (t[0]==="(" && SYNTAX!=="fagor8055" && SYNTAX!=="klartext") || (t[0]===";" && t.length > 1) || (SYNTAX==="klartext" && t[0]==="*");
const isKw = t => /^[A-Z]{2,}/.test(t) && !/^N[A-Z]/.test(t) && !/^[A-Z]P\d+$/.test(t);   // CALL, RTS, GOTO (not an Okuma sequence name like NA1)
// ";" is the end-of-block mark on Fanuc-style controls. A line can hold several blocks, so split on it
// (outside comments). The marks themselves aren't kept: they're written back on save when the machine needs them.
function splitBlocks(line){
  if (semiComment()) return { blocks:[line], eob:false };   // Fagor: ";" starts a comment, so it never splits a line
  const out = []; let cur = "", depth = 0, hit = false;
  for (const ch of line){
    if (ch==="(") depth++; else if (ch===")") depth = Math.max(0, depth-1);
    if (ch===";" && !depth){ out.push(cur + ";"); cur = ""; hit = true; } else cur += ch;   // the ";" stays on its block, as written
  }
  if (cur.trim() || !out.length) out.push(cur);
  return { blocks: out, eob: hit };
}
// A "/" at the start of a block is block delete (Fanuc-style controls also take /1 to /9). It stays the line's first word.
// Macro text stays whole: "#110= -0.035" and Okuma's "V2 = V2+1" (assignments), and "IF [...] GOTO 10", "WHILE [...] DO1",
// "END1", "GOTO 10" (macro statements) are one word each. An assignment ends at a comment, or where another address word
// or assignment starts after a complete value ("#100=1 G00 Z1." is three words). A value can be a variable or an
// expression: "X - #101" is the word "X-#101", "Z[#1+#2]" stays whole, and Okuma's "X=XP1+1" is one word.
// An Okuma sequence name (N and up to four letters and digits, starting with a letter: NA1, NLAP1) is one word.
// Spaces inside these are dropped, except one between two letters or numbers ("#2 MOD 3") and single spaces in IF,
// WHILE and GOTO statements. gc_tokenize() in src/core/gc_doc.c mirrors this character for character.
const isMacroTok = t => t[0]==="#" || /^(?:IF|WHILE)(?![A-Z0-9_])|^GOTO |^END\d|^[A-Z][A-Z0-9]+=/.test(t);
const isVarVal = t => /^[A-Z](?:[-+]?[#[]|[-+][A-Z]|=|P\d)/.test(t);   // a word whose value is a macro variable or expression
function tokenize(line){
  if (SYNTAX==="klartext") return tokKlartext(line);
  const out = [], s = line, n = s.length, isWord = c => /[A-Za-z0-9_]/.test(c || ""), isSp = c => /[ \t\n\r\f\v]/.test(c || ""), SP = /[ \t\n\r\f\v]+/g;
  const isAl = c => /[A-Za-z]/.test(c || "");
  let i = 0; const bd = /^\s*(\/\d?)/.exec(s); if (bd){ out.push(bd[1]); i = bd[0].length; }
  const restOf = from => { let e = from; while (e < n && s[e]!=="(") e++; const raw = s.slice(from, e);
    return [e, raw.replace(SP, " ").replace(/^ | $/g, "").toUpperCase()]; };
  const squeeze = t => t.replace(SP, " ").replace(/^ | $/g, "").replace(/ (?![A-Za-z0-9_])|(?<![A-Za-z0-9_]) /g, "").toUpperCase();
  const group = from => { let d = 0, e = from; while (e < n){ if (s[e]==="[") d++; else if (s[e]==="]" && --d===0) return e+1; else if (s[e]==="(") return e; e++; } return e; };
  // "NAME =" at s[k]: an Okuma variable (or extended address) being set. Returns the length up to and including "=".
  const assignAt = k => { if (!isAl(s[k]) || isWord(s[k-1])) return 0; let e = k+1; while (isWord(s[e])) e++; if (e - k < 2) return 0; while (isSp(s[e])) e++; return s[e]==="=" && s[e+1]!=="=" ? e+1-k : 0; };
  // Where an expression starting at s[from] ends.
  const exprEnd = from => { let e = from, d = 0, last = "";
    while (e < n && s[e]!=="("){
      const ch = s[e];
      if (ch==="[") d++; else if (ch==="]") d--;
      else if (!d && isAl(ch) && (!isWord(s[e-1]) || /[\d.]/.test(s[e-1])) && /[A-Za-z0-9.\]]/.test(last)){
        let k = e+1; while (isSp(s[k])) k++;
        if (/[-+\d.#=]/.test(s[k] || "") || assignAt(e)) break;
      }
      if (!isSp(ch)) last = ch; e++;
    }
    return e; };
  if (SYNTAX==="fagor8060"){
    // A statement to the end of the line or a ";" comment: spaces outside quotes become one, letters outside quotes upper case
    const stmt = from => { let o = "", q = false, e = from;
      for (; e < n; e++){ const ch = s[e]; if (ch==='"') q = !q; if (!q && ch===";") break;
        if (!q && isSp(ch)){ if (o && o[o.length-1]!==" ") o += " "; continue; } o += q ? ch : ch.toUpperCase(); }
      return [e, o.replace(/ $/, "")]; };
    while (isSp(s[i])) i++;
    const lb = /^[Nn]\d+:/.exec(s.slice(i)); if (lb){ out.push(lb[0].toUpperCase()); i += lb[0].length; while (isSp(s[i])) i++; }
    const nm = /^\[[A-Za-z0-9_]+\]/.exec(s.slice(i)); if (nm){ out.push(nm[0].toUpperCase()); i += nm[0].length; while (isSp(s[i])) i++; }
    if (/^(?:[#$%]|[Ll][Ll]?[ \t]+[A-Za-z_])/.test(s.slice(i))){ const [e, t] = stmt(i); if (t) out.push(t); i = e; }
  }
  if (SYNTAX==="fagor8055"){   // The "%comment ,MX," header line, as written
    while (isSp(s[i])) i++;
    if (s[i]==="%"){ out.push(s.slice(i).replace(/[ \t\n\r\f\v]+$/, "")); i = n; }
  }
  while (i < n){
    const c = s[i];
    if (c===";" && semiComment()){ out.push(s.slice(i).replace(/[ \t\n\r\f\v]+$/, "")); break; }   // a comment to the end of the line
    // Fagor 8055: a statement to its matching ")", spaces outside quotes made single, letters outside quotes upper case
    if (c==="(" && SYNTAX==="fagor8055"){
      let o = "", d = 0, q = false, e = i;
      for (; e < n; e++){ const ch = s[e]; if (ch==='"') q = !q;
        if (!q){ if (ch==="(") d++; else if (ch===")" && --d===0){ o += ch; e++; break; }
          if (isSp(ch)){ if (o && o[o.length-1]!==" ") o += " "; continue; } }
        o += q ? ch : ch.toUpperCase(); }
      out.push(o.replace(/^\( /, "(").replace(/ \)$/, ")").replace(/ $/, "")); i = e; continue;
    }
    if (c==="("){ let e = i+1; while (e < n && s[e]!==")") e++; if (e < n) e++; out.push(s.slice(i, e)); i = e; continue; }
    if (c==="#"){ const e = exprEnd(i+1); out.push(squeeze(s.slice(i, e))); i = e; continue; }
    if (isSp(c)){ i++; continue; }
    // A corner word: ",C0.05" chamfers and ",R0.06" rounds the corner at the end of a G01 move (Fanuc style)
    if (c==="," && /[CRcr]/.test(s[i+1] || "") && /[-+\d.]/.test(s[i+2] || "")){ let e = i+2; if (s[e]==="-" || s[e]==="+") e++; while (e < n && /[\d.]/.test(s[e])) e++; out.push(s.slice(i, e).toUpperCase()); i = e; continue; }
    // Anything else that isn't a word ("%", ";", stray symbols or numbers) is kept as written, one word per run.
    if (!isAl(c)){ let e = i; while (e < n && !isSp(s[e]) && !isAl(s[e]) && s[e]!=="(" && s[e]!=="#") e++; out.push(s.slice(i, e)); i = e; continue; }
    if (!isWord(s[i-1])){
      const kw = /^(?:(IF|WHILE)(?![A-Za-z0-9_])|(END\d+)(?![A-Za-z0-9_])|(CALL|RTS|GOTO)(?![A-Za-z0-9_]))/i.exec(s.slice(i));
      if (kw?.[1] || (kw?.[3] && /^goto$/i.test(kw[3]) && /^[ \t]*[\d#[]/.test(s.slice(i+4)))){ const [e, t] = restOf(i); out.push(t); i = e; continue; }
      if (kw){ out.push(kw[0].toUpperCase()); i += kw[0].length; continue; }
      // Okuma graphic display statements at the start of a block (DEF WORK, PS LC,[..],[..], END, CLEAR, DRAW): one word each
      if ((!out.length || (out.length===1 && out[0][0]==="/")) && /^(?:DEF|PS|END|CLEAR|DRAW)(?![A-Za-z0-9_])/i.test(s.slice(i))){ const [e, t] = restOf(i); out.push(t); i = e; continue; }
      const as = assignAt(i);
      if (as){ const e = exprEnd(i+as); out.push(squeeze(s.slice(i, e))); i = e; continue; }
      const sq = /^[Nn]([A-Za-z][A-Za-z0-9]{0,3})(?![A-Za-z0-9_])/.exec(s.slice(i));
      if (sq){ out.push(sq[0].toUpperCase()); i += sq[0].length; continue; }
    }
    // Fagor: a letter and a parameter (XP1, GP0, FP100) is one word
    if (semiComment() && /[Pp]/.test(s[i+1] || "") && /\d/.test(s[i+2] || "")){ let e = i+2; while (e < n && /\d/.test(s[e])) e++; out.push(s.slice(i, e).toUpperCase()); i = e; continue; }
    // A letter, then a variable or [expression] (spaces and a sign allowed between), or "=" and an expression (Okuma),
    // or else a plain number
    let j = i+1; while (isSp(s[j])) j++;
    if (s[j]==="=" && s[j+1]!=="="){ const e = exprEnd(j+1); out.push(c.toUpperCase() + "=" + squeeze(s.slice(j+1, e))); i = e; continue; }
    let sign = ""; if (s[j]==="-" || s[j]==="+"){ sign = s[j++]; while (isSp(s[j])) j++; }
    if (sign && isAl(s[j])){ const e = exprEnd(j); out.push((c + sign).toUpperCase() + squeeze(s.slice(j, e))); i = e; continue; }   // Okuma: Z-V10
    if (s[j]==="#" || s[j]==="["){
      let e = j; if (s[e]==="#"){ e++; if (s[e]==="[") e = group(e); else while (e < n && /\d/.test(s[e])) e++; } else e = group(e);
      out.push((c + sign).toUpperCase() + squeeze(s.slice(j, e))); i = e; continue;
    }
    let e = i+1; if (s[e]==="-" || s[e]==="+") e++; while (e < n && /[\d.]/.test(s[e])) e++;
    out.push(s.slice(i, e).toUpperCase()); i = e;
  }
  return out;
}
// Reads a program's lines into the editor (the active tab). ";" marks are split off and remembered.
function loadLines(src, expand){
  stopSim(true);
  setDialect(); bumpRecent(machineId); drawMachineChip();
  fileEob = false; doc = [];
  for (const line of src){ const b = splitBlocks(line); if (b.eob) fileEob = true; b.blocks.forEach(x => doc.push(tokenize(x))); }
  if (!doc.length) doc.push([]);
  expanded = new Set();
  if (expand) doc.forEach((t, i) => { if (t[0]===expand) expanded.add(i); });
  undoStack = []; redoStack = []; docVer = ++VER_SEQ;
  curLine = 0; foldAutoPending = true;
}
// Opens one of the mockup's sample programs (in the app there are none: they're a separate download).
function load(name){ openSample(name); }
