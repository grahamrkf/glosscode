/* ---------- How long the program takes: a time for each move ---------- */
/* Step A of the feed rate work: each move's time from its length and the programmed feed, with no acceleration.
   - Feed moves: length ÷ feed. G94 is per minute; G95 (and threading's lead) is per rev × the spindle speed;
     G96 works the speed out from the diameter at the middle of the move, capped by the G50 clamp or the
     machine's max spindle. A feed above the machine's max feed is capped to it.
   - Rapids: the longest axis's distance ÷ the rapid rate (a lathe's X counted as a radius), the same whether the
     control moves the axes together (Haas) or each at its own speed (Okuma). The rate is the machine profile's
     rapid, or RAPID_DEFAULT when it isn't filled in.
   - G04 dwells, and dwells at the bottom of G82/G89 holes. Pecks (G83 full retract, G73 chip break) add their
     extra rapid moves, and taps and bores (G84, G74, G85, G89) feed back out.
   Not counted yet: acceleration, corner slowdowns, tool changes, spindle start and coolant (step B). */
const RAPID_DEFAULT = 1000;   // in/min, when the profile has no rapid rate
const FEED_OUT = new Set(["G84", "G74", "G85", "G89", "G184"]);

// Fills in s.t (seconds) on every move, st.t and st.dw on every step, and returns EXEC.time: the totals, and
// tAt[i], the time move i starts (dwells included), for the simulation's playback.
function timeRun(ex){
  const segs = ex.segs, steps = ex.steps, m = MACHINES[machineId] || {}, lathe = mtype()==="lathe";
  const rapidIn = m.rapid > 0 ? m.rapid : RAPID_DEFAULT, maxFeedIn = m.feed > 0 ? m.feed : null, maxRpm = m.rpm > 0 ? m.rpm : null;
  const tAt = new Float64Array(segs.length + 1);
  const tot = { total:0, feed:0, rapid:0, dwell:0, noFeed:0, noSpeed:0, assumedRapid: !(m.rapid > 0), byTool:{} };
  let t = 0, done = 0;
  const num = w => { const v = w ? parseFloat(String(w).replace(/^[A-Z]+=?/, "")) : NaN; return isFinite(v) ? v : null; };
  for (const st of steps){
    const li = st.li, toks = doc[li] || [], ls = lineState[li] || {}, mm = ls.units==="mm", u = mm ? 25.4 : 1;
    // G04 on this line: P (milliseconds without a decimal point on Haas and Fanuc), or X / U seconds
    let dw = 0;
    if (toks.some(x => isCode(x, "G04"))){
      for (const L of DIALECT.dwellWords || ["P"]){
        const w = toks.find(x => x[0]===L && /^[A-Z][-+]?(\d+\.?\d*|\.\d+)$/.test(x)); if (!w) continue;
        dw = Math.abs(parseFloat(w.slice(1))); if (L==="P" && !w.includes(".") && DIALECT.dwellNoDecimal==="ms") dw /= 1000;
        break;
      }
    }
    // while a step runs moves that came before it in segs (a call's lines), the dwell still goes before its moves
    for (; done < st.s0 && done < segs.length; done++){ tAt[done] = t; t += segs[done].t || 0; }
    t += dw; tot.dwell += dw;
    let stT = dw;
    const def = DIALECT.cycles?.[ls.cycleCode];
    const lead = !!def?.leadF || (DIALECT.leadCodes || []).some(c => toks.some(x => isCode(x, c)) || ls.motion===c);
    const perRev = ls.feed==="perRev" || lead, css = ls.spin==="css";
    for (let i = st.s0; i < st.s1; i++){
      const s = segs[i], dx = (s.b.x - s.a.x)*(lathe ? 0.5 : 1), dy = (s.b.y || 0) - (s.a.y || 0), dz = s.b.z - s.a.z;
      let sec = 0;
      if (s.rapid){
        sec = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / (rapidIn*u) * 60;
        tot.rapid += sec;
      } else {
        const len = Math.hypot(dx, dy, dz), F = s.F ?? (st.f || null);
        let perMin = null;
        if (F > 0){
          if (perRev){
            let rpm = s.S ?? num(ls.S);
            if (css && lathe && rpm > 0){
              const d = Math.max(1e-6, Math.abs(s.a.x + s.b.x)/2), cap = s.clamp > 0 ? s.clamp : maxRpm;
              rpm = rpm*(mm ? 1000 : 12)/(Math.PI*d);
              if (cap) rpm = Math.min(rpm, cap);
            }
            if (rpm > 0) perMin = F*rpm; else tot.noSpeed++;
          } else perMin = F;
          if (perMin!=null && maxFeedIn && perMin > maxFeedIn*u) perMin = maxFeedIn*u;
        }
        if (perMin > 0) sec = len/perMin*60; else if (len > 1e-9) tot.noFeed++;
        // canned cycle holes: the pecks' extra rapids, a feed back out, a dwell at the bottom
        if (s.hole){
          const depth = Math.abs(dz), q = s.q;
          if (q > 0 && (s.cyc==="G83" || s.cyc==="G73")){
            const n = Math.ceil(depth/q - 1e-9);
            const back = s.cyc==="G83" ? q*n*(n - 1) : 2*(n - 1)*(DIALECT.peckRetract?.G73?.[mm ? "mm" : "inch"] || 0.01);
            const r = back/(rapidIn*u)*60; sec += r; tot.rapid += r;
          }
          if (FEED_OUT.has(s.cyc)) sec *= 2;
          if (s.dw > 0){ sec += s.dw; tot.dwell += s.dw; }
        }
        tot.feed += sec - (s.hole && s.dw > 0 ? s.dw : 0);
      }
      s.t = sec; stT += sec;
      const tl = s.tool || "—"; tot.byTool[tl] = (tot.byTool[tl] || 0) + sec;
    }
    for (; done < st.s1 && done < segs.length; done++){ tAt[done] = t; t += segs[done].t || 0; }
    st.t = stT; st.dw = dw;
  }
  for (; done < segs.length; done++){ tAt[done] = t; t += segs[done].t || 0; }
  tAt[segs.length] = t;
  tot.total = t;
  Object.defineProperty(tot, "tAt", { value:tAt, enumerable:false });   // left out of the golden files
  return tot;
}
// 754 s → "12:34"; an hour or more → "1:02:03"
function fmtTime(sec){
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec/3600), mn = Math.floor(sec/60)%60, s = sec%60, two = v => String(v).padStart(2, "0");
  return h ? `${h}:${two(mn)}:${two(s)}` : `${mn}:${two(s)}`;
}
