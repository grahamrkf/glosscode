/* Machines. GlossCode ships controls (RULES.dialects, one per programming manual) and a small library of known
   machine models. A machine is picked as machine type → control → machine:
   - every type and control has a Generic machine, gen.<type>.<control> ("Generic lathe", "Generic Okuma OSP-U10L
     / OSP-U100L lathe"), with no numbers and every option allowed;
   - the user's machine profiles (SETTINGS.machines, kept in settings.json) name a type and a control and add the
     numbers and options from their own spec sheet;
   - MACHINE_LIBRARY holds models whose specs we're confident of (numbers left empty when we aren't). Picking one
     adds it to the user's profiles, where it can be filled in or left as it is.
   MACHINES holds all three by id, so a program opens with whatever machine it was last used with. */
const MACHINE_TYPES = Object.keys(RULES.machineTypes);
const typeLabel = t => RULES.machineTypes[t]?.label || t;
const controlLabel = c => RULES.dialects[c]?.label || c;
// The controls for a machine type: those with a table for it (Generic first, then by name).
function controlsFor(type){
  const D = RULES.dialects;
  return Object.keys(D).filter(c => c!=="generic" && D[c][type]).sort((a, b) => controlLabel(a).localeCompare(controlLabel(b))).reduce((o, c) => (o.push(c), o), D.generic?.[type] ? ["generic"] : []);
}
const genId = (type, ctrl) => `gen.${type}.${ctrl}`;
const MACHINE_LIBRARY = {
  haas_vf2:     { name:"Haas VF-2",     type:"mill",  brand:"haas",  travel:[30, 16, 20], rpm:8100, feed:650, tools:20, macro:true, notes:"Haas published specifications (standard machine). Check your own machine's options." },
  haas_st10:    { name:"Haas ST-10",    type:"lathe", brand:"haas",  travel:[null, null, 14], rpm:6000, feed:null, tools:12, macro:true, liveTooling:false, yAxis:false, notes:"Haas published specifications (standard machine). X travel and feed not filled in." },
  okuma_m560:   { name:"Okuma M560-V",  type:"mill",  brand:"okuma", travel:[41.3, 22, 18.1], rpm:15000, feed:null, tools:32, notes:"Okuma published specifications (1050 × 560 × 460 mm). Feed not filled in." },
  okuma_lb3000: { name:"Okuma LB3000 EX II", type:"lathe", brand:"okuma", travel:[null, null, null], rpm:null, feed:null, tools:null, liveTooling:false, yAxis:false, notes:"Numbers not filled in: they depend on the chuck size and options." }
};
const MACHINES = {};
const USER_DATA = {};                // the user's own profiles by id, as saved in settings.json
const USER_MACHINES = new Set();     // their ids
function machineDefaults(m){
  return { travel:[null, null, null], rpm:null, feed:null, rapid:null, tools:null, eob:false, macro:false, liveTooling:false, yAxis:false, notes:"", ...m, travel:[...(m.travel || [null, null, null])] };
}
function rebuildMachines(user = USER_DATA){
  for (const k of Object.keys(MACHINES)) delete MACHINES[k];
  USER_MACHINES.clear();
  for (const t of MACHINE_TYPES) for (const c of controlsFor(t))
    MACHINES[genId(t, c)] = { name: c==="generic" ? `Generic ${typeLabel(t).toLowerCase()}` : `Generic ${controlLabel(c)} ${typeLabel(t).toLowerCase()}`, type:t, brand:c,
      travel:[null, null, null], rpm:null, feed:null, rapid:null, tools:null, eob:false, macro:true, liveTooling:true, yAxis:true, progTailstock:true, generic:true, notes:"" };
  for (const [id, m] of Object.entries(MACHINE_LIBRARY)) MACHINES[id] = { ...machineDefaults(m), lib:true };
  for (const [id, m] of Object.entries(user)){
    if (!m || typeof m!=="object" || !RULES.machineTypes[m.type] || !RULES.dialects[m.brand]) continue;
    MACHINES[id] = machineDefaults(m); delete MACHINES[id].lib; delete MACHINES[id].generic; USER_MACHINES.add(id);
  }
  for (const m of Object.values(MACHINES)) m.control = controlLabel(m.brand);
}
Object.assign(USER_DATA, /* samples */{
  // The mockup's example user: the machines the sample programs were written for. The program starts with none.
  haas_vf2:       { ...MACHINE_LIBRARY.haas_vf2, eob:false },
  fanuc_0imf:     { name:"Fanuc 0i-MF mill",    type:"mill",  brand:"fanuc", travel:[24, 16, 18], rpm:10000, feed:800, tools:24, eob:false, macro:true },
  fanuc_0mc:      { name:"Fanuc 0-MC mill",     type:"mill",  brand:"fanuc", travel:[20, 14, 16], rpm:6000, feed:400, tools:16, eob:true, macro:false },
  okuma_m560:     { ...MACHINE_LIBRARY.okuma_m560 },
  haas_st10:      { ...MACHINE_LIBRARY.haas_st10 },
  hyp_plasma:     { name:"Hypertherm plasma table", type:"plasma", brand:"hypertherm", travel:[60, 120, 4], rpm:0, feed:600, tools:0, eob:false },
  acorn_plasma:   { name:"Centroid Acorn plasma",   type:"plasma", brand:"centroid", travel:[48, 96, 4], rpm:0, feed:500, tools:0, eob:false },
  tormach_plasma: { name:"Tormach plasma",          type:"plasma", brand:"tormach", travel:[44, 44, 4], rpm:0, feed:400, tools:0, eob:false },
  okuma_lb3000:   { ...MACHINE_LIBRARY.okuma_lb3000 }
}/* end samples */ ?? {});
rebuildMachines();
let recentMachines = /* samples */["haas_vf2", "haas_st10", "okuma_m560"]/* end samples */ ?? [];
const machineLabel = id => `${MACHINES[id].name} (${MACHINES[id].type})`;
// The sample programs (samples.js, written from examples/ by scripts/make-ui-data.mjs). The program's build
// leaves samples.js out, since they are a separate download.
const FILES = typeof SAMPLES !== "undefined" ? SAMPLES.files : {};
